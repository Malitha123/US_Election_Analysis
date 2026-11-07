import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import app as backend

client=TestClient(backend.app)

def test_findings_are_available_with_sources():
    resp=client.get('/api/findings')
    assert resp.status_code==200
    info=resp.json()
    assert info['status']=='ready'
    assert len(info['manifest']['sources'])>=5
    assert set(info['datasets'])=={'pew_age_voting','pew_race_voting','youth_turnout','youth_groups_2024','youth_issue_priorities_2024','pew_naturalized_voting','pew_new_and_returning','foreign_born_states_2024'}
    for rows in info['datasets'].values():
        assert rows
        assert all(r['source_url'].startswith('https://') for r in rows)

def test_foreign_born_counts_state_but_not_voters():
    rows=client.get('/api/findings').json()['datasets']['foreign_born_states_2024']
    assert len(rows)==52  # 50 states + DC + PR
    assert len(set(x['state_po'] for x in rows))==52
    ca=next(x for x in rows if x['state_po']=='CA')
    assert ca['foreign_born_count']==10902022
    assert ca['foreign_born_pct']==27.6
    assert ca['foreign_born_pct_moe90']==0.2
    moe={row['state_po']:row['foreign_born_count_moe90'] for row in rows}
    assert (moe['CO'],moe['CT'])==(19658,14124)
    assert all('not number of voters' in x['population'] for x in rows)
    assert next(x for x in rows if x['state_po']=='VT')['foreign_born_count']==29028
    assert abs(sum(x['foreign_born_count'] for x in rows if x['state_po']!='PR')-50234856)<10

def test_youth_and_naturalized_not_conflated():
    ds=client.get('/api/findings').json()['datasets']
    assert [x['turnout_pct'] for x in ds['youth_turnout']]==[39,50,47]
    first=next(x for x in ds['pew_new_and_returning'] if x['group']=='Young first-time voters')
    returning=next(x for x in ds['pew_new_and_returning'] if x['group']!='Young first-time voters')
    assert first['dem_pct']==54 and first['rep_pct']==44
    assert returning['dem_pct']==42 and returning['rep_pct']==54
    assert first['source']!=returning['source']
    naturalized=ds['pew_naturalized_voting']
    assert [(x['year'],x['dem_pct'],x['rep_pct']) for x in naturalized]==[(2020,59,38),(2024,51,47)]
    assert sum(x['pct'] for x in ds['youth_issue_priorities_2024'])==100
    assert len(ds['pew_age_voting'])==12


def test_optional_state_association_never_invents_election_data(tmp_path, monkeypatch):
    monkeypatch.setattr(backend,'PROCESSED',tmp_path)
    monkeypatch.setattr(backend,'SNAPSHOT',tmp_path/'snapshot')
    out=client.get('/api/findings/state-association').json()
    assert out['status']=='not_loaded'
    assert out['rows']==[]
    (tmp_path/'presidential_states.csv').write_text('year,state_po,dem_margin_pp\n2024,CA,20.0\n2024,TX,-12.0\n2024,FL,-13.0\n2024,NY,11.0\n2024,NY,11.0\n2020,CA,30.0\n')
    out=client.get('/api/findings/state-association').json()
    assert out['status']=='ready'
    assert out['n_states']==4
    assert len(out['rows'])==4
    assert out['pearson_r'] is not None
    assert 'Ecological' in out['caveat']
    assert not any('2020' in str(x) for x in out['rows'])

def test_findings_csv_exports_are_allowlisted():
    assert client.get('/api/findings/download/foreign_born_states_2024').status_code==200
    assert 'California' in client.get('/api/findings/download/foreign_born_states_2024').text
    assert client.get('/api/findings/download/../../app.py').status_code!=200
    assert client.get('/api/findings/download/random').status_code==404


def test_findings_ui_links_to_demographic_charts():
    main=client.get('/').text
    js=client.get('/static/findings.js').text
    assert 'Voter findings' in main
    assert 'findings.js' in main
    assert 'fi-first' in js and 'fi-turnout' in js and 'fi-imm-map' in js
    assert 'not a pure Gen Z birth cohort' in js
    assert 'href="#voter-race"' in js and 'href="#voter-age"' in js


def test_race_and_age_estimates_and_missing_year():
    datasets=client.get('/api/findings').json()['datasets']
    race={(r['year'],r['race_group']):r for r in datasets['pew_race_voting']}
    age={(r['year'],r['age_group']):r for r in datasets['pew_age_voting']}
    assert len(race)==len(age)==12
    expected={
        'White':(43,55,-12),'Black':(83,15,68),
        'Hispanic':(51,48,3),'Asian':(57,40,17),
    }
    for group,values in expected.items():
        row=race[2024,group]
        assert (row['dem_pct'],row['rep_pct'],row['dem_margin_pp'])==values
    assert race[2020,'Hispanic']['dem_margin_pp']==25
    assert race[2016,'Asian']['dem_margin_pp'] is None
    assert race[2016,'Asian']['dem_pct'] is None
    assert [age[2024,group]['dem_margin_pp'] for group in ('18–29','30–49','50–64','65+')]==[19,2,-14,-3]
    assert client.get('/api/findings/download/pew_race_voting').status_code==200
