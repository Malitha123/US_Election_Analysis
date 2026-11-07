'use strict';
const $=s=>document.querySelector(s);
const fmt=(n,d=1)=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(+n)?Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const whole=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(+n)?Number(n).toLocaleString('en-US',{maximumFractionDigits:0}):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fetchJSON=async url=>{let r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${await r.text()}`);return r.json()};
const plotLayout={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:'DM Sans, Arial',size:11,color:'#9db1c8'},margin:{l:43,r:14,t:18,b:44},xaxis:{gridcolor:'#1c3047',zeroline:false,linecolor:'#2c4359',tickfont:{color:'#8b9eb4'}},yaxis:{gridcolor:'#27364a',zeroline:false,linecolor:'#2c4359',tickfont:{color:'#8b9eb4'}},legend:{orientation:'h',x:0,y:1.18,font:{size:11}},hoverlabel:{bgcolor:'#14273e',font:{color:'#fff'}},showlegend:true};
const P={D:'#65a9f6',R:'#f07179',T:'#4fd1c4',Y:'#dec079'};
const chart = (id,traces,layout={},config={}) => {
 const node = document.getElementById(id);
 if (!node) return;
 const axis = name => {
  const options = {...plotLayout[name],...layout[name]};
  if (typeof options.title === 'string') options.title = {text:options.title,standoff:8};
  return options;
 };
 Plotly.newPlot(node,traces,{...plotLayout,...layout,xaxis:axis('xaxis'),yaxis:axis('yaxis')},
  {displaylogo:false,displayModeBar:false,responsive:true,scrollZoom:false,...config});
};
const select=(id,items,value)=>`<select id="${esc(id)}">${items.map(x=>`<option value="${esc(x[0])}" ${String(x[0])===String(value)?'selected':''}>${esc(x[1])}</option>`).join('')}</select>`;
const yearOptions=(presOnly=false)=>STATE.overview.rows.filter(row=>!presOnly||row.election_type==='Presidential').map(row=>[row.year,String(row.year)]);
const field=(name,id,items,value)=>`<div class="field"><label for="${id}">${name}</label>${select(id,items,value)}</div>`;
const panel=(title,description,content,tag='')=>`<section class="panel"><div class="panel-header"><div><h2>${title}</h2><p class="panel-desc">${description}</p></div>${tag?`<span class="tag">${tag}</span>`:''}</div>${content}</section>`;
const notice=(s,warn=false)=>`<div class="notice ${warn?'warning':''}">${s}</div>`;
const table=(cols,rows)=>`<div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(c=>`<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${c[2]?c[2](r[c[1]],r):esc(r[c[1]]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const badges=(coverage)=>Object.entries(coverage).map(([key,loaded])=>`<span class="cov ${loaded?'loaded':''}">${loaded?'✓':'○'} ${esc(key.replace('.csv','').replace(/_/g,' '))}</span>`).join('');
let STATE={page:'overview',overview:null,events:[],sources:[],geography:{year_a:2020,year_b:2024,level:'state',state:'ALL'},congress:{year:2024,chamber:'house',state:'ALL'},evidence:{year_a:2020,year_b:2024}};

function header(title,intro,eyebrow='UNITED STATES · ELECTION INTELLIGENCE'){
 return `<div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="page-intro">${intro}</p>`;
}
// Schematic US tile positions. These are not physical boundaries or geographic area.
const tileRows=[
  {0:'AK',1:'WA',11:'ME'},
  {1:'OR',2:'ID',3:'MT',4:'ND',5:'MN',6:'WI',7:'MI',9:'NY',10:'VT',11:'NH'},
  {1:'CA',2:'NV',3:'WY',4:'SD',5:'IA',6:'IL',7:'IN',8:'OH',9:'PA',10:'MA',11:'RI'},
  {2:'UT',3:'CO',4:'NE',5:'MO',6:'KY',7:'WV',8:'VA',9:'MD',10:'NJ',11:'CT'},
  {2:'AZ',3:'NM',4:'KS',5:'OK',6:'AR',7:'TN',8:'NC',9:'SC',10:'DE',11:'DC'},
  {0:'HI',4:'TX',5:'LA',6:'MS',7:'AL',8:'GA',9:'FL'}
];
const tileCoords=Object.fromEntries(tileRows.flatMap((r,i)=>Object.entries(r).map(([col,st])=>[st,[i+1,Number(col)+1]])));
const tileSequence=Object.keys(tileCoords);
const stateOptions = [['ALL','All states and DC'], ...tileSequence.slice().sort().map(code=>[code,stateNames[code]])];

function renderGeography() {
 const s = STATE.geography;
 $('#app-content').innerHTML = header('Where did the presidential margin move?','Compare two presidential elections. The map shows state swings. Filters update the chart and table.','PRESIDENTIAL RETURNS · 2008–2024')+
 `<div class="controlbar">${field('Starting election','geo-a',yearOptions(true),s.year_a)}${field('Ending election','geo-b',yearOptions(true),s.year_b)}${field('Resolution','geo-level',[['state','State'],['county','County / reporting unit']],s.level)}${field('Focus state','geo-state',stateOptions,s.state)}<button class="button" id="geo-apply">Compare margins</button></div>
 <div id="geo-explain" aria-live="polite"><p>Loading comparison…</p></div>
 <div class="grid2"><div>${panel('State swings','Select a tile to focus on that state.','<div id="geo-tile" class="tile-map"></div><div id="geo-hover" class="tile-info">Focus or hover over a state for its margin.</div><div class="legend">Toward R <span class="gradient"></span> Toward D</div>','STATE VIEW')}</div>
 <div>${panel('<span id="geo-headline">Largest changes in margin</span>','<span id="geo-description">Ranked by swing size.</span>','<div id="geo-margins"></div><div id="geo-chart"></div>','PERCENTAGE POINTS')}</div></div>
 ${panel('Inspect comparable units','Up to 400 rows, ranked by swing size.','<div id="geo-table"></div>','DETAILS')}`;
 $('#geo-apply').onclick = () => {
  Object.assign(s,{year_a:+$('#geo-a').value,year_b:+$('#geo-b').value,level:$('#geo-level').value,state:$('#geo-state').value});
  renderGeography();
 };
 loadGeography({...s},$('#geo-explain'));
}

async function loadGeography(s,target) {
 try {
  const baseQuery = `/api/geography?year_a=${s.year_a}&year_b=${s.year_b}`;
  const comparison = fetchJSON(`${baseQuery}&level=${s.level}&state=${s.state}`);
  const states = s.level==='state' && s.state==='ALL' ? comparison : fetchJSON(`${baseQuery}&level=state`);
  const [result,map] = await Promise.all([comparison,states]);
  if (!target.isConnected) return;
  const byState = Object.fromEntries(map.rows.map(row=>[row.state_po,row]));
  const base = $('#geo-tile');
  base.innerHTML = tileSequence.map(code=>{
   const value = byState[code]?.swing_pp;
   const strength = Math.min(.92,.26+Math.abs(value ?? 0)/30);
   const color = value===undefined?'#25374b':value>=0?`rgba(82,154,226,${strength})`:`rgba(222,101,115,${strength})`;
   return `<button class="tile" data-state="${code}" aria-label="${stateNames[code]}, ${fmt(value)} points" aria-pressed="${s.state===code}" style="background:${color};grid-row:${tileCoords[code][0]};grid-column:${tileCoords[code][1]}">${code}</button>`;
  }).join('');
  base.querySelectorAll('.tile').forEach(tile=>{
   const code = tile.dataset.state;
   const row = byState[code];
   tile.onfocus = tile.onmouseenter = () => {
    $('#geo-hover').textContent = row ? `${stateNames[code]} · ${signedMargin(row.margin_a)} to ${signedMargin(row.margin_b)}` : `${stateNames[code]} · no comparable rows`;
   };
   tile.onclick = () => { STATE.geography.state=code; renderGeography(); };
  });
  if (result.status!=='ready' || !result.rows.length) {
   target.innerHTML = notice(esc(result.message || 'The selected years and geography have no comparable reporting units.'),true);
   return;
  }
  const rows = result.rows;
  const label = row => s.level==='state'?stateNames[row.state_po]:`${row.county_name||row.unit_id}, ${row.state_po}`;
  const [first] = rows;
  const direction = first.swing_pp>0?'Democrats':'Republicans';
  const single = rows.length===1;
  const movement = fmt(Math.abs(first.swing_pp));
  $('#geo-headline').textContent = first.swing_pp ?
   `${label(first)} moved${single?'':' the most,'} ${movement} points toward ${direction}` :
   single ? `The margin in ${label(first)} was unchanged` : 'Margins were unchanged in the selected comparison';
  const omitted = result.total_matched - result.comparable;
  const flipSummary = `${whole(result.total_flips)} of ${whole(result.comparable)} comparable units switched major-party leads.`;
  let takeaway;
  if (single) {
   const start = first.winner_a;
   const end = first.winner_b;
   const party = end==='D'?'Democrats':'Republicans';
   takeaway = first.flip ? `${party} took the major-party lead in ${s.year_b}.`
    : end==='Tie' ? `The two major parties tied in ${s.year_b}.`
    : start==='Tie' ? `${party} took the lead after a tie in ${s.year_a}.`
    : `${party} led in both elections.`;
  } else {
   const towardD = rows.filter(row=>row.swing_pp>0).length;
   const towardR = rows.filter(row=>row.swing_pp<0).length;
   const steady = rows.length-towardD-towardR;
   takeaway = `${whole(towardR)} moved toward Republicans. ${whole(towardD)} moved toward Democrats. ${whole(steady)} stayed the same. Each unit counts once.`;
  }
  target.innerHTML = notice(`<strong>${flipSummary}</strong> ${esc(takeaway)} ${omitted ? `${whole(omitted)} matched units lacked a usable margin. ` : ''}${esc(result.caveat)}`);
  if (single) {
   drawLocalMargin(s,first);
  } else {
   const top = rows.slice(0,12).reverse();
   chart('geo-chart',[{type:'bar',orientation:'h',x:top.map(row=>row.swing_pp),y:top.map(label),
    marker:{color:top.map(row=>row.swing_pp>=0?P.D:P.R)},hovertemplate:'%{y}<br>Margin swing %{x:+.2f} pp<extra></extra>'}],
    {height:top.length*26+76,margin:{l:70,r:20,t:20,b:50},xaxis:{title:'Margin change (pp)'},yaxis:{automargin:true},showlegend:false});
  }
  const location = s.level==='county'?[['Reporting unit','county_name']]:[];
  $('#geo-table').innerHTML = table([['State','state_po'],...location,[String(s.year_a),'margin_a',v=>esc(signedMargin(v))],
   [String(s.year_b),'margin_b',v=>esc(signedMargin(v))],['Change (pp)','swing_pp',v=>fmt(v)],['Lead switched','flip',v=>v?'Yes':'No']],rows.slice(0,400));
 } catch(error) {
  if (target.isConnected) target.innerHTML = notice(esc(error.message),true);
 }
}

function drawLocalMargin(s,row) {
 const years = [s.year_a,s.year_b];
 const margins = [row.margin_a,row.margin_b];
 const maxMargin = Math.max(5,...margins.map(Math.abs))*1.12;
 $('#geo-description').textContent = 'Margin = Democratic share minus Republican share.';
 $('#geo-margins').innerHTML = `<div class="geo-margin-summary">${margins.map((margin,index)=>
  `<div><span>${years[index]} margin</span><strong>${signedMargin(margin)}</strong></div>`).join('')}</div>`;
 chart('geo-chart',[{type:'scatter',mode:'lines+markers',x:margins,y:[1,0],customdata:years,
  line:{color:'#8199b3',width:2},marker:{size:10,symbol:['circle','diamond'],color:margins.map(value=>value>0?P.D:value<0?P.R:'#8e9bae')},
  hovertemplate:'%{customdata}: %{x:+.2f} pp<extra></extra>'}],
  {height:145,margin:{l:46,r:14,t:10,b:45},showlegend:false,
   xaxis:{title:'D minus R (pp)',range:[-maxMargin,maxMargin],zeroline:true,zerolinecolor:'#9ab1c8'},
   yaxis:{tickmode:'array',tickvals:[1,0],ticktext:years.map(String),range:[-.45,1.45],showgrid:false}});
}

function renderCongress() {
 const rows = STATE.overview.rows;
 const s = STATE.congress;
 const selected = rows.find(row=>row.year===s.year);
 const control = selected.dem_house>selected.rep_house?'Democrats':'Republicans';
 const seatDifference = Math.abs(selected.dem_house-selected.rep_house);
 const first = rows.find(row=>row.year===2012);
 const winner = row => Math.sign(row.dem_house-row.rep_house);
 const voteWinner = row => Math.sign(row.dem_house_vote_pct-row.rep_house_vote_pct);
 const flips = rows.slice(1).filter((row,index)=>winner(row)!==winner(rows[index])).length;
 const aligned = rows.filter(row=>voteWinner(row)===winner(row)).length;
 const voteMargin = Math.abs(selected.dem_house_vote_pct-selected.rep_house_vote_pct);
 const voteLeader = voteWinner(selected)>0?'Democrats':'Republicans';
 const voteSeatComparison = voteWinner(selected)===winner(selected)
  ? `${control} also led the nationwide House vote by ${fmt(voteMargin)} points.`
  : `${voteLeader} led the nationwide House vote by ${fmt(voteMargin)} points. Each district awards one seat. A national vote lead can yield fewer seats.`;
 const jurisdictions = stateOptions.filter(([code])=>code!=='DC');
 jurisdictions[0] = ['ALL','All states'];
 $('#app-content').innerHTML = header('How did votes translate into House seats?','Compare votes and seats. Explore House or Senate contests.','CONGRESSIONAL ELECTIONS · 2008–2024')+
 `${notice(`<strong>${s.year} House result. ${control} won ${whole(seatDifference)} more seats.</strong> ${whole(selected.dem_house)} Democratic seats. ${whole(selected.rep_house)} Republican seats. ${voteSeatComparison}${selected.house_unfilled ? ' One seat remained unfilled after the general election.' : ''} ${sourceLinks(...new Set([selected.house_seats_source,selected.house_source]))}`)}
 <div class="grid2"><div>${panel(`The House majority changed parties ${whole(flips)} times`,'General elections, 2008–2024. Grey marks the unfilled 2018 seat.','<div id="con-seat" class="chart"></div>')}</div>
 <div>${panel('House vote and seat leads diverged in 2012',`The national House vote was ${fmt(first.dem_house_vote_pct)}% Democratic and ${fmt(first.rep_house_vote_pct)}% Republican.`,`<div id="con-vote" class="chart"></div><p class="chart-takeaway">Vote and seat leaders matched in ${whole(aligned)} of ${whole(rows.length)} cycles. In 2012, Democrats led the vote by ${fmt(first.dem_house_vote_pct-first.rep_house_vote_pct)} points. Republicans won ${whole(first.rep_house-first.dem_house)} more seats. National totals hide district-level patterns.</p>`)}</div></div>
 ${panel('Inspect an individual contest','Certified rows link to official results. Other rows show the lead in available counts.',`<div class="controlbar">${field('Chamber','con-chamber',[['house','U.S. House'],['senate','U.S. Senate']],s.chamber)}${field('Election cycle','con-year',yearOptions(),s.year)}${field('State','con-state',jurisdictions,s.state)}<button class="button" id="con-apply">Find contests</button></div><div id="con-races" aria-live="polite">Loading contests…</div>`,'HOUSE AND SENATE')}`;
 const years=rows.map(row=>row.year);
 const x=years.map(String);
 const series=[['Democratic','dem_house','dem_house_vote_pct',P.D],['Republican','rep_house','rep_house_vote_pct',P.R]];
 chart('con-seat',[...series.map(([name,key,,color])=>({type:'bar',name,x,y:rows.map(row=>row[key]),marker:{color}})),
  {type:'bar',name:'Unfilled',x,y:rows.map(row=>row.house_unfilled),marker:{color:'#8e9bae'}}],
  {barmode:'stack',xaxis:{type:'category'},yaxis:{title:'Voting seats',range:[0,442]}});
 chart('con-vote',series.map(([name,,key,color])=>({type:'scatter',mode:'lines+markers',name,x:years,y:rows.map(row=>row[key]),line:{color,width:3}})),
  {xaxis:{type:'linear',tickmode:'array',tickvals:years,tickformat:'d'},yaxis:{title:'Share of all House votes (%)',range:[40,56]},shapes:[{type:'line',x0:2012,x1:2012,y0:0,y1:1,yref:'paper',line:{color:'#8e9bae',dash:'dot'}}]});
 $('#con-apply').onclick = () => {
  Object.assign(s,{chamber:$('#con-chamber').value,year:+$('#con-year').value,state:$('#con-state').value});
  renderCongress();
 };
 loadCongress({...s},$('#con-races'));
}

async function loadCongress(s,target) {
 try {
  const result = await fetchJSON(`/api/congress?chamber=${s.chamber}&year=${s.year}&state=${s.state}`);
  if (!target.isConnected) return;
  if (!result.rows.length) {
   target.innerHTML = notice(esc(result.message || 'The source extract contains no contests for these filters.'));
   return;
  }
  const statuses = {certified:'Certified result',no_certified_winner:'No certified winner',source_lead:'Lead in source counts',unofficial_lead:'Unofficial lead',tied_source_counts:'Tied source counts'};
  target.innerHTML = `<p class="result-summary"><strong>${whole(result.rows.length)} contests in this extract.</strong> ${esc(result.caveat)}</p>`+
   table([['State','state_po'],['Contest',s.chamber==='house'?'district':'special',v=>s.chamber==='house'?(v===0?'At-large':`District ${v}`):(v?'Special':'Regular')],
    ['Candidate','winner'],['Party','winner_party'],['Votes','winner_votes',whole],['Top-two margin','top_two_margin_votes',whole],
    ['Status','status',(v,row)=>`${esc(statuses[v]||v)}${row.note?`<br><small>${esc(row.note)}</small>`:''}${row.source_url?`<br><a href="${esc(row.source_url)}" target="_blank" rel="noopener noreferrer">Official source ↗</a>`:''}`]],result.rows);
 } catch(error) {
  if (target.isConnected) target.innerHTML = notice(esc(error.message),true);
 }
}

const economicIndicators = [['UNRATE','Unemployment rate (%)'],['CPIAUCSL','Consumer price index'],['FEDFUNDS','Federal funds rate (%)'],['UMCSENT','Consumer sentiment index']];

function renderEconomy() {
 $('#app-content').innerHTML = header('What was the economic backdrop?', 'Compare October readings across election years. FRED data is optional.','ECONOMY · 2008–2024')+
 `<div class="controlbar">${field('Indicator','econ-indicator',economicIndicators,'UNRATE')}</div>
 ${panel('<span id="econ-title">Compare the October readings</span>','FRED may publish October readings later and revise them.','<div id="econ-summary" aria-live="polite">Loading series…</div><div id="econ-chart" class="chart" hidden></div>','FRED')}`;
 loadEconomy($('#econ-indicator'),$('#econ-summary'));
}

async function loadEconomy(indicator,target) {
 try {
  const data=await fetchJSON('/api/economy');
  if (!target.isConnected) return;
  if (data.status!=='ready') {
   target.innerHTML = notice(`${esc(data.message)} <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer">Open FRED ↗</a>`);
   return;
  }
  indicator.onchange = () => drawEconomy(indicator.value,data.rows,target);
  drawEconomy(indicator.value,data.rows,target);
 } catch(error) {
  if (target.isConnected) target.innerHTML = notice(esc(error.message),true);
 }
}

function drawEconomy(series,rows,target) {
 const dates = new Set(STATE.overview.rows.map(row=>`${row.year}-10-01`));
 const observations = rows.filter(row=>row.series===series&&row.value!==null&&dates.has(row.date)).sort((a,b)=>a.date.localeCompare(b.date));
 const name = economicIndicators.find(([id])=>id===series)[1];
 $('#econ-chart').hidden = observations.length===0;
 if (!observations.length) {
  $('#econ-title').textContent = name;
  target.textContent = 'The imported series has no October observations for these election years.';
  return;
 }
 const peak = observations.reduce((max,row)=>row.value>max.value?row:max);
 const last = observations.at(-1);
 const previous = observations.at(-2);
 const lastYear = last.date.slice(0,4);
 let comparison = 'Only one October election-year observation is available.';
 if (previous) {
  const isPrice = series==='CPIAUCSL' && previous.value>0;
  const difference = last.value-previous.value;
  const change = isPrice ? difference/previous.value*100 : difference;
  const unit = isPrice ? '%' : ['CPIAUCSL','UMCSENT'].includes(series) ? ' index points' : ' percentage points';
  const movement = difference===0?'It matched':`That was ${fmt(Math.abs(change),2)}${unit} ${difference>0?'above':'below'}`;
  comparison = `October ${lastYear} was ${fmt(last.value,2)}. ${movement} October ${previous.date.slice(0,4)} (${fmt(previous.value,2)}).`;
 }
 $('#econ-title').textContent = `${name} across election cycles`;
 target.innerHTML = `<p class="result-summary">${esc(comparison)} Peak in this view was ${fmt(peak.value,2)} in October ${peak.date.slice(0,4)}.</p>
  <p class="footnote">${series==='CPIAUCSL'?'Price change covers the full interval. ':''}These trends show economic context. Causal claims need separate evidence. For original releases, see <a href="https://alfred.stlouisfed.org/" target="_blank" rel="noopener noreferrer">ALFRED vintages ↗</a>.</p>`;
 chart('econ-chart',[{type:'scatter',mode:'lines+markers',x:observations.map(row=>row.date.slice(0,4)),y:observations.map(row=>row.value),
  line:{color:P.T,width:3},marker:{size:8},name}],{showlegend:false,xaxis:{type:'category',title:'Election year'},yaxis:{title:name}});
}

function renderEvidence(){let s=STATE.evidence;
 $('#app-content').innerHTML=header('What changed between these elections?','Compare seats, turnout and presidential margins. Explore follow-up questions.','HISTORICAL COMPARISONS')+
 `<div class="controlbar">${field('Election A','evi-a',yearOptions(),s.year_a)}${field('Election B','evi-b',yearOptions(),s.year_b)}<button class="button" id="evi-apply">Compare elections</button></div>
 <div class="grid2"><div>${panel('What the data establish','Changes from published election data.','<div id="evi-findings"></div>','OBSERVED')}</div><div>${panel('Research questions and contextual events','These questions are hypotheses.','<div id="evi-events"></div>','INTERPRETIVE')}</div></div>
 ${panel('Model diagnostics: state unemployment vs presidential margin','Optional model using all five presidential elections. It uses January–October unemployment and state and year fixed effects.','<div id="evi-model"></div>','ASSOCIATION ≠ CAUSATION')}
 ${panel('Evidence grading protocol','What each type of evidence can show.',`<div class="analysis-card"><div class="analysis-type">Tier 1: directly observed</div><p>Reports votes, seats, turnout and other measurements. Check the source and denominator.</p></div><div class="analysis-card"><div class="analysis-type">Tier 2: measured association</div><p>Measures relationships across states or counties. Individual motives require voter-level evidence.</p></div><div class="analysis-card"><div class="analysis-type">Tier 3: plausible interpretation</div><p>Draws on surveys and studies. Events can suggest hypotheses.</p></div><div class="analysis-card"><div class="analysis-type">Tier 4: causal evidence, where defensible</div><p>Needs a research design that can isolate cause. Check robustness and limitations.</p></div>`,'METHODOLOGY')}`;
 $('#evi-apply').onclick=()=>{s.year_a=+$('#evi-a').value;s.year_b=+$('#evi-b').value;renderEvidence()};loadEvidence({...s},$('#evi-findings'));
}
async function loadEvidence(s,target){
 try {
 const d=await fetchJSON(`/api/evidence?year_a=${s.year_a}&year_b=${s.year_b}`);
 if (!target.isConnected) return;
 $('#evi-findings').innerHTML=d.findings.map(f=>`<article class="analysis-card"><div class="analysis-type">${esc(f.kind)}</div><h3>${esc(f.title)}</h3><p>${esc(f.statement)}</p><div class="brief-source">${sourceLinks(...f.source)}</div></article>`).join('')+`<p class="footnote">${esc(d.method_note)}</p>`;
 let events=STATE.events.filter(x=>x.year>=Math.min(s.year_a,s.year_b)&&x.year<=Math.max(s.year_a,s.year_b));
 $('#evi-events').innerHTML=events.map(e=>`<article class="analysis-card"><div class="analysis-type">${e.year} · ${esc(e.category)}</div><h3>${esc(e.label)}</h3><p>${esc(e.question)}</p>${e.sources.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">Source ↗</a>`).join(' ')}</article>`).join('');
 let m=await fetchJSON('/api/model');
 if (!target.isConnected) return;
 $('#evi-model').innerHTML=m.status==='ready'?`<div class="kpi-row"><div class="kpi"><div class="kpi-label">Observations</div><div class="kpi-value">${m.observations}</div></div><div class="kpi"><div class="kpi-label">Slope (pp per 1pp rate)</div><div class="kpi-value">${fmt(m.slope,2)}</div></div><div class="kpi"><div class="kpi-label">95% interval</div><div class="kpi-value" style="font-size:20px">${fmt(m.ci_low,2)} to ${fmt(m.ci_high,2)}</div></div><div class="kpi"><div class="kpi-label">R²</div><div class="kpi-value">${fmt(m.r_squared,3)}</div></div></div><p class="footnote">${esc(m.specification)}. ${esc(m.caveat)}</p>`:notice(`<strong>Exploratory model not run.</strong> ${esc(m.message||'Insufficient imported observations.')}<div class="code-line">python scripts/ingest.py --economy --state-labor</div><div class="code-line">python scripts/analyze.py</div>`);
 } catch(error) {
  if (target.isConnected) target.innerHTML=notice(esc(error.message),true);
 }
}
function renderSources(){
 $('#app-content').innerHTML=header('Data, methods and provenance','Inspect every upstream source and see which inputs are bundled, downloaded on demand, or still planned. Reproducibility takes priority over apparent completeness.','DATA CATALOG · LICENCES · REPRODUCIBILITY')+
 `${panel('Current data readiness','The release includes national summaries, historical returns and voter research. The optional FRED layer is imported locally.',`<div class="coverage">${badges(STATE.overview.coverage)}</div><div class="controlbar"><a class="button" href="/api/download/historical_summary" download>Export historical CSV ↧</a>${window.OFFLINE_SNAPSHOT ? '' : '<a class="button ghost" href="/docs" target="_blank" rel="noopener">Browse API documentation ↗</a>'}</div><div class="code-line">python scripts/ingest.py --economy</div><div class="code-line">python scripts/ingest.py --economy --state-labor</div><p class="footnote">Source websites may change their file formats. The importer prints failures instead of generating placeholders. After ingestion, refresh this page. See README for coverage and known limitations.</p>`,'DATA PIPELINE')}
 ${panel('Source registry','Open a publisher site, citation or data repository. Each integration has a documented status.',`<div class="sources-grid">${STATE.sources.map(s=>`<article class="source-card"><h3>${esc(s.name)}</h3><p>${esc(s.dataset)}</p><p><strong>Status:</strong> ${esc(s.status)}<br/><strong>License:</strong> ${esc(s.license)}</p><a target="_blank" rel="noopener" href="${esc(s.url)}">View source ↗</a></article>`).join('')}</div>`,'REFERENCES')}
 ${panel('Export datasets','Download the datasets behind the charts. The release also includes a manifest and the official corrections for selected races.',`<div class="coverage">${['historical_summary',...Object.keys(STATE.overview.coverage).filter(n=>STATE.overview.coverage[n]&&n!=='state_unemployment.csv').map(n=>n.replace('.csv',''))].map(n=>`<a class="button ghost" href="/api/download/${n}" download style="display:inline-block">${esc(n.replaceAll('_',' '))} ↓</a>`).join('')}${['pew_new_and_returning','youth_turnout','pew_age_voting','pew_race_voting','youth_groups_2024','youth_issue_priorities_2024','pew_naturalized_voting','foreign_born_states_2024'].map(n=>`<a class="button ghost" href="/api/findings/download/${n}" download>${esc(n.replaceAll('_',' '))} ↓</a>`).join('')}</div>`,'CSV EXPORTS')}`;
}
function switchPage(page,focus=true) {
 const pages = {overview:renderOverview,geography:renderGeography,congress:renderCongress,
                economy:renderEconomy,findings:renderFindings,evidence:renderEvidence,sources:renderSources};
 if (!Object.hasOwn(pages,page)) return;
 STATE.page=page;
 document.querySelectorAll('.nav-button').forEach(button=>{
  const active=button.dataset.page===page;
  button.classList.toggle('active',active);
  if (active) {
   button.setAttribute('aria-current','page');
   $('#current-page').textContent=button.lastChild.textContent.trim();
  } else button.removeAttribute('aria-current');
 });
 pages[page]();
 if (focus) $('#app-content').focus({preventScroll:true});
 window.scrollTo({top:0,behavior:'instant'});
}
(async function boot(){try{[STATE.overview,STATE.events,STATE.sources]=await Promise.all([fetchJSON('/api/overview'),fetchJSON('/api/events'),fetchJSON('/api/sources')]);document.querySelectorAll('.nav-button').forEach(n=>n.onclick=()=>switchPage(n.dataset.page));switchPage('overview',false)}catch(e){$('#app-content').innerHTML=notice(`<strong>Dashboard failed to load:</strong> ${esc(e.message)}.`)}})();
