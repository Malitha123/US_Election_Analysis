import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import app as backend
from app import app
from scripts.ingest import candidate_winners
import pandas as pd
import pytest

client=TestClient(app)

def test_home_and_assets():
    assert client.get('/').status_code==200
    assert 'ELECTORAL' in client.get('/').text
    assert 'renderOverview' in client.get('/static/briefing.js').text
    assert client.get('/static/vendor/plotly.min.js').status_code==200

def test_overview_historical_coverage():
    v=client.get('/api/overview').json()
    assert [x['year'] for x in v['rows']]==list(range(2008,2025,2))
    assert v['last_cycle']==2024
    by_year={x['year']:x for x in v['rows']}
    assert by_year[2010]['rep_house']==242
    assert (by_year[2018]['rep_house'],by_year[2018]['house_unfilled'])==(199,1)
    assert by_year[2012]['dem_house']==201
    assert by_year[2012]['dem_house_vote_pct']>by_year[2012]['rep_house_vote_pct']
    assert by_year[2016]['dem_pres_pct']>by_year[2016]['rep_pres_pct']
    assert by_year[2016]['dem_electoral_allocated']<by_year[2016]['rep_electoral_allocated']

def test_evidence_reports_cautious_descriptive_changes():
    v=client.get('/api/evidence?year_a=2008&year_b=2024').json()
    assert v['status']=='ready'
    assert len(v['findings'])>=3
    assert 'ecological fallacy' in v['method_note']
    assert client.get('/api/evidence?year_a=2007&year_b=2024').status_code==400

def test_missing_dataset_explicit(tmp_path,monkeypatch):
    monkeypatch.setattr(backend,'PROCESSED',tmp_path/'processed')
    monkeypatch.setattr(backend,'SNAPSHOT',tmp_path/'snapshot')
    assert client.get('/api/geography?year_a=2008&year_b=2024').json()['status']=='not_loaded'
    assert client.get('/api/geography?year_a=2010&year_b=2012').status_code==400
    assert client.get('/api/congress?chamber=senate&year=2026').status_code==400
    assert client.get('/api/congress?chamber=house&year=2024').json()['status']=='not_loaded'
    assert client.get('/api/download/presidential_counties').status_code==404
    assert client.get('/api/download/historical_summary').status_code==200

def test_fusion_votes_not_double_counted_and_special_filtering():
    d=pd.DataFrame([
        {'year':2024,'state_po':'NY','district':1,'candidate':'A','party':'DEMOCRAT','candidate_total_votes':135,'candidatevotes':100},
        {'year':2024,'state_po':'NY','district':1,'candidate':'A','party':'WORKING FAMILIES','candidate_total_votes':135,'candidatevotes':35},
        {'year':2024,'state_po':'NY','district':1,'candidate':'B','party':'REPUBLICAN','candidate_total_votes':120,'candidatevotes':120},
    ])
    result=candidate_winners(d,['year','state_po','district'],'party')
    assert result.iloc[0].winner=='A'
    assert result.iloc[0].winner_party=='D'
    assert result.iloc[0].winner_votes==135
    assert result.iloc[0].top_two_margin_votes==15

def test_sources_and_api_health():
    s=client.get('/api/sources').json()
    assert len(s)>=10
    assert any(x['id']=='mit_pres' and 'doi.org' in x['url'] for x in s)
    assert client.get('/api/health').json()['status']=='ok'

def test_county_presidential_normalization(tmp_path,monkeypatch):
    from scripts import ingest
    monkeypatch.setattr(ingest,'OUT',tmp_path)
    path=tmp_path/'source.csv'
    path.write_text('year,state_po,county_name,county_fips,unit_id,party,candidatevotes,totalvotes\n'
                    '2008,PA,TEST COUNTY,42001,42001,DEMOCRAT,600,1000\n'
                    '2008,PA,TEST COUNTY,42001,42001,REPUBLICAN,380,1000\n'
                    '2008,PA,TEST COUNTY,42001,42001,LIBERTARIAN,20,1000\n'
                    '2012,PA,TEST COUNTY,42001,42001,DEMOCRAT,480,1000\n'
                    '2012,PA,TEST COUNTY,42001,42001,REPUBLICAN,500,1000\n'
                    '2012,PA,TEST COUNTY,42001,42001,OTHER,20,1000\n')
    ingest.process_presidential(path)
    counties=pd.read_csv(tmp_path/'presidential_counties.csv')
    states=pd.read_csv(tmp_path/'presidential_states.csv')
    assert len(counties)==2
    assert list(counties.dem_margin_pp)==[22.0,-2.0]
    assert states.loc[states.year.eq(2008),'total_votes'].iloc[0]==1000


def test_official_results_cover_runoffs_ranked_choice_and_uncertified_races():
    def contest(chamber,year,state):
        return client.get('/api/congress',params={'year':year,'chamber':chamber,'state':state}).json()['rows']
    ga = {row['special']:row for row in contest('senate',2020,'ga')}
    assert ga[False]['winner'] == 'Jon Ossoff'
    assert ga[True]['winner'] == 'Raphael Warnock'
    assert ga[False]['status'] == 'certified'
    maine = next(row for row in contest('house',2022,'ME') if row['district']==2)
    assert maine['winner'] == 'Jared Golden'
    assert maine['top_two_margin_votes'] == 18994
    nc = next(row for row in contest('house',2018,'NC') if row['district']==9)
    assert nc['winner'] is None
    assert nc['status'] == 'no_certified_winner'
    ak = contest('senate',2022,'AK')[0]
    assert (ak['winner_party'],ak['top_two_margin_votes']) == ('R',18796)
    mn = next(row for row in contest('house',2024,'MN') if row['district']==3)
    assert mn['winner_party'] == 'D'


def test_race_ranking_excludes_accounting_rows_and_keeps_source_status():
    frame = pd.DataFrame([
        ['EXHAUSTED BALLOT',None,500,500,False],
        ['A','DEMOCRATIC-FARMER-LABOR',100,100,True],
        ['B','REPUBLICAN',80,80,False],
    ],columns=['candidate','party','candidatevotes','candidate_total_votes','unofficial'])
    frame['year'] = 2022
    result = candidate_winners(frame,['year'],'party').iloc[0]
    assert (result.winner,result.winner_party,result.status)==('A','D','unofficial_lead')


def test_geographic_flip_requires_valid_totals_and_ranks_both_directions(tmp_path,monkeypatch):
    monkeypatch.setattr(backend,'PROCESSED',tmp_path)
    (tmp_path/'presidential_states.csv').write_text(
        'year,state_po,dem_votes,rep_votes,total_votes,dem_margin_pp\n'
        '2020,AK,0,0,0,\n2024,AK,75,25,100,50\n'
        '2020,TX,60,40,100,20\n2024,TX,40,60,100,-20\n'
        '2020,CA,20,80,100,-60\n2024,CA,70,30,100,40\n'
        '2020,OH,50,50,100,0\n2024,OH,40,60,100,-20\n')
    result = client.get('/api/geography?year_a=2020&year_b=2024&limit=1').json()
    assert result['total_matched']==4 and result['comparable']==3
    assert result['total_flips']==2
    assert [row['state_po'] for row in result['rows']]==['CA']


def test_import_failures_exit_nonzero(tmp_path,monkeypatch):
    import json
    from scripts import ingest
    def unavailable(*args,**kwargs):
        raise OSError('source unavailable')
    monkeypatch.setattr(ingest,'RAW',tmp_path/'raw')
    monkeypatch.setattr(ingest,'OUT',tmp_path/'processed')
    monkeypatch.setattr(ingest,'download',unavailable)
    monkeypatch.setattr(sys,'argv',['ingest.py'])
    assert ingest.main()==1
    manifest=json.loads((ingest.OUT/'manifest.json').read_text())
    assert manifest['status']=='partial'
    assert len(manifest['failures'])==3


def test_briefing_data_matches_headline():
    rows = client.get('/api/geography?year_a=2020&year_b=2024').json()['rows']
    flips = {r['state_po'] for r in rows if r['winner_a']=='D' and r['winner_b']=='R'}
    assert flips == {'AZ','GA','MI','NV','PA','WI'}
    data = {row['year']:row for row in client.get('/api/overview').json()['rows']}
    margin = lambda year:data[year]['dem_pres_pct']-data[year]['rep_pres_pct']
    assert round(margin(2020)-margin(2024),1)==5.9
    assert round(data[2020]['turnout_vep_pct']-data[2024]['turnout_vep_pct'],1)==2.7
