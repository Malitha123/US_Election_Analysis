"""Download and normalize openly published election returns and optional FRED series.

Raw files are intentionally downloaded at run time. This ZIP ships with clearly sourced
national historical summaries, not an unverified or fabricated county dataset.
"""
from __future__ import annotations
import argparse
import json
import sys
from tempfile import NamedTemporaryFile
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'
OUT = ROOT / 'data' / 'processed'
BASE = 'https://api.electiondata.dev/v1'
DATASETS = ['county-president','house-results','senate-results']
FRED_SERIES = {'UNRATE':'Unemployment rate (%)','CPIAUCSL':'Consumer price index','FEDFUNDS':'Federal funds rate (%)','UMCSENT':'Consumer sentiment index'}
STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()

def is_true(s):
    return str(s).strip().lower() in {'true','1','t','yes'}

def download(url: str, dest: Path, *, refresh=False):
    if dest.exists() and not refresh:
        print('Cached:', dest.name)
        return dest
    dest.parent.mkdir(parents=True,exist_ok=True)
    print('Downloading:', url)
    with requests.get(url,timeout=90,stream=True,headers={'User-Agent':'US-Electoral-Dynamics-Research/1.0'}) as r:
        r.raise_for_status()
        with dest.with_suffix(dest.suffix+'.part').open('wb') as f:
            for chunk in r.iter_content(1024*256):
                f.write(chunk)
    dest.with_suffix(dest.suffix+'.part').replace(dest)
    print('Saved:',dest.name,round(dest.stat().st_size/1024/1024,2),'MiB')
    return dest

def write_csv(frame, filename, **options):
    path = OUT / filename
    with NamedTemporaryFile(mode='w', encoding='utf-8', newline='', dir=OUT, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            frame.to_csv(handle, index=False, **options)
        except BaseException:
            handle.close()
            temporary.unlink()
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def require_columns(frame, columns):
    missing = set(columns) - set(frame.columns)
    if missing:
        raise ValueError(f'Missing required columns: {", ".join(sorted(missing))}')


def candidate_winners(df, race_keys, party_col):
    """Resolve fusion lines by max(candidate_total_votes); no double counting.
    Missing-vote contests are omitted rather than guessed.
    """
    df=df.copy()
    require_columns(df, [*race_keys, 'candidate', party_col, 'candidatevotes', 'candidate_total_votes'])
    df['candidate'] = df.candidate.fillna('').astype(str).str.strip()
    accounting = r'(?:|UNKNOWN|OTHER|TOTALS?|SCATTERING|BLANKS?|(?:TOTAL )?WRITE[ -]?INS?|(?:EXHAUSTED )?BALLOTS?(?: EXHAUSTED)?|(?:UNDER|OVER)[ -]?VOTES?)'
    df = df[~df.candidate.str.upper().str.fullmatch(accounting)].copy()
    df['votes'] = pd.to_numeric(df.candidate_total_votes, errors='coerce')
    df['line_votes'] = pd.to_numeric(df.candidatevotes, errors='coerce')
    aliases = {'DEMOCRAT':'D', 'DEMOCRATIC':'D', 'DEMOCRATIC PARTY':'D',
               'DEMOCRATIC-FARMER-LABOR':'D', 'DEMOCRATIC FARMER LABOR':'D', 'DFL':'D',
               'REPUBLICAN':'R', 'REPUBLICAN PARTY':'R'}
    party = df[party_col].astype(str).str.strip().str.upper().map(aliases)
    if 'party_detailed' in df:
        party = party.fillna(df.party_detailed.astype(str).str.strip().str.upper().map(aliases))
    df['party_label'] = party.fillna('Other')
    df['unofficial'] = df['unofficial'].map(is_true) if 'unofficial' in df else False
    keys = race_keys + ['candidate']
    candidate = df.groupby(keys, dropna=False, as_index=False).agg(
        votes=('votes','max'),
        lines=('line_votes',lambda votes: votes.sum(min_count=1)),
        party=('party_label',lambda labels: next((p for p in labels if p != 'Other'), 'Other')),
    )
    candidate['votes'] = candidate.votes.fillna(candidate.lines)
    valid=candidate.dropna(subset=['votes']).copy()
    if valid.empty:return pd.DataFrame(columns=race_keys+['winner','winner_party','winner_votes','top_two_margin_votes','status','source_url','note'])
    valid=valid.sort_values(race_keys+['votes','candidate'],ascending=[True]*len(race_keys)+[False,True])
    valid['rank']=valid.groupby(race_keys).cumcount()
    first=valid.loc[valid['rank']==0,race_keys+['candidate','party','votes']].rename(columns={'candidate':'winner','party':'winner_party','votes':'winner_votes'})
    second=valid.loc[valid['rank']==1,race_keys+['votes']].rename(columns={'votes':'second_votes'})
    result=first.merge(second,on=race_keys,how='left')
    result['top_two_margin_votes']=result['winner_votes']-result['second_votes']
    result = result.merge(df.groupby(race_keys, as_index=False).unofficial.any(), on=race_keys)
    result['status'] = result.unofficial.map({True:'unofficial_lead', False:'source_lead'})
    tied = result.top_two_margin_votes.eq(0)
    result.loc[tied, ['winner','winner_party']] = None
    result.loc[tied, 'status'] = 'tied_source_counts'
    result['source_url'] = ''
    result['note'] = ''
    return result.drop(columns=['second_votes','unofficial'])


def apply_corrections(results, chamber, race_keys):
    corrections = pd.read_csv(ROOT/'data'/'congress_corrections.csv')
    verified = corrections[corrections.chamber.eq(chamber)].copy()
    if chamber == 'house':
        verified['district'] = verified.contest.astype(int)
    else:
        verified['special'] = verified.contest.eq('special')
    verified['top_two_margin_votes'] = verified.winner_votes - verified.runner_up_votes
    columns = list(results.columns)
    keep = ~results.set_index(race_keys).index.isin(verified.set_index(race_keys).index)
    return pd.concat([results.loc[keep], verified[columns]], ignore_index=True).sort_values(race_keys)


def process_presidential(path):
    keep=['year','state_po','county_name','county_fips','unit_id','party','candidatevotes','totalvotes']
    df=pd.read_csv(path,dtype={'county_fips':str,'state_po':str,'unit_id':str},usecols=lambda c:c in keep,low_memory=False)
    require_columns(df, keep)
    df=df[df.year.isin([2008,2012,2016,2020,2024])].copy()
    if df.empty:
        raise ValueError('No presidential rows in the supported years')
    df['state_po']=df['state_po'].str.upper()
    df['county_fips']=df['county_fips'].fillna('')
    df['unit_id']=df['unit_id'].fillna(df['state_po']+'-'+df['county_name'].fillna('UNKNOWN'))
    df['candidatevotes']=pd.to_numeric(df['candidatevotes'],errors='coerce').fillna(0)
    df['totalvotes']=pd.to_numeric(df['totalvotes'],errors='coerce')
    df['party_group']=df['party'].map({'DEMOCRAT':'D','REPUBLICAN':'R'}).fillna('Other')
    keys=['year','state_po','unit_id','county_name','county_fips']
    piv=df.pivot_table(index=keys,columns='party_group',values='candidatevotes',aggfunc='sum',fill_value=0).reset_index()
    for p in ['D','R','Other']:
        if p not in piv:piv[p]=0
    totals=df.groupby(keys,dropna=False,as_index=False).totalvotes.max()
    piv=piv.merge(totals,on=keys,how='left')
    piv=piv.rename(columns={'D':'dem_votes','R':'rep_votes','Other':'other_votes','totalvotes':'total_votes'})
    piv['total_votes']=piv['total_votes'].fillna(piv.dem_votes+piv.rep_votes+piv.other_votes)
    piv['dem_margin_pp']=((piv.dem_votes-piv.rep_votes)/piv.total_votes.where(piv.total_votes>0))*100
    piv['dem_share_pct']=piv.dem_votes/piv.total_votes.where(piv.total_votes>0)*100
    piv['rep_share_pct']=piv.rep_votes/piv.total_votes.where(piv.total_votes>0)*100
    piv['unreconciled_votes'] = piv.total_votes - piv.dem_votes - piv.rep_votes - piv.other_votes
    if piv.unreconciled_votes.lt(0).any() or piv.duplicated(['year','state_po','unit_id']).any():
        raise ValueError('Presidential candidate counts exceed reported totals or unit keys are duplicated')
    cols=keys+['unreconciled_votes','dem_votes','rep_votes','other_votes','total_votes','dem_margin_pp','dem_share_pct','rep_share_pct']
    state=piv.groupby(['year','state_po'],as_index=False)[['dem_votes','rep_votes','other_votes','total_votes','unreconciled_votes']].sum()
    state['dem_margin_pp']=(state.dem_votes-state.rep_votes)/state.total_votes.where(state.total_votes>0)*100
    state['dem_share_pct']=state.dem_votes/state.total_votes.where(state.total_votes>0)*100
    state['rep_share_pct']=state.rep_votes/state.total_votes.where(state.total_votes>0)*100
    write_csv(piv[cols], 'presidential_counties.csv')
    write_csv(state, 'presidential_states.csv')
    gaps = piv.unreconciled_votes.gt(0)
    if gaps.any():
        print(f'NOTICE: {int(gaps.sum())} reporting units have {int(piv.unreconciled_votes.sum()):,} unreconciled votes.')
    print('Presidential counties:',len(piv),'state-year units:',len(state))

def process_house(path):
    df = pd.read_csv(path, low_memory=False)
    require_columns(df, ['year','state_po','district','stage','special','runoff','unofficial'])
    df = df[df.year.between(2008,2024) & df.state_po.isin(STATES)
            & df.stage.str.upper().eq('GEN') & ~df.special.map(is_true)].copy()
    if df.empty:
        raise ValueError('No House general election rows in scope')
    race = ['year','state_po','district']
    df['district'] = pd.to_numeric(df.district, errors='raise').astype(int)
    runoff = df.runoff.map(is_true)
    has_runoff = runoff.groupby([df[column] for column in race]).transform('any')
    winners = candidate_winners(df[~has_runoff | runoff], race, 'party')
    winners = apply_corrections(winners, 'house', race)
    winners['race_id'] = winners.apply(lambda row: f'{int(row.year)}-{row.state_po}-{int(row.district):02}',axis=1)
    write_csv(winners, 'house_winners.csv')
    print('House contests:', len(winners))


def process_senate(path):
    df = pd.read_csv(path, low_memory=False)
    require_columns(df, ['year','state_po','stage','special','unofficial','party_simplified'])
    df = df[df.year.between(2008,2024) & df.state_po.isin(STATES)].copy()
    df['stage'] = df.stage.str.upper()
    df['special'] = df.special.map(is_true)
    # January Georgia runoffs resolve the previous November cycle.
    january_georgia = df.state_po.eq('GA') & df.year.eq(2021) & df.stage.eq('RUNOFF')
    df.loc[january_georgia, 'year'] = 2020
    df = df[df.year.mod(2).eq(0) & df.stage.isin(['GEN','RUNOFF'])].copy()
    if df.empty:
        raise ValueError('No Senate general election rows in scope')
    race = ['year','state_po','special']
    has_runoff = df.groupby(race).stage.transform(lambda stage: stage.eq('RUNOFF').any())
    winners = candidate_winners(df[~has_runoff | df.stage.eq('RUNOFF')], race, 'party_simplified')
    winners = apply_corrections(winners, 'senate', race)
    write_csv(winners, 'senate_winners.csv')
    print('Senate contests:', len(winners))


def process_fred(refresh=False,with_states=False):
    failures = []
    frames=[]
    for series,label in FRED_SERIES.items():
        dest=RAW/f'fred_{series}.csv'
        try:
            download(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}',dest,refresh=refresh)
            df=pd.read_csv(dest)
            df=df.rename(columns={df.columns[0]:'date',df.columns[1]:'value'})
            df['date']=pd.to_datetime(df.date,errors='coerce')
            df['value']=pd.to_numeric(df.value,errors='coerce')
            df=df[df.date.notna() & df.date.dt.year.between(2007,2024)].copy()
            df['series']=series;df['label']=label
            frames.append(df[['date','series','label','value']])
        except Exception as exc:
            failures.append(f'{series}: {exc}')
    if frames:
        econ=pd.concat(frames,ignore_index=True).sort_values('date')
        write_csv(econ, 'economic_series.csv', date_format='%Y-%m-%d')
        print('Economic observations:',len(econ))
    if with_states:
        rows=[]
        for st in STATES:
            try:
                path=download(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={st}UR',RAW/f'fred_{st}UR.csv',refresh=refresh)
                x=pd.read_csv(path)
                x.columns=['date','value']; x['date']=pd.to_datetime(x.date,errors='coerce')
                x['value']=pd.to_numeric(x.value,errors='coerce')
                x=x[x.date.dt.month.le(10) & x.date.dt.year.between(2008,2024)]
                x = x.dropna(subset=['value']).copy()
                x['year'] = x.date.dt.year
                x['month'] = x.date.dt.month
                x = x.drop_duplicates(['year','month'], keep='last')
                complete = x.groupby('year').month.transform('nunique').eq(10)
                g = x[complete].groupby('year').value.mean().reset_index()
                g['state_po']=st;rows.append(g)
            except Exception as exc: failures.append(f'{st}UR: {exc}')
        if rows:
            write_csv(pd.concat(rows,ignore_index=True).rename(columns={'value':'unemployment_jan_oct_pct'}), 'state_unemployment.csv')
    return failures

def write_manifest(failures):
    m={"generated_utc":datetime.now(timezone.utc).isoformat(),"source":"MIT Election Lab via electiondata.dev; FRED","status":"partial" if failures else "complete","failures":failures,"files":{p.name:{"bytes":p.stat().st_size,"rows":sum(1 for _ in p.open(encoding='utf-8'))-1} for p in OUT.glob('*.csv')}}
    (OUT/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh',action='store_true',help='Download raw source again')
    parser.add_argument('--economy',action='store_true',help='Download national FRED macro time series')
    parser.add_argument('--state-labor',action='store_true',help='Also download 50 state unemployment histories')
    parser.add_argument('--skip-election',action='store_true',help='Only economic data')
    args=parser.parse_args()
    RAW.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    failures = []
    if not args.skip_election:
        functions={'county-president':process_presidential,'house-results':process_house,'senate-results':process_senate}
        for dataset in DATASETS:
            try:
                path=download(f'{BASE}/{dataset}/download/{dataset}.csv',RAW/f'{dataset}.csv',refresh=args.refresh)
                functions[dataset](path)
            except Exception as exc:
                failures.append(f'{dataset}: {exc}')
    if args.economy or args.state_labor:
        failures.extend(process_fred(args.refresh, args.state_labor))
    write_manifest(failures)
    for failure in failures:
        print(f'Import failed: {failure}', file=sys.stderr)
    if failures:
        print('Import incomplete. Inspect data/processed/manifest.json.', file=sys.stderr)
        return 1
    print('Import complete. Refresh the dashboard.')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
