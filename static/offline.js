'use strict';

(() => {
 const snapshot = JSON.parse(document.getElementById('atlas-snapshot').textContent);
 window.OFFLINE_SNAPSHOT = true;
 const compareText = (a,b) => (a>b) - (a<b);
 const party = margin => margin > 0 ? 'D' : margin < 0 ? 'R' : 'Tie';
 const response = (body,status=200) => new Response(
  typeof body === 'string' ? body : JSON.stringify(body), {status}
 );
 const invalid = detail => response({detail},400);

 function geography(q) {
  const year_a = Number(q.get('year_a') ?? 2008);
  const year_b = Number(q.get('year_b') ?? 2024);
  const level = q.get('level') ?? 'state';
  if (!snapshot.presidentialYears.includes(year_a) || !snapshot.presidentialYears.includes(year_b)) {
   return invalid('Select presidential elections from 2008–2024.');
  }
  if (level!=='state' && level!=='county') return invalid('level must be state or county');
  const data = snapshot.geography[level];
  if (!data) return response({status:'not_loaded',message:'Presidential returns are unavailable.',rows:[],level});
  const state = (q.get('state') ?? 'ALL').trim().toUpperCase();
  const limit = Number(q.get('limit') ?? 10000);
  if (!Number.isSafeInteger(limit)) return invalid('limit must be an integer');
  const key = row => level==='state' ? row.state_po : row.state_po + '/' + row.unit_id;
  const a = new Map((data[year_a]||[]).map(row=>[key(row),row]));
  const rows = [];
  let total_matched = 0;
  for (const b of data[year_b]||[]) {
   if (state && state!=='ALL' && b.state_po!==state) continue;
   const start = a.get(key(b));
   if (!start) continue;
   total_matched++;
   if (start.total_votes<=0 || b.total_votes<=0 || start.dem_margin_pp===null || b.dem_margin_pp===null) continue;
   const winner_a = party(start.dem_margin_pp);
   const winner_b = party(b.dem_margin_pp);
   const row = {state_po:b.state_po,dem_a:start.dem_votes,rep_a:start.rep_votes,votes_a:start.total_votes,
    margin_a:start.dem_margin_pp,dem_b:b.dem_votes,rep_b:b.rep_votes,votes_b:b.total_votes,margin_b:b.dem_margin_pp,
    swing_pp:b.dem_margin_pp-start.dem_margin_pp,winner_a,winner_b,
    flip:winner_a!==winner_b && winner_a!=='Tie' && winner_b!=='Tie'};
   if (level==='county') Object.assign(row,{unit_id:b.unit_id,county_name:b.county_name,county_fips:b.county_fips});
   rows.push(row);
  }
  rows.sort((a,b)=>Math.abs(b.swing_pp)-Math.abs(a.swing_pp) || compareText(key(a),key(b)));
  const selected = rows.slice(0,Math.min(Math.max(limit,1),10000));
  return response({status:'ready',year_a,year_b,level,rows:selected,total_matched,comparable:rows.length,
   displayed:selected.length,total_flips:rows.filter(row=>row.flip).length,caveat:snapshot.geographyCaveat});
 }

 function congress(q) {
  const chamber = q.get('chamber') ?? 'house';
  const year = Number(q.get('year') ?? 2024);
  const state = (q.get('state') ?? 'ALL').trim().toUpperCase();
  if (chamber!=='house' && chamber!=='senate') return invalid('chamber must be house or senate');
  if (!snapshot.cycles.includes(year)) return invalid('Select an even year from 2008–2024.');
  const results = snapshot.congress[chamber][year];
  const rows = !state || state==='ALL' ? results.rows : results.rows.filter(row=>row.state_po===state);
  return response({...results,rows});
 }

 window.fetch = async input => {
  const url = new URL(String(input),'https://electoral-atlas.invalid/');
  const q = url.searchParams;
  if (url.pathname==='/api/geography') return geography(q);
  if (url.pathname==='/api/congress') return congress(q);
  if (url.pathname==='/api/evidence') {
   const comparison = snapshot.evidence[`${Number(q.get('year_a') ?? 2008)}-${Number(q.get('year_b') ?? 2024)}`];
   return comparison ? response(comparison) : invalid('Pick a valid election from 2008 to 2024');
  }
  if (Object.hasOwn(snapshot.responses,url.pathname)) return response(snapshot.responses[url.pathname]);
  if (Object.hasOwn(snapshot.downloads,url.pathname)) {
   return new Response(snapshot.downloads[url.pathname],{headers:{'Content-Type':'text/csv;charset=utf-8'}});
  }
  return response('Unavailable in this snapshot',404);
 };

 document.addEventListener('click', event => {
  const link = event.target.closest('a[download]');
  const path = link?.getAttribute('href');
  if (!path || !Object.hasOwn(snapshot.downloads,path)) return;
  event.preventDefault();
  const blob = URL.createObjectURL(new Blob([snapshot.downloads[path]],{type:'text/csv;charset=utf-8'}));
  const download = document.createElement('a');
  download.href = blob;
  download.download = path.split('/').at(-1)+'.csv';
  download.click();
  setTimeout(()=>URL.revokeObjectURL(blob),1000);
 });
})();
