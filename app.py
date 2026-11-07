"""US Electoral Dynamics research dashboard API and static frontend."""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'data'
PROCESSED=DATA/'processed'
SNAPSHOT=DATA/'snapshot'
PRESIDENTIAL_YEARS=(2008,2012,2016,2020,2024)
CYCLES=tuple(range(2008,2025,2))
GEOGRAPHY_CAVEAT = ('Matched units had votes in both elections. '
                    'A flip is a switch in the major-party lead. '
                    'Reporting boundaries can change, especially in Alaska.')
CONGRESS_CAVEAT = ('Most rows show the leading candidate. Certified rows '
                   'link to official results. Some contests may be missing. Use seat totals to assess chamber control.')

app=FastAPI(title='US Electoral Dynamics API',description='Historical US election results and evidence, 2008–2024',version='2.3.1')
app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')

@app.get('/')
def index():return FileResponse(ROOT/'static'/'index.html')

def records(path):
    if not path.exists():return []
    return json.loads(pd.read_csv(path).to_json(orient='records'))

def processed_path(name):
    for directory in (PROCESSED, SNAPSHOT):
        path = directory / name
        if path.is_file():
            return path
    return None


def read(name):
    path = processed_path(name)
    if path is None:
        return None
    return pd.read_csv(path, low_memory=False, dtype={'unit_id':str,'county_fips':str})


@app.get('/api/overview')
def overview():
    names = ('presidential_counties.csv','presidential_states.csv','house_winners.csv',
             'senate_winners.csv','economic_series.csv','state_unemployment.csv')
    return {
        'rows':records(DATA/'historical_summary.csv'),
        'coverage':{name:processed_path(name) is not None for name in names},
        'first_cycle':CYCLES[0],
        'last_cycle':CYCLES[-1],
    }


FINDINGS=DATA/'findings'
FINDINGS_DATASETS=(
    'pew_age_voting','pew_race_voting','youth_turnout','youth_groups_2024',
    'youth_issue_priorities_2024','pew_naturalized_voting',
    'pew_new_and_returning','foreign_born_states_2024',
)

@app.get('/api/findings')
def findings():
    """Bundled, sourced survey and Census observations for the interpretive dashboard."""
    manifest=json.loads((FINDINGS/'manifest.json').read_text(encoding='utf-8'))
    return {'status':'ready','manifest':manifest,
            'datasets':{name:records(FINDINGS/f'{name}.csv') for name in FINDINGS_DATASETS}}

@app.get('/api/findings/download/{dataset}')
def download_findings(dataset:str):
    if dataset not in FINDINGS_DATASETS:raise HTTPException(404,'Unknown findings dataset')
    return FileResponse(FINDINGS/f'{dataset}.csv',media_type='text/csv',filename=f'{dataset}.csv')

@app.get('/api/findings/state-association')
def findings_state_association():
    """Optional ecological comparison; only if actual presidential state returns were imported."""
    df=read('presidential_states.csv')
    if df is None:
        return {'status':'not_loaded','rows':[],
                'message':'Import MIT presidential state returns with python scripts/ingest.py. No state-level voting pattern is inferred from demographics alone.'}
    df=df[df.year.eq(2024)][['state_po','dem_margin_pp']].drop_duplicates('state_po')
    # Foreign-born share is residents of all citizenship statuses; not voters.
    foreign=pd.read_csv(FINDINGS/'foreign_born_states_2024.csv')
    joined=foreign[foreign.state_po.ne('PR')][['state','state_po','foreign_born_pct','foreign_born_pct_moe90']].merge(df,on='state_po',how='inner')
    joined=joined.dropna(subset=['foreign_born_pct','dem_margin_pp'])
    joined=joined.sort_values('state')
    corr=float(joined.foreign_born_pct.corr(joined.dem_margin_pp)) if len(joined)>=3 else None
    if corr is not None and not pd.notna(corr):corr=None
    return {'status':'ready' if len(joined)>=3 else 'insufficient',
            'n_states':int(len(joined)),'pearson_r':round(corr,3) if corr is not None else None,
            'rows':json.loads(joined.where(pd.notna(joined),None).to_json(orient='records')),
            'caveat':'Ecological association across jurisdictions. Foreign-born shares include noncitizens. Individual vote choices require separate data. No adjustment for geography or ACS uncertainty.'}

@app.get('/api/sources')
def sources():return json.loads((DATA/'sources.json').read_text(encoding='utf-8'))

@app.get('/api/events')
def events():return json.loads((DATA/'events.json').read_text(encoding='utf-8'))

@app.get('/api/geography')
def geography(year_a:int=2008,year_b:int=2024,level:str='state',state:str='ALL',limit:int=10000):
    if year_a not in PRESIDENTIAL_YEARS or year_b not in PRESIDENTIAL_YEARS:
        raise HTTPException(400,'Select presidential elections from 2008–2024.')
    if level not in ('state','county'):
        raise HTTPException(400,'level must be state or county')
    filename = 'presidential_states.csv' if level == 'state' else 'presidential_counties.csv'
    df = read(filename)
    if df is None:
        return {'status':'not_loaded','message':'Import MIT election returns with python scripts/ingest.py.','rows':[],'level':level}
    state = state.strip().upper()
    if state and state != 'ALL':
        df = df[df.state_po.eq(state)]
    key = ['state_po'] if level == 'state' else ['state_po','unit_id']
    values = ['dem_votes','rep_votes','total_votes','dem_margin_pp']
    names = ['county_name','county_fips'] if level == 'county' else []
    a = df.loc[df.year.eq(year_a),key+values].rename(columns=dict(zip(values,['dem_a','rep_a','votes_a','margin_a'])))
    b = df.loc[df.year.eq(year_b),key+values+names].rename(columns=dict(zip(values,['dem_b','rep_b','votes_b','margin_b'])))
    matched = a.merge(b,on=key,how='inner',validate='one_to_one')
    valid = matched[matched.votes_a.gt(0) & matched.votes_b.gt(0)
                    & matched.margin_a.notna() & matched.margin_b.notna()].copy()
    valid['swing_pp'] = valid.margin_b - valid.margin_a
    party = lambda margin: margin.map(lambda value: 'D' if value > 0 else 'R' if value < 0 else 'Tie')
    valid['winner_a'] = party(valid.margin_a)
    valid['winner_b'] = party(valid.margin_b)
    valid['flip'] = valid.winner_a.ne(valid.winner_b) & valid.winner_a.ne('Tie') & valid.winner_b.ne('Tie')
    sorted_rows = valid.assign(abs_swing=valid.swing_pp.abs()).sort_values(
        ['abs_swing',*key], ascending=[False]+[True]*len(key))
    rows = sorted_rows.head(min(max(limit,1),10000)).drop(columns='abs_swing')
    return {'status':'ready','year_a':year_a,'year_b':year_b,'level':level,
            'rows':json.loads(rows.to_json(orient='records',double_precision=12)),
            'total_matched':len(matched),'comparable':len(valid),'displayed':len(rows),
            'total_flips':int(valid.flip.sum()),'caveat':GEOGRAPHY_CAVEAT}


@app.get('/api/congress')
def congress(chamber:str='house',year:int=2024,state:str='ALL'):
    if chamber not in ('house','senate'):
        raise HTTPException(400,'chamber must be house or senate')
    if year not in CYCLES:
        raise HTTPException(400,'Select an even year from 2008–2024.')
    df = read(f'{chamber}_winners.csv')
    if df is None:
        return {'status':'not_loaded','message':'Run python scripts/ingest.py to import historical races.','rows':[]}
    if 'status' not in df:
        # Release 1 extracts omitted the fields needed for reliable race labels.
        bundled = SNAPSHOT / f'{chamber}_winners.csv'
        if not bundled.is_file():
            return {'status':'not_loaded','message':'Re-run scripts/ingest.py to upgrade the contest extract.','rows':[]}
        df = pd.read_csv(bundled, low_memory=False)
    df = df[df.year.eq(year)].copy()
    state = state.strip().upper()
    if state and state != 'ALL':
        df = df[df.state_po.eq(state)]
    return {'status':'ready','chamber':chamber,'year':year,'rows':json.loads(df.to_json(orient='records')),
            'caveat':CONGRESS_CAVEAT}


@app.get('/api/economy')
def economy():
    df=read('economic_series.csv')
    if df is None:return {'status':'not_loaded','rows':[],'message':'Run python scripts/ingest.py --economy to import FRED observations.'}
    df = df[df.date.astype(str).str[:4].astype(int).le(CYCLES[-1])].copy()
    df['date']=df['date'].astype(str)
    return {'status':'ready','rows':json.loads(df.where(pd.notna(df),None).to_json(orient='records')),'caveat':'Series have different units and frequencies. Economic indicators are descriptive context and do not establish causal effects on voting.'}

@app.get('/api/evidence')
def evidence(year_a:int=2008,year_b:int=2024):
    overview=records(DATA/'historical_summary.csv')
    a=next((v for v in overview if v['year']==year_a),None)
    b=next((v for v in overview if v['year']==year_b),None)
    if not a or not b:raise HTTPException(400,'Pick a valid election from 2008 to 2024')
    findings=[]
    def add(title,text,source,kind='Observed comparison'):
        findings.append({'title':title,'statement':text,'source':source,'kind':kind})
    if a.get('dem_house') is not None and b.get('dem_house') is not None:
        delta=int(b['dem_house']-a['dem_house'])
        direction = 'gained' if delta > 0 else 'lost'
        title = f'Democrats {direction} {abs(delta)} House seats' if delta else 'The Democratic House seat count held steady'
        seat_sources = list(dict.fromkeys([a['house_seats_source'], b['house_seats_source']]))
        add(title, f'The Democratic tally moved from {int(a["dem_house"])} seats in {year_a} to {int(b["dem_house"])} in {year_b}.', seat_sources)
    if a.get('turnout_vep_pct') is not None and b.get('turnout_vep_pct') is not None:
        delta=b['turnout_vep_pct']-a['turnout_vep_pct']
        title = f'Turnout moved {abs(delta):.1f} points {"higher" if delta > 0 else "lower"}' if delta else 'Turnout held steady'
        comparison = 'The elections were of different types.' if a['election_type'] != b['election_type'] else ''
        add(title, f'Turnout was {a["turnout_vep_pct"]:.1f}% in {year_a} and {b["turnout_vep_pct"]:.1f}% in {year_b}. {comparison}'.strip(), ['ballotpedia_turnout'])
    if a.get('dem_pres_pct') is not None and b.get('dem_pres_pct') is not None:
        first=a['dem_pres_pct']-a['rep_pres_pct'];last=b['dem_pres_pct']-b['rep_pres_pct']
        swing = round(last-first,1)
        title = f'The national presidential margin moved {abs(swing):.1f} points toward {"Democrats" if swing > 0 else "Republicans"}' if swing else 'The national presidential margin held steady'
        add(title, f'The Democratic-minus-Republican margin went from {first:+.1f} to {last:+.1f} points. Shares use all presidential votes.', ['ballotory'])
    return {'status':'ready','year_a':year_a,'year_b':year_b,'findings':findings,'method_note':'These are aggregate results. Inferring individual votes from county patterns is an ecological fallacy.'}

@app.get('/api/model')
def model():
    try:
        from scripts.analyze import fixed_effects_report
        return fixed_effects_report(ROOT)
    except Exception as e:return {'status':'error','message':str(e)}

@app.get('/api/download/{name}')
def download_data(name:str):
    filenames={'historical_summary':'historical_summary.csv','presidential_counties':'presidential_counties.csv','presidential_states':'presidential_states.csv','house_winners':'house_winners.csv','senate_winners':'senate_winners.csv','economic_series':'economic_series.csv'}
    if name not in filenames:raise HTTPException(404,'Unknown export')
    path=DATA/filenames[name] if name=='historical_summary' else processed_path(filenames[name])
    if path is None or not path.exists():raise HTTPException(404,'Data has not been imported yet')
    return FileResponse(path,filename=path.name,media_type='text/csv')

@app.get('/api/health')
def health():return {'status':'ok','build':'2.3.1','coverage':overview()['coverage']}
