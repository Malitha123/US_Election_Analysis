"""Build a self-contained report from the selected historical dataset snapshot."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import app as api


def geographic_units(filename):
    frame = api.read(filename)
    if frame is None:
        return None
    keys = ['state_po','dem_votes','rep_votes','total_votes','dem_margin_pp']
    if 'unit_id' in frame:
        keys.extend(['unit_id','county_name','county_fips'])
    return {int(year):json.loads(group[keys].to_json(orient='records',double_precision=15))
            for year, group in frame.groupby('year')}


def snapshot():
    overview = api.overview()
    exports = {'/api/download/historical_summary':api.DATA/'historical_summary.csv'}
    for filename, loaded in overview['coverage'].items():
        if loaded and filename != 'state_unemployment.csv':
            exports['/api/download/'+Path(filename).stem] = api.processed_path(filename)
    findings = api.findings()
    for name in findings['datasets']:
        exports['/api/findings/download/'+name] = api.FINDINGS/f'{name}.csv'
    return {
        'responses': {
            '/api/overview':overview, '/api/events':api.events(), '/api/sources':api.sources(),
            '/api/findings':findings, '/api/findings/state-association':api.findings_state_association(),
            '/api/economy':api.economy(), '/api/model':api.model(),
        },
        'cycles':api.CYCLES,
        'presidentialYears':api.PRESIDENTIAL_YEARS,
        'geographyCaveat':api.GEOGRAPHY_CAVEAT,
        'geography':{
            'state':geographic_units('presidential_states.csv'),
            'county':geographic_units('presidential_counties.csv'),
        },
        'congress':{chamber:{year:api.congress(chamber,year) for year in api.CYCLES}
                    for chamber in ('house','senate')},
        'evidence':{f'{a}-{b}':api.evidence(a,b) for a in api.CYCLES for b in api.CYCLES},
        'downloads':{url:path.read_bytes().decode('utf-8') for url,path in exports.items()},
    }


def build(output=None):
    assets = ROOT/'static'
    html = (assets/'index.html').read_text(encoding='utf-8')
    css = (assets/'styles.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="/static/styles.css"/>',f'<style>{css}</style>')
    payload = json.dumps(snapshot(),ensure_ascii=True,separators=(',',':'),allow_nan=False).replace('<','\\u003c')
    data = f'<script type="application/json" id="atlas-snapshot">{payload}</script>'
    for name in ('vendor/plotly.min.js','briefing.js','findings.js','app.js'):
        tag = f'<script src="/static/{name}"></script>'
        if tag not in html:
            raise ValueError(f'Missing script tag for {name}')
        source = (assets/name).read_text(encoding='utf-8')
        if '</script' in source.lower():
            raise ValueError(f'Unexpected closing script token in {name}')
        script = f'<script>{source}</script>'
        if name == 'briefing.js':
            shim = (assets/'offline.js').read_text(encoding='utf-8')
            script = data + f'<script>{shim}</script>' + script
        html = html.replace(tag,script)
    destination = Path(output) if output else ROOT/'START_HERE.html'
    destination.write_text(html,encoding='utf-8')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,help='Optional path for the standalone HTML')
    args = parser.parse_args()
    path = build(args.output)
    print(f'Built {path} ({path.stat().st_size/1024**2:.1f} MiB)')
