'use strict';
// Interpretive findings use published surveys and ACS estimates, never invented voter-level data.
let FINDINGS = null;
let FINDING_ASSOC = null;
let FINDING_PREFS = {youthBreakdown:'Gender',immMetric:'foreign_born_pct',immState:'CA',raceYear:2024,ageYear:2024};
const findingLink=(url,label='Examine the original research')=>`<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
const findingStory=(label,headline,interpretation,limitation,sourceUrl)=>`<div class="finding-copy"><span class="finding-label">${esc(label)}</span><h3>${esc(headline)}</h3><p>${esc(interpretation)}</p><div class="finding-caveat"><strong>Limitations.</strong> ${esc(limitation)}</div>${findingLink(sourceUrl)}</div>`;
const PEW_VOTE_REPORT = 'https://www.pewresearch.org/wp-content/uploads/sites/20/2025/06/PP-2025.6.26_validated-voters_report.pdf';
const demographicYears = [2016,2020,2024];
const nominees = {2016:['Clinton','Trump'],2020:['Biden','Trump'],2024:['Harris','Trump']};
const demographicBreakdowns = {
 race: {
  title:'Race & ethnicity', field:'race_group', groups:['White','Black','Hispanic','Asian'],
  dataset:'pew_race_voting', page:24, datasetTitle:'Race and ethnicity',
  trend:'The Hispanic Democratic lead fell from 25 points in 2020 to 3 in 2024. Black and Asian leads also narrowed. Pew linked much of the Black and Hispanic shift to who turned out.',
  limit:'White, Black and Asian groups are single-race and non-Hispanic. Hispanic voters can be of any race. Asian estimates cover English speakers only. Pew has no 2016 Asian estimate. Some samples are small.'
 },
 age: {
  title:'Age groups', field:'age_group', groups:['18–29','30–49','50–64','65+'],
  dataset:'pew_age_voting', page:26, datasetTitle:'Age',
  trend:'The Democratic lead among 18–29s fell from 30 to 26 to 19 points. Among 30–49s, it fell from 12 to 2 points after 2020.',
  limit:'Age groups change each election. Swings can reflect who voted or who aged into a group.'
 }
};

function findingChart(title, description, id, interpretation, limitation, source) {
 return `<article class="panel finding-chart-card">
  <header class="panel-header"><div><h3>${esc(title)}</h3><p class="panel-desc">${esc(description)}</p></div></header>
  <div class="chart" id="${esc(id)}"></div>
  <div class="finding-chart-note"><p>${esc(interpretation)}</p><p class="footnote">${esc(limitation)}</p>
  ${findingLink(source,'Source and methodology')}</div>
 </article>`;
}

function demographicSection(key, index) {
 const info = demographicBreakdowns[key];
 return `<section id="voter-${key}" class="demographic-section" aria-labelledby="voter-${key}-title">
  <div class="chapter-heading"><span>${index} / PRESIDENTIAL VOTE CHOICE</span><h2 id="voter-${key}-title">${esc(info.title)}</h2></div>
  <article class="panel demographic-panel">
   <header class="panel-header"><div aria-live="polite"><h3 id="fi-${key}-headline"></h3><p class="chart-takeaway" id="fi-${key}-takeaway"></p></div></header>
   <div class="demographic-grid">
    <div class="demographic-graphic">
     <div class="demographic-heading"><h4>Candidate support within each group</h4>
     ${field('Election year',`fi-${key}-year`,demographicYears.map(year=>[year,year]),FINDING_PREFS[key+'Year'])}</div>
     <div id="fi-${key}-shares" aria-live="polite"></div>
    </div>
    <div class="demographic-graphic">
     <h4>How the margin changed, 2016–2024</h4>
     <div id="fi-${key}" class="demographic-trend" role="img" aria-label="${esc(info.datasetTitle)} group margins by election year"></div>
     <p class="demographic-context">${esc(info.trend)}</p>
    </div>
   </div>
   <p class="footnote">Pew verified turnout. Voters reported their choices. Shares are within each group. ${esc(info.limit)}</p>
   <div class="demographic-links">${findingLink(PEW_VOTE_REPORT+`#page=${info.page}`,'View Pew’s source table')}
   <a class="source-link" href="/api/findings/download/${info.dataset}" download>Download chart data (CSV) ↓</a></div>
   <details class="demographic-table"><summary>View all chart values</summary><div id="fi-${key}-data"></div></details>
  </article>
 </section>`;
}

function drawCandidateShares(key) {
 const info = demographicBreakdowns[key];
 const year = FINDING_PREFS[key+'Year'];
 const [dem,rep] = nominees[year];
 const estimates = FINDINGS.datasets[info.dataset];
 const rows = estimates.filter(row=>row.year===year);
 describeDemographics(key,year,rows,estimates);
 const bar = (candidate,value,party) => `<div class="demographic-bar-row" role="img" aria-label="${candidate}, ${value}%">
  <span class="demographic-bar-track" aria-hidden="true"><span class="demographic-bar-fill ${party}" style="--share:${value}%"></span></span>
  <b aria-hidden="true">${value}%</b></div>`;
 $(`#fi-${key}-shares`).innerHTML = `<div class="demographic-scale"><span>0%</span><span>100%</span></div>
  <div class="demographic-legend"><span class="dem">${dem}</span><span class="rep">${rep}</span></div>
  ${info.groups.map(group=>{
   const row = rows.find(value=>value[info.field]===group);
   return `<div class="demographic-group"><h5>${esc(group)}</h5>
   ${row && Number.isFinite(row.dem_pct) && Number.isFinite(row.rep_pct)
    ? bar(dem,row.dem_pct,'dem')+bar(rep,row.rep_pct,'rep')
    : '<p class="footnote">Estimate unavailable for this election.</p>'}</div>`;
  }).join('')}`;
}

function describeDemographics(key,year,rows,estimates) {
 const {field} = demographicBreakdowns[key];
 const groupLabel = row => key==='age' ? `voters aged ${row[field]}` : `${row[field]} voters`;
 const [dem,rep] = nominees[year];
 const ranked = rows.filter(row=>Number.isFinite(row.dem_margin_pp))
  .sort((a,b)=>Math.abs(b.dem_margin_pp)-Math.abs(a.dem_margin_pp));
 const [widest] = ranked;
 const closest = ranked.at(-1);
 const headline = $(`#fi-${key}-headline`);
 const takeaway = $(`#fi-${key}-takeaway`);
 if (!widest) {
  headline.textContent = `${year} vote choice`;
  takeaway.textContent = 'No estimates are available for this election.';
  return;
 }
 headline.textContent = widest.dem_margin_pp===0 ? `Estimated margins were tied in ${year}`
  : `In ${year}, ${widest.dem_margin_pp>0?dem:rep} led among ${groupLabel(widest)} by ${whole(Math.abs(widest.dem_margin_pp))} points`;
 const contrast = closest===widest ? '' : closest.dem_margin_pp===0
  ? `The two candidates were tied among ${groupLabel(closest)}.`
  : `Closest split among ${groupLabel(closest)}. ${dem} ${whole(closest.dem_pct)}%. ${rep} ${whole(closest.rep_pct)}%.`;
 const previous = demographicYears[demographicYears.indexOf(year)-1];
 const shifts = ranked.flatMap(row=>{
  const earlier = estimates.find(item=>item.year===previous && item[field]===row[field]);
  return Number.isFinite(earlier?.dem_margin_pp) ? [{row,change:row.dem_margin_pp-earlier.dem_margin_pp}] : [];
 }).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
 const [largest] = shifts;
 const movement = largest?.change
  ? `The largest comparable swing since ${previous} was among ${groupLabel(largest.row)}. It moved ${whole(Math.abs(largest.change))} points toward ${largest.change>0?'Democrats':'Republicans'}.`
  : '';
 takeaway.textContent = [contrast,movement].filter(Boolean).join(' ');
}

function drawDemographics(key) {
 const info = demographicBreakdowns[key];
 const rows = FINDINGS.datasets[info.dataset];
 drawCandidateShares(key);
 $(`#fi-${key}-year`).onchange = event => {
  FINDING_PREFS[key+'Year'] = Number(event.target.value);
  drawCandidateShares(key);
 };
 $(`#fi-${key}-data`).innerHTML = table([
  ['Year','year'],['Group',info.field],['Democratic','dem_pct',v=>v===null?'—':`${v}%`],
  ['Republican','rep_pct',v=>v===null?'—':`${v}%`],['D minus R','dem_margin_pp',v=>v===null?'—':`${v>0?'+':''}${v} pp`]
 ],rows);
 chart(`fi-${key}`,info.groups.map((group,index)=>{
  const groupRows = rows.filter(row=>row[info.field]===group);
  const color = [P.T,P.Y,'#bd9df0','#82baff'][index];
  return {type:'scatter',mode:'lines+markers',name:group,x:groupRows.map(row=>row.year),y:groupRows.map(row=>row.dem_margin_pp),
   connectgaps:false,line:{color,width:3},marker:{size:8,symbol:['circle','square','diamond','triangle-up'][index]},
   hovertemplate:`%{x}<br>${group}: %{y:+.0f} pp<extra></extra>`};
 }),{height:290,margin:{l:44,r:12,t:55,b:46},legend:{orientation:'h',y:1.05,yanchor:'bottom'},
  xaxis:{type:'linear',tickmode:'array',tickvals:demographicYears,range:[2015.5,2024.5]},
  yaxis:{title:'D minus R (pp)',zeroline:true,zerolinecolor:'#a0b5c9'}});
}
async function renderFindings(){
 $('#app-content').innerHTML=header('Who turned out, and whom did they support?','The analysis compares participation, vote choices and demographic context.','VOTER FINDINGS · 2016–2024')+`<div class="finding-loading">Loading validated-voter surveys and Census estimates…</div>`;
 const loading = $('.finding-loading');
 try {
   [FINDINGS,FINDING_ASSOC] = await Promise.all([
    FINDINGS || fetchJSON('/api/findings'),
    FINDING_ASSOC || fetchJSON('/api/findings/state-association').catch(()=>null)
   ]);
   if(!loading.isConnected) return;
   if(FINDINGS.status!=='ready') throw Error('Findings are not yet available');
   const datasets=FINDINGS.datasets;
   const youth2024 = datasets.youth_turnout.find(row=>row.year===2024);
   const firstTime = datasets.pew_new_and_returning[0];
   const naturalized = datasets.pew_naturalized_voting.find(row=>row.year===2024);
   const foreign=datasets.foreign_born_states_2024.filter(x=>x.state_po!=='PR');
   const top=[...foreign].sort((a,b)=>b.foreign_born_count-a.foreign_born_count);
   const top5total=top.slice(0,5).reduce((a,x)=>a+x.foreign_born_count,0);
   const total=foreign.reduce((a,x)=>a+x.foreign_born_count,0);
   $('#app-content').innerHTML=header('Who turned out, and whom did they support?','Surveys show vote choice. Census estimates show where residents live.','VOTER FINDINGS · 2016–2024')+
   `<div class="findings-hero"><div><div class="eyebrow">2024 ELECTORAL BEHAVIOUR</div><h2>Vote choice by <span>race and age</span></h2><p>Compare vote choice in 2016, 2020 and 2024.</p><nav class="findings-jumps" aria-label="Voter findings charts"><a href="#voter-race">Race &amp; ethnicity ↓</a><a href="#voter-age">Age groups ↓</a><a href="#newvoters">New voters ↓</a><a href="#genz">Youth turnout ↓</a><a href="#immigration">Immigration ↓</a></nav></div><div class="findings-big">2024<span>SURVEY LENSES</span></div></div>
   <div class="kpi-row findings-metrics">
     <div class="kpi"><div class="kpi-label">2024 youth voter turnout</div><div class="kpi-value teal">${fmt(youth2024.turnout_pct,0)}%</div><div class="kpi-caption">Estimated ages 18–29 · CIRCLE</div></div>
     <div class="kpi"><div class="kpi-label">Young first-time voters favoring Harris</div><div class="kpi-value blue">${fmt(firstTime.dem_pct,0)}%</div><div class="kpi-caption">2024 VoteCast youth subgroup</div></div>
     <div class="kpi"><div class="kpi-label">Naturalized voters favoring Harris</div><div class="kpi-value blue">${fmt(naturalized.dem_pct,0)}%</div><div class="kpi-caption">2024 Pew validated-voter study</div></div>
     <div class="kpi"><div class="kpi-label">Foreign-born residents in California</div><div class="kpi-value teal">${fmt(top[0].foreign_born_count/1e6)}m</div><div class="kpi-caption">2024 ACS, includes noncitizens</div></div>
   </div>
   ${notice('<strong>Read the denominators.</strong> CIRCLE/AP VoteCast and Pew validated-voter estimates come from different surveys. “Foreign-born residents” includes people who cannot vote in federal elections.')}
   ${demographicSection('race','01')}
   ${demographicSection('age','02')}
   <div id="newvoters" class="chapter-heading"><span>03 / PARTICIPATION</span><h2>Who are the new voters, and where did they lean?</h2></div>
   ${findingChart('Harris led young first-timers. Trump led voters who skipped 2020.','2024 presidential vote preferences within each survey group.','fi-first',
    'Harris had 54% among young first-time voters (VoteCast). Trump had 54% among voters who skipped 2020 (Pew).',
    'The groups can overlap. The surveys use different definitions.', 'https://www.pewresearch.org/politics/2025/06/26/behind-trumps-2024-victory-a-more-racially-and-ethnically-diverse-voter-coalition/')}
   <div id="genz" class="chapter-heading"><span>04 / YOUTH &amp; GENERATIONS</span><h2>How did young voters participate?</h2></div>
   ${findingChart('Youth turnout reached 47%, three points below 2020','Share of eligible 18–29-year-olds who voted, as estimated by CIRCLE.','fi-turnout',
    'Turnout was 39% in 2016. It rose to 50% in 2020 and fell to 47% in 2024.',
    'The revised 2024 estimate uses voter files from 40 states with adequate age information.', 'https://circle.tufts.edu/latest-research/new-data-nearly-half-youth-voted-2024')}
   <div class="grid2 grid-equal"><div>${panel('<span id="fi-groups-title">Young voters split across groups</span>','Select a group to compare the Democratic minus Republican margin.',`<div class="controlbar">${field('2024 youth grouping','fi-youth-category',[['Gender','Gender'],['Race / ethnicity','Race and ethnicity'],['Education','Education'],['Community','Urban and rural']],FINDING_PREFS.youthBreakdown)}</div><div id="fi-groups" class="chart chart-tall"></div>`,'AP VOTECAST · CIRCLE')}</div><div>${panel('Economy and jobs ranked first among young voters','Economy and jobs drew 40%. Abortion drew 13%. Immigration drew 11%. Other issues drew 36%.','<div id="fi-issues" class="chart chart-tall"></div>','AP VOTECAST · AGES 18–29')}</div></div>
   <div class="story-wide">${findingStory('THE INTERPRETATION','Young voters differed by group.','VoteCast found differences by gender, education, race and place. CIRCLE also linked issue priorities with candidate preference.','The survey shows associations. Ages 18–29 are not a pure Gen Z birth cohort. Small groups have more uncertainty.', 'https://circle.tufts.edu/2024-election')}</div>
   <div id="immigration" class="chapter-heading"><span>05 / IMMIGRATION &amp; ELECTORATE</span><h2>Immigration and voting</h2></div>
   <div class="grid2 grid-equal"><div>${panel('California had the largest foreign-born share','The ACS put California at 27.6% in 2024. Tile colours show resident shares.',`<div id="fi-imm-map" class="tile-map findings-tile-map"></div><div id="fi-imm-hover" class="tile-info">Click a state to inspect the Census estimate.</div><div class="legend">Lower share <span class="gradient imm-gradient"></span> Higher share</div>`,'2024 CENSUS ACS')}</div><div>${panel('<span id="fi-rank-title">Largest foreign-born populations</span>','Switch between resident counts and percentages to compare the rankings.',`<div class="controlbar">${field('Rank by','fi-imm-metric',[['foreign_born_pct','Share of state residents (%)'],['foreign_born_count','Number of foreign-born residents']],FINDING_PREFS.immMetric)}</div><div id="fi-imm-bars" class="chart chart-tall"></div>`,'50 STATES + DC')}</div></div>
   <div class="grid2 grid-equal"><div>${panel('Inspect a state','The estimate is of residents born abroad, including noncitizens.',`<div class="controlbar">${field('State or jurisdiction','fi-imm-state',datasets.foreign_born_states_2024.slice().sort((a,b)=>a.state.localeCompare(b.state)).map(x=>[x.state_po,x.state]),FINDING_PREFS.immState)}</div><div id="fi-imm-detail"></div>`,'90% CONFIDENCE MOE')}</div><div>${findingStory('THE INTERPRETATION',`Five states hold ${fmt(top5total/total*100,1)}% of the foreign-born residents in the states and DC.`,'California, Texas, Florida, New York and New Jersey lead by count. Use the selector to compare shares.','These figures cover all foreign-born residents. Voting eligibility and choices need separate data.', 'https://www.everycrsreport.com/reports/R48940.html')}</div></div>
   ${findingChart('The Democratic lead among naturalized voters shrank from 21 to 4 points','National vote choices among naturalized citizens who cast a ballot.','fi-naturalized',
    'Biden led 59% to 38% in 2020. Harris led 51% to 47% in 2024. Pew linked much of the change to who voted.',
    'The survey covers naturalized voters. The map covers all foreign-born residents.',
    'https://www.pewresearch.org/politics/2025/06/26/voting-patterns-in-the-2024-election/')}
   ${panel('Do high-immigration states also have different election margins?','This compares states. Individual vote choices need voter-level data.','<div id="fi-association"></div>','OPTIONAL · ECOLOGICAL ANALYSIS')}
   <div id="takeaways" class="chapter-heading"><span>06 / RESEARCH SYNTHESIS</span><h2>What should we check next?</h2></div>
   <div class="findings-takeaways">
      <article><span>OBSERVED</span><h3>Compare the same birth cohorts.</h3><p>Track the same cohorts over time. Separate switching from turnout changes.</p></article>
      <article><span>SUPPORTED</span><h3>Split the voters who sat out 2020.</h3><p>Separate first-time and returning voters. Use the same survey definitions.</p></article>
      <article><span>LIMITATION</span><h3>Use voter-level data for immigration questions.</h3><p>Use a survey with enough respondents in each state. Report uncertainty.</p></article>
   </div>
   ${panel('Primary source library','Check the research, definitions and methods.',`<div class="sources-grid">${FINDINGS.manifest.sources.map(s=>`<article class="source-card"><h3>${esc(s.title)}</h3><p>${esc(s.note)}</p>${findingLink(s.url,'Source and methodology')}</article>`).join('')}</div>`,'PROVENANCE')}
`;
   drawFindingsCharts();drawImmigration();drawStateAssociation();
   $('#fi-youth-category').onchange=e=>{FINDING_PREFS.youthBreakdown=e.target.value;drawYouthGroups()};
   $('#fi-imm-metric').onchange=e=>{FINDING_PREFS.immMetric=e.target.value;drawImmigration()};
   $('#fi-imm-state').onchange=e=>{FINDING_PREFS.immState=e.target.value;drawStateDetail()};
 } catch(e) {
  if (STATE.page!=='findings') return;
  const alert = notice('<strong>Some findings could not load.</strong> '+esc(e.message),true);
  if (loading.isConnected) loading.outerHTML = alert;
  else $('#app-content').insertAdjacentHTML('afterbegin',alert);
 }
}
function plotVoteSplit(id,rows,labels){
 const y=rows.map(x=>labels?labels(x):x.group);
 chart(id,[{type:'bar',orientation:'h',name:'Democratic candidate',y,x:rows.map(x=>x.dem_pct),marker:{color:P.D},hovertemplate:'%{y}<br>Democratic: %{x}%<extra></extra>'},
 {type:'bar',orientation:'h',name:'Republican candidate',y,x:rows.map(x=>x.rep_pct),marker:{color:P.R},hovertemplate:'%{y}<br>Republican: %{x}%<extra></extra>'},
 {type:'bar',orientation:'h',name:'Other / not classified',y,x:rows.map(x=>x.other_pct),marker:{color:'#576b86'},hovertemplate:'%{y}<br>Other: %{x}%<extra></extra>'}],
 {barmode:'stack',margin:{l:matchMedia('(max-width:700px)').matches?96:150,r:10,t:55,b:58},xaxis:{title:'Candidate support (%)',range:[0,100]},yaxis:{automargin:true,autorange:'reversed'},legend:{orientation:'h',y:1.19},height:400});
}
function drawFindingsCharts(){
 const d=FINDINGS.datasets;
 plotVoteSplit('fi-first',d.pew_new_and_returning,x=>x.group==='Young first-time voters'?'Young first-time<br>voters':'Skipped 2020,<br>voted in 2024');
 const turnout=d.youth_turnout;
 chart('fi-turnout',[{type:'scatter',mode:'lines+markers+text',x:turnout.map(x=>String(x.year)),y:turnout.map(x=>x.turnout_pct),text:turnout.map(x=>x.turnout_pct+'%'),textposition:'top center',textfont:{color:'#b5e5df',size:16},line:{color:P.T,width:3},marker:{color:P.T,size:13},hovertemplate:'Year %{x}<br>18–29 turnout %{y}%<extra></extra>'}],{height:255,showlegend:false,margin:{l:58,r:18,t:24,b:44},xaxis:{type:'category',title:'Election year'},yaxis:{title:'Eligible youth turnout (%)',range:[30,56]}});
 drawDemographics('race');
 drawDemographics('age');
 drawYouthGroups();
 const issues=d.youth_issue_priorities_2024.filter(row=>!row.issue.startsWith('Other'));
 chart('fi-issues',[{type:'bar',orientation:'h',x:issues.map(x=>x.pct).reverse(),y:issues.map(x=>x.issue).reverse(),marker:{color:issues.map(x=>x.issue==='Economy and jobs'?P.T:'#7190b2').reverse()},text:issues.map(x=>x.pct+'%').reverse(),textposition:'outside',cliponaxis:false,hovertemplate:'%{y}: %{x}%<extra></extra>'}],{showlegend:false,margin:{l:170,r:40,t:18,b:47},xaxis:{title:'Named as top issue (%)',range:[0,49]},yaxis:{automargin:true}});
 const nat=d.pew_naturalized_voting;
 plotVoteSplit('fi-naturalized',nat,x=>String(x.year));
}
function drawYouthGroups(){
 const rows=FINDINGS.datasets.youth_groups_2024.filter(x=>x.category===FINDING_PREFS.youthBreakdown);
 const headlines = {
  Gender:'Harris led young women by 17 points, Trump led young men by 14',
  'Race / ethnicity':'Harris led among Black, Asian and Latino youth, while Trump led White youth',
  Education:'Trump led among high-school-only youth, while Harris led youth with college experience',
  Community:'Trump led rural youth, while Harris led urban and suburban youth'
 };
 $('#fi-groups-title').textContent = headlines[FINDING_PREFS.youthBreakdown];
 const sorted = rows.slice().sort((a,b)=>a.dem_margin_pp-b.dem_margin_pp);
 chart('fi-groups',[{type:'bar',orientation:'h',y:sorted.map(row=>row.group),x:sorted.map(row=>row.dem_margin_pp),
  marker:{color:sorted.map(row=>row.dem_margin_pp>0?P.D:P.R)},
  hovertemplate:'%{y}<br>Democratic minus Republican: %{x:+.0f} pp<extra></extra>'}],
  {showlegend:false,margin:{l:110,r:25,t:15,b:53},yaxis:{automargin:true},xaxis:{title:'D minus R (pp)',zeroline:true}});

}
function drawImmigration(){
 const rows=FINDINGS.datasets.foreign_born_states_2024.filter(x=>x.state_po!=='PR');
 const metric=FINDING_PREFS.immMetric;
 const by=Object.fromEntries(rows.map(x=>[x.state_po,x]));
 let max=Math.max(...rows.map(x=>x.foreign_born_pct));
 const el=$('#fi-imm-map');
 el.innerHTML=tileSequence.map(st=>{const x=by[st];const share=x?.foreign_born_pct||0;const alpha=.17+.81*Math.pow(share/max,.8);const color=`rgba(53,201,192,${alpha.toFixed(3)})`;const selected=st===FINDING_PREFS.immState?' selected':'';
 return `<button class="tile immigration-tile${selected}" data-state="${st}" style="grid-row:${tileCoords[st][0]};grid-column:${tileCoords[st][1]};background:${color}" title="${esc(x?.state)}: ${fmt(share,1)}% foreign-born" aria-label="${esc(x?.state)}, ${fmt(share,1)}% foreign-born">${esc(st)}</button>`}).join('');
 el.querySelectorAll('[data-state]').forEach(node=>{
   node.onmouseenter=()=>{let x=by[node.dataset.state];$('#fi-imm-hover').textContent=`${x.state}: ${fmt(x.foreign_born_pct,1)}% of residents; ${whole(x.foreign_born_count)} foreign-born residents`};
   node.onclick=()=>{FINDING_PREFS.immState=node.dataset.state;$('#fi-imm-state').value=node.dataset.state;drawImmigration()};
 });
 const sorted=[...rows].sort((a,b)=>b[metric]-a[metric]).slice(0,12).reverse();
 const pct=metric==='foreign_born_pct';
 const top = sorted.at(-1);
 $('#fi-rank-title').textContent = pct
  ? `${top.state} ranked first by foreign-born share (${fmt(top.foreign_born_pct)}%)`
  : `${top.state} ranked first by foreign-born resident count (${fmt(top.foreign_born_count/1e6)} million)`;
 chart('fi-imm-bars',[{type:'bar',orientation:'h',x:sorted.map(x=>pct?x.foreign_born_pct:x.foreign_born_count),y:sorted.map(x=>x.state),marker:{color:sorted.map(x=>x.state_po===FINDING_PREFS.immState?P.Y:P.T)},text:sorted.map(x=>pct?`${fmt(x.foreign_born_pct,1)}%`:`${fmt(x.foreign_born_count/1e6,2)}m`),textposition:'outside',cliponaxis:false,hovertemplate:pct?'%{y}: %{x:.1f}% of residents<extra></extra>':'%{y}: %{x:,.0f} foreign-born residents<extra></extra>'}],{showlegend:false,margin:{l:105,r:64,t:19,b:42},xaxis:{title:pct?'Share of state population (%)':'Foreign-born residents',range:[0,pct?31:12500000]},yaxis:{automargin:true}});
 drawStateDetail();
}
function drawStateDetail(){
 const x=FINDINGS.datasets.foreign_born_states_2024.find(v=>v.state_po===FINDING_PREFS.immState);
 if(!x)return;
 $('#fi-imm-detail').innerHTML=`<div class="imm-state"><div class="imm-state-name">${esc(x.state)} ${esc(x.state_po)}</div><div class="imm-state-big">${fmt(x.foreign_born_pct,1)}% <small>of residents</small></div><div class="imm-stat-line">${whole(x.foreign_born_count)} foreign-born residents, ± ${whole(x.foreign_born_count_moe90)} (90% MOE)</div><div class="imm-stat-line">Share ± ${fmt(x.foreign_born_pct_moe90,1)} percentage points (90% MOE)</div><p>Includes residents born abroad, regardless of citizenship.</p>${findingLink(x.source_url,'See ACS / CRS source')}</div>`;
 $('#fi-imm-map').querySelectorAll('[data-state]').forEach(node=>node.classList.toggle('selected',node.dataset.state===FINDING_PREFS.immState));
}
function drawStateAssociation(){
 const d=FINDING_ASSOC;
 const target=$('#fi-association');
 if(!d||d.status!=='ready'){
   target.innerHTML=`<div class="finding-association-off"><div class="analysis-type">OPTIONAL RESEARCH MODEL</div><h3>Connect this with actual 2024 state results</h3><p>${esc(d?.message||'State results not loaded.')} Import the state returns to show this comparison.</p><div class="code-line">python scripts/ingest.py</div></div>`;
   return;
 }
 target.innerHTML=`<div class="grid2 grid-equal"><div><div id="fi-assoc-plot" class="chart chart-tall"></div></div><div class="finding-copy"><span class="finding-label">AN AGGREGATE RELATIONSHIP</span><h3>Across ${d.n_states} jurisdictions, Pearson r = ${fmt(d.pearson_r,2)}</h3><p>Each dot is a state or DC. It compares foreign-born share with the 2024 presidential margin.</p><div class="finding-caveat"><strong>Scope.</strong> ${esc(d.caveat)}</div></div></div>`;
 chart('fi-assoc-plot',[{type:'scatter',mode:'markers',x:d.rows.map(x=>x.foreign_born_pct),y:d.rows.map(x=>x.dem_margin_pp),text:d.rows.map(x=>x.state),marker:{size:10,color:P.T,opacity:.8,line:{color:'#13283c',width:1}},hovertemplate:'%{text}<br>Foreign-born population: %{x:.1f}%<br>Dem minus Rep margin: %{y:+.1f} pp<extra></extra>'}],{showlegend:false,margin:{l:58,r:20,t:25,b:65},xaxis:{title:'Foreign-born residents (%)'},yaxis:{title:'2024 D minus R margin (pp)',zeroline:true,zerolinecolor:'#b4ccd755'}});
}
