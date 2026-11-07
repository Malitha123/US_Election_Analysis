'use strict';

const stateNames = {
 AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
 CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',
 HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
 LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',
 MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
 NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',
 OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',
 SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
 VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
};

function signedMargin(value) {
 return value > 0 ? `D +${fmt(value)}` : value < 0 ? `R +${fmt(-value)}` : 'Tie';
}

function sourceLinks(...ids) {
 return ids.map(id => STATE.sources.find(source => source.id === id)).filter(Boolean)
  .map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ↗</a>`).join(' · ');
}

function storyFigure(index, question, title, takeaway, id, sources, action) {
 return `<article class="brief-figure">
   <div class="brief-figure-copy">
     <div class="brief-question">${index} / ${esc(question)}</div>
     <h2>${esc(title)}</h2>
     <p>${esc(takeaway)}</p>
     <p class="brief-source">${sourceLinks(...sources)}</p>
     <button class="brief-link" data-brief-page="${action[0]}">${esc(action[1])} <span aria-hidden="true">↗</span></button>
   </div>
   <div class="brief-chart" id="${id}"></div>
 </article>`;
}

function briefMetric(value, label, detail) {
 return `<div class="brief-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><p>${esc(detail)}</p></div>`;
}

function renderOverview() {
 const root = $('#app-content');
 const byYear = Object.fromEntries(STATE.overview.rows.map(row => [row.year,row]));
 const old = byYear[2020];
 const latest = byYear[2024];
 const split = byYear[2016];
 const house = byYear[2012];
 const presMargin = row => row.dem_pres_pct - row.rep_pres_pct;
 const swing = presMargin(old) - presMargin(latest);
 const turnoutChange = old.turnout_vep_pct - latest.turnout_vep_pct;
 const seatLead = house.rep_house - house.dem_house;
 const totalSeats = house.dem_house + house.rep_house + house.house_unfilled;
 const olderTurnout = split.turnout_vep_pct;
 const marginText = `The national vote swung ${fmt(swing)} points toward Republicans. It went from ${signedMargin(presMargin(old))} in 2020 to ${signedMargin(presMargin(latest))} in 2024.`;
 root.innerHTML = `<div class="briefing">
   <section class="brief-masthead" aria-labelledby="brief-title">
     <div class="brief-kicker"><span></span> ANALYST BRIEFING <span class="brief-date">2008–2024</span></div>
     <div class="brief-lead">
       <div><div class="brief-question">THE QUESTION</div>
       <p class="brief-premise">Where did votes shift? When did votes and seats diverge?</p>
       <h1 id="brief-title">The 2024 presidential vote shifted toward Republicans.</h1>
       <p class="brief-deck">${esc(marginText)} Turnout fell from 2020 but stayed above 2016.</p>
       <p class="brief-source">${sourceLinks('ballotory','ballotpedia_turnout')}</p></div>
       <aside class="brief-aside"><span>2024 / US PRESIDENT</span><strong>${esc(signedMargin(presMargin(latest)))}</strong><p>National presidential margin in percentage points.</p><a href="#brief-evidence">See the evidence ↓</a></aside>
     </div>
   </section>
   <div class="brief-metrics">
     ${briefMetric(`${fmt(swing)} pp`,'Presidential margin shift','Toward Republicans, 2020 to 2024')}
     ${briefMetric(`${fmt(latest.turnout_vep_pct)}%`,'2024 national turnout',`${fmt(turnoutChange)} points below 2020`)}
     ${briefMetric(`${whole(seatLead)} seats`,'2012 Republican House lead','Democrats led the national House vote')}
   </div>
   <section id="brief-evidence" aria-labelledby="brief-evidence-title">
     <div class="brief-section-title"><p class="brief-question">THE EVIDENCE</p><h2 id="brief-evidence-title">Three key findings</h2></div>
     ${storyFigure('01','Where did the outcome change?',
       'Six states switched from a Democratic to a Republican lead in 2024.',
       'Arizona, Georgia, Michigan, Nevada, Pennsylvania and Wisconsin changed party leads.',
       'brief-flips',['mit_pres'],['geography','Compare states and counties'])}
     ${storyFigure('02','Did turnout return to earlier levels?',
       'Turnout fell from its 2020 peak but stayed above 2016.',
       `Turnout fell from ${fmt(old.turnout_vep_pct)}% in 2020 to ${fmt(latest.turnout_vep_pct)}% in 2024. That was ${fmt(latest.turnout_vep_pct-olderTurnout)} points above 2016.`,
       'brief-turnout',['ballotpedia_turnout'],['evidence','Compare other election cycles'])}
     ${storyFigure('03','Did the party with more votes get more seats?',
       'Republicans won 33 more House seats in 2012 despite trailing in votes.',
       `Democrats led the nationwide House vote ${fmt(house.dem_house_vote_pct)}% to ${fmt(house.rep_house_vote_pct)}%. Republicans won ${whole(house.rep_house)} of ${whole(totalSeats)} seats. Each district awards one seat.`,
       'brief-house',['ballotpedia'],['congress','Explore the House and Senate'])}
     <aside class="brief-context">
       <div class="brief-question">RELATED FINDING / ELECTORAL COLLEGE</div>
       <h3>Clinton led the 2016 popular vote. Trump won the presidency.</h3>
       <p>Clinton received ${fmt(split.dem_pres_pct)}% of the national vote to Trump’s ${fmt(split.rep_pres_pct)}%. Trump won the Electoral College, 304 to 227.</p>
       <p class="brief-source">${sourceLinks('ballotory','NARA_2016')}</p>
     </aside>
   </section>
   <section class="brief-next" aria-labelledby="brief-next-title">
     <p class="brief-question">WHAT TO INVESTIGATE NEXT</p>
     <h2 id="brief-next-title">Separate who turned out from who switched candidates.</h2>
     <p>Young first-time voters leaned Harris. Voters who skipped 2020 leaned Trump. The groups can overlap. The estimates come from different surveys.</p>
     <button class="button" data-brief-page="findings">Read the voter findings ↗</button>
   </section>
 </div>`;

 root.querySelectorAll('[data-brief-page]').forEach(button => {
  button.onclick = () => {
   if (button.dataset.briefPage === 'congress') STATE.congress.year = 2012;
   if (button.dataset.briefPage === 'geography') Object.assign(STATE.geography,{year_a:2020,year_b:2024,level:'state',state:'ALL'});
   if (button.dataset.briefPage === 'evidence') STATE.evidence = {year_a:2020,year_b:2024};
   switchPage(button.dataset.briefPage);
  };
 });

 const presidential = STATE.overview.rows.filter(row => row.election_type === 'Presidential');
 chart('brief-turnout',[{
  type:'scatter',mode:'lines+markers+text',x:presidential.map(row=>String(row.year)),
  y:presidential.map(row=>row.turnout_vep_pct),text:presidential.map(row=>fmt(row.turnout_vep_pct)+'%'),
  textposition:'top center',line:{color:P.T,width:3},marker:{color:presidential.map(row=>row.year===2020?P.Y:P.T),size:9},
  hovertemplate:'%{x}<br>Eligible-voter turnout: %{y:.1f}%<extra></extra>'
 }],{height:250,showlegend:false,margin:{l:57,r:24,t:25,b:38},xaxis:{type:'category'},yaxis:{title:'Turnout (%)',range:[53,72]}});

 chart('brief-house', [['Democratic',P.D,house.dem_house_vote_pct,house.dem_house],['Republican',P.R,house.rep_house_vote_pct,house.rep_house]]
  .map(([name,color,vote,seats])=>({type:'bar',name,x:['National vote','House seats'],y:[vote,seats/totalSeats*100],
   marker:{color},text:[fmt(vote)+'%',fmt(seats/totalSeats*100)+'%'],textposition:'inside',
   hovertemplate:'%{x}<br>%{y:.1f}%<extra>%{fullData.name}</extra>'})),
  {height:250,barmode:'group',margin:{l:45,r:25,t:46,b:38},legend:{orientation:'h',y:1.17},yaxis:{range:[0,63],title:'Share (%)'}});

 drawBriefFlips(root.querySelector('#brief-flips'));
}

async function drawBriefFlips(target) {
 try {
  const results = await fetchJSON('/api/geography?year_a=2020&year_b=2024&level=state');
  if (!target.isConnected) return;
  const rows = results.rows.filter(row => row.winner_a === 'D' && row.winner_b === 'R')
   .sort((a,b) => a.margin_b-b.margin_b);
  const story = target.closest('.brief-figure');
  if (results.status !== 'ready' || !rows.length) {
   story.querySelector('h2').textContent = 'No states switched from Democratic to Republican';
   story.querySelector('.brief-figure-copy > p').textContent = 'See Geography for coverage and other swings.';
   target.innerHTML = notice('No state flips to chart for this comparison.');
   return;
  }
  const names = rows.map(row=>stateNames[row.state_po]).sort();
  const count = names.length===6 ? 'Six' : whole(names.length);
  const noun = names.length===1 ? 'state' : 'states';
  story.querySelector('h2').textContent = `${count} ${noun} switched from a Democratic to a Republican lead in 2024.`;
  const republicanSwings = results.rows.filter(row=>row.swing_pp<0).length;
  const breadth = republicanSwings===51
   ? 'The margin moved toward Republicans in all 50 states and DC.'
   : `The margin moved toward Republicans in ${whole(republicanSwings)} of ${whole(results.rows.length)} comparable jurisdictions.`;
  const closest = rows.at(-1);
  story.querySelector('.brief-figure-copy > p').textContent =
   `${breadth} ${new Intl.ListFormat('en-US').format(names)} switched leads. ${stateNames[closest.state_po]} was closest. Republicans led there by ${fmt(-closest.margin_b)} points.`;
  const y = rows.map(row=>stateNames[row.state_po]);
  const endpoints = [ ['2020','margin_a',P.D,'circle'],['2024','margin_b',P.R,'diamond'] ];
  chart(target.id, endpoints.map(([name,key,color,symbol]) => ({
   type:'scatter',mode:'markers',name,y,x:rows.map(row=>row[key]),
   marker:{color,symbol,size:10},hovertemplate:'%{y}<br>Democratic minus Republican: %{x:+.1f} pp<extra>%{fullData.name}</extra>'
  })),{
   height:290,margin:{l:105,r:25,t:42,b:50},legend:{orientation:'h',y:1.16},
   xaxis:{title:'Democratic minus Republican (pp)',zeroline:true,zerolinecolor:'#a5b7c9'},
   yaxis:{categoryorder:'array',categoryarray:y,autorange:'reversed'},
   shapes:rows.map(row=>({type:'line',xref:'x',yref:'y',x0:row.margin_a,x1:row.margin_b,
    y0:stateNames[row.state_po],y1:stateNames[row.state_po],line:{color:'#5c7388',width:2},layer:'below'}))
  });
 } catch(error) {
  if (target.isConnected) target.innerHTML = notice(esc(error.message),true);
 }
}
