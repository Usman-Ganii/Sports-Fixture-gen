// ARENA Sports Fixture Generator — local browser application
const $ = id => document.getElementById(id);
const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const demo = {
 teams:[
  {team:"CSE",department:"Computer Science",sports:["Cricket","Football","Volleyball"]},
  {team:"ECE",department:"Electronics",sports:["Cricket","Football","Volleyball"]},
  {team:"EEE",department:"Electrical",sports:["Cricket","Football"]},
  {team:"MECH",department:"Mechanical",sports:["Cricket","Volleyball"]},
  {team:"CIVIL",department:"Civil",sports:["Football","Volleyball"]},
  {team:"IT",department:"Information Technology",sports:["Cricket","Football"]}
 ],
 sports:[
  {sport:"Cricket",format:"league",duration:60,rest:30},
  {sport:"Football",format:"knockout",duration:45,rest:20},
  {sport:"Volleyball",format:"league",duration:30,rest:15}
 ],
 venues:[
  {venue:"Main Ground",sports:["Cricket","Football"],days:["Monday","Tuesday","Wednesday","Thursday","Friday"],start:"09:00",end:"17:00"},
  {venue:"Sports Field",sports:["Football","Volleyball"],days:["Monday","Tuesday","Wednesday","Thursday","Friday"],start:"09:00",end:"16:00"},
  {venue:"Indoor Court",sports:["Volleyball"],days:["Monday","Tuesday","Wednesday","Thursday","Friday"],start:"10:00",end:"16:00"}
 ]
};
let data=structuredClone(demo), fixtures=[], config=null, activeView="day";
let pendingFiles={teams:null,sports:null,venues:null};
const escapeHTML=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mins=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};
const timeText=t=>{const [h,m]=t.split(":").map(Number);return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`};
const dateString=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseDate=(s)=>new Date(`${s}T12:00:00`);
const split=v=>String(v||"").split(/[;|]/).map(x=>x.trim()).filter(Boolean);
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),3200)}
function parseCSV(text){
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
  if(c==='"'&&quoted&&n==='"'){cell+='"';i++}
  else if(c==='"')quoted=!quoted;
  else if(c===","&&!quoted){row.push(cell.trim());cell=""}
  else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&n==="\n")i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=""}
  else cell+=c;
 }
 row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(quoted)throw Error("CSV contains an unclosed quote.");
 if(!rows.length)throw Error("The CSV file is empty.");
 const headers=rows.shift().map(x=>x.replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[\s-]+/g,"_"));
 return rows.map((r,i)=>{const obj={};headers.forEach((h,j)=>obj[h]=r[j]??"");return obj});
}
function normalizeTeams(rows){
 const out=rows.map(r=>({team:r.team||r.team_name||r.name,department:r.department||r.team||r.team_name||r.name,sports:split(r.sports||r.sport)}));
 if(out.some(x=>!x.team||!x.sports.length))throw Error("Teams CSV needs team and sports values on every row.");
 unique(out.map(x=>x.team),"team names");return out;
}
function normalizeSports(rows){
 const out=rows.map(r=>({sport:r.sport||r.name,format:String(r.format||r.match_format||"league").toLowerCase(),duration:Number(r.duration||r.match_duration||0),rest:Number(r.rest||r.rest_time||r.rest_minutes||0)}));
 if(out.some(x=>!x.sport||!["league","knockout"].includes(x.format)||!Number.isFinite(x.duration)||x.duration<=0||!Number.isFinite(x.rest)||x.rest<0))throw Error("Sports CSV needs sport, format (league/knockout), positive duration and non-negative rest minutes.");
 unique(out.map(x=>x.sport),"sport names");return out;
}
function normalizeVenues(rows){
 const out=rows.map(r=>({venue:r.venue||r.name,sports:split(r.sports||r.supported_sports),days:split(r.available_days||r.days).map(x=>x[0].toUpperCase()+x.slice(1).toLowerCase()),start:r.start_time||r.start||"09:00",end:r.end_time||r.end||"17:00"}));
 if(out.some(x=>!x.venue||!x.sports.length||!x.days.length||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.end)||mins(x.start)>=mins(x.end)))throw Error("Venues CSV needs venue, supported sports, available days and valid 24-hour start/end times.");
 unique(out.map(x=>x.venue),"venue names");return out;
}
function unique(arr,label){if(new Set(arr.map(x=>x.toLowerCase())).size!==arr.length)throw Error(`Duplicate ${label} found.`)}
function validateCrossData(d){
 const sports=new Set(d.sports.map(s=>s.sport.toLowerCase()));
 const venues=new Set(d.venues.flatMap(v=>v.sports.map(s=>s.toLowerCase())));
 const unknown=d.teams.flatMap(t=>t.sports.filter(s=>!sports.has(s.toLowerCase())));
 if(unknown.length)throw Error(`Teams reference sports missing from Sports.csv: ${[...new Set(unknown)].join(", ")}`);
 const unsupported=[...sports].filter(s=>!venues.has(s));
 if(unsupported.length)throw Error(`No venue supports: ${unsupported.join(", ")}`);
}
async function readFile(input,key,normalizer){
 const file=$(input).files[0];if(!file)return;
 try{const rows=parseCSV(await file.text());const value=normalizer(rows);pendingFiles[key]=value;
  $(key+"Status").textContent=`✓ ${file.name} · ${value.length} rows`;$(key+"Status").style.color="#62d9ae";
  $("applyImport").disabled=!(pendingFiles.teams&&pendingFiles.sports&&pendingFiles.venues);
  $("importMessage").innerHTML='<span class="message-dot"></span>Files parsed. Apply all three files to replace the active dataset.';
 }catch(e){pendingFiles[key]=null;$(key+"Status").textContent="⚠ "+e.message;$(key+"Status").style.color="#ff8994";$("applyImport").disabled=true;toast(e.message)}
}
$("teamsFile").addEventListener("change",()=>readFile("teamsFile","teams",normalizeTeams));
$("sportsFile").addEventListener("change",()=>readFile("sportsFile","sports",normalizeSports));
$("venuesFile").addEventListener("change",()=>readFile("venuesFile","venues",normalizeVenues));
$("applyImport").addEventListener("click",()=>{
 try{const next={teams:pendingFiles.teams,sports:pendingFiles.sports,venues:pendingFiles.venues};validateCrossData(next);data=next;fixtures=[];config=null;save();render();toast("All three CSV files imported successfully.");$("importMessage").innerHTML='<span class="message-dot"></span>Your uploaded dataset is active. Generate fixtures to schedule it.'}
 catch(e){toast("Import validation: "+e.message)}
});
function download(name,content){const blob=new Blob([content],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$("downloadTemplates").addEventListener("click",()=>{
 download("Teams-template.csv","team,department,sports\nCSE,Computer Science,Cricket;Football\nECE,Electronics,Cricket;Volleyball\n");
 download("Sports-template.csv","sport,format,duration,rest\nCricket,league,60,30\nFootball,knockout,45,20\n");
 download("Venues-template.csv","venue,sports,available_days,start_time,end_time\nMain Ground,Cricket;Football,Monday;Tuesday;Wednesday,09:00,17:00\nIndoor Court,Volleyball,Monday;Tuesday;Wednesday,10:00,16:00\n");
 toast("Three CSV template files downloaded.");
});
function buildFixtures(){
 const result=[];
 for(const sp of data.sports){
  const participants=data.teams.filter(t=>t.sports.some(s=>s.toLowerCase()===sp.sport.toLowerCase()));
  if(participants.length<2)continue;
  if(sp.format==="league"){
   const ring=[...participants];if(ring.length%2)ring.push(null);
   const half=ring.length/2,rounds=ring.length-1,rot=[...ring];let n=0;
   for(let r=0;r<rounds;r++){for(let i=0;i<half;i++){const a=rot[i],b=rot[rot.length-1-i];if(a&&b)result.push(makeMatch(sp,a.team,b.team,++n,r+1))}
    rot.splice(1,0,rot.pop());
   }
  }else{
   // First knockout round is scheduled now; subsequent rounds require match results.
   for(let i=0,n=0;i<participants.length;i+=2){if(i+1<participants.length)result.push(makeMatch(sp,participants[i].team,participants[i+1].team,++n,1));}
  }
 }
 return result.sort((a,b)=>compatibleVenueCount(a.sport)-compatibleVenueCount(b.sport)||b.duration-a.duration||a.sport.localeCompare(b.sport));
}
function makeMatch(sp,a,b,n,round){return{id:`${sp.sport.toLowerCase().replace(/[^a-z0-9]/g,"")}-${n}`,sport:sp.sport,format:sp.format,teamA:a,teamB:b,round,duration:sp.duration,rest:sp.rest,status:"pending"}}
function compatibleVenueCount(sport){return data.venues.filter(v=>v.sports.some(s=>s.toLowerCase()===sport.toLowerCase())).length}
function allTeamIntervals(team){
 return fixtures.filter(f=>f.status==="scheduled"&&(f.teamA===team||f.teamB===team)).map(f=>({start:new Date(`${f.date}T${f.start}:00`).getTime(),end:new Date(`${f.date}T${f.start}:00`).getTime()+f.duration*60000,rest:f.rest||0}));
}
function teamConflict(team,date,start,duration,rest){
 const s=new Date(`${date}T${start}:00`).getTime(),e=s+duration*60000;
 return allTeamIntervals(team).some(x=>{
  const gap=Math.max(rest,x.rest)*60000;
  return s < x.end+gap && e+gap > x.start;
 });
}
function venueConflict(venue,date,start,duration){
 const s=mins(start),e=s+duration;
 return fixtures.some(f=>f.status==="scheduled"&&f.venue===venue&&f.date===date&&s<mins(f.start)+f.duration&&e>mins(f.start));
}
function teamLoadPenalty(team,start){
 const played=fixtures.filter(f=>f.status==="scheduled"&&(f.teamA===team||f.teamB===team));
 const early=played.filter(f=>mins(f.start)<600).length,late=played.filter(f=>mins(f.start)+f.duration>960).length;
 return played.length*.12+early*1.2+late*1.2+(mins(start)<600?1.2:0)+(mins(start)+0>960?1.2:0);
}
function findSlots(match,cfg){
 const slots=[];
 for(let offset=0;offset<cfg.days;offset++){
  const d=parseDate(cfg.startDate);d.setDate(d.getDate()+offset);const date=dateString(d),day=dayNames[d.getDay()];
  for(const v of data.venues){
   if(!v.sports.some(s=>s.toLowerCase()===match.sport.toLowerCase())||!v.days.includes(day))continue;
   const open=mins(v.start),close=mins(v.end);
   for(let start=open;start+match.duration<=close;start+=cfg.slot){
    const t=`${String(Math.floor(start/60)).padStart(2,"0")}:${String(start%60).padStart(2,"0")}`;
    if(venueConflict(v.venue,date,t,match.duration))continue;
    if(teamConflict(match.teamA,date,t,match.duration,match.rest))continue;
    if(teamConflict(match.teamB,date,t,match.duration,match.rest))continue;
    const score=teamLoadPenalty(match.teamA,t)+teamLoadPenalty(match.teamB,t)+(start-open)/1200;
    slots.push({date,day,start:t,venue:v.venue,score});
   }
  }
 }
 return slots.sort((a,b)=>a.score-b.score||a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.venue.localeCompare(b.venue));
}
function place(match,cfg){
 const candidate=findSlots(match,cfg)[0];
 if(!candidate){match.status="unscheduled";match.reason="No valid slot found. Check venue support, venue days/hours, team conflicts, rest time, or extend the tournament dates.";return false}
 Object.assign(match,candidate,{status:"scheduled",reason:""});return true;
}
function generate(){
 const start=$("startDateInput")?.value||"2026-12-01";
 const days=Number($("daysInput")?.value||3),slot=Number($("slotInput")?.value||30);
 if(!Number.isInteger(days)||days<1||days>31){toast("Tournament days must be between 1 and 31.");return}
 try{validateCrossData(data)}catch(e){toast(e.message);return}
 config={startDate:start,days,slot};fixtures=[];
 const matches=buildFixtures();matches.forEach(m=>{fixtures.push(m);place(m,config)});
 save();render();toast(`Schedule generated: ${fixtures.filter(f=>f.status==="scheduled").length} of ${fixtures.length} fixtures placed.`);
}
function regenerate(id){
 const f=fixtures.find(x=>x.id===id);if(!f||!config)return;
 const old={...f};f.status="pending";delete f.date;delete f.start;delete f.venue;
 const ok=place(f,config);if(!ok)Object.assign(f,old);
 save();render();toast(ok?`${id} regenerated. All other fixtures were kept unchanged.`:`No alternative slot found. Original fixture restored.`);
}
function setPage(page){
 document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
 document.querySelectorAll(".nav-link[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
 $("crumb").textContent=({overview:"Overview",fixtures:"Fixtures",teams:"Teams",venues:"Venues",data:"Data & CSV"})[page]||"Overview";
 $("sidebar").classList.remove("open");if(page==="fixtures")renderFixtures();
}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.goto)));
$("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("quickGenerate").addEventListener("click",()=>{setPage("fixtures");generate()});
$("generatePage").addEventListener("click",generate);
$("resetDemo").addEventListener("click",()=>{data=structuredClone(demo);fixtures=[];config=null;pendingFiles={teams:null,sports:null,venues:null};["teams","sports","venues"].forEach(k=>{$(k+"File").value="";$(k+"Status").textContent="Choose CSV file"});$("applyImport").disabled=true;save();render();setPage("overview");toast("Demo data restored.")});
function render(){
 $("statTeams").textContent=data.teams.length;$("statSports").textContent=data.sports.length;$("statVenues").textContent=data.venues.length;
 const scheduled=fixtures.filter(f=>f.status==="scheduled"),unscheduled=fixtures.filter(f=>f.status==="unscheduled");
 $("statScheduled").textContent=scheduled.length;$("statPending").textContent=unscheduled.length+" unscheduled";$("navFixtureCount").textContent=fixtures.length;
 $("healthScheduled").textContent=scheduled.length;$("healthUnscheduled").textContent=unscheduled.length;$("healthViolations").textContent=0;
 const percent=fixtures.length?Math.round(scheduled.length/fixtures.length*100):0;$("healthPercent").textContent=fixtures.length?percent+"%":"—";
 $("scoreRing").style.background=`conic-gradient(#42c99a ${percent*3.6}deg,#293650 0deg)`;
 $("healthTitle").textContent=!fixtures.length?"Not generated":unscheduled.length?"Needs attention":"All placed";
 $("healthSubtitle").textContent=!fixtures.length?"Generate a schedule to run checks.":unscheduled.length?"Review unscheduled fixtures below.":"All placed matches passed the hard constraints.";
 renderOverview();renderTeams();renderVenues();populateSportFilter();renderFixtures();renderDiagnostics();
}
function renderOverview(){
 const root=$("overviewFixtures"),up=fixtures.filter(f=>f.status==="scheduled").sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).slice(0,5);
 root.innerHTML=up.length?up.map(f=>`<div class="mini-row"><div class="mini-date">${escapeHTML(f.date)}<br>${timeText(f.start)}</div><div class="mini-match"><b>${escapeHTML(f.teamA)} <span style="color:#7185b2">vs</span> ${escapeHTML(f.teamB)}</b><small>${escapeHTML(f.sport)} · Round ${f.round}</small></div><div class="mini-venue">${escapeHTML(f.venue)}</div></div>`).join(""):'<div class="empty-state">No schedule yet. Generate fixtures to see upcoming matches.</div>';
}
function renderTeams(){
 $("teamCaption").textContent=`${data.teams.length} teams · ${data.teams.reduce((n,t)=>n+t.sports.length,0)} sport entries`;
 $("teamsTable").innerHTML=data.teams.map(t=>`<tr><td><span class="team-code">${escapeHTML(t.team.slice(0,3).toUpperCase())}</span><b>${escapeHTML(t.team)}</b></td><td>${escapeHTML(t.department)}</td><td><div class="tag-list">${t.sports.map(s=>`<span class="tag">${escapeHTML(s)}</span>`).join("")}</div></td></tr>`).join("");
}
function renderVenues(){
 $("venueGrid").innerHTML=data.venues.map(v=>`<article class="venue-card"><h3>⌖ &nbsp;${escapeHTML(v.venue)}</h3><p>Available facility</p><small style="color:#8292af;font-size:9px;letter-spacing:1px">SUPPORTED SPORTS</small><div class="tag-list">${v.sports.map(s=>`<span class="tag">${escapeHTML(s)}</span>`).join("")}</div><div class="venue-meta"><span>◷ ${escapeHTML(v.start)} – ${escapeHTML(v.end)}</span><span>▦ ${escapeHTML(v.days.join(", "))}</span></div></article>`).join("");
}
function populateSportFilter(){
 const sel=$("sportFilter"),val=sel.value;sel.innerHTML='<option value="all">All sports</option>'+data.sports.map(s=>`<option value="${escapeHTML(s.sport)}">${escapeHTML(s.sport)}</option>`).join("");sel.value=[...sel.options].some(o=>o.value===val)?val:"all";
}
$("sportFilter").addEventListener("change",renderFixtures);$("statusFilter").addEventListener("change",renderFixtures);
$("viewTabs").addEventListener("click",e=>{const b=e.target.closest("button[data-view]");if(!b)return;activeView=b.dataset.view;document.querySelectorAll("#viewTabs button").forEach(x=>x.classList.toggle("selected",x===b));renderFixtures()});
function card(f){
 return `<article class="fixture-row"><div class="fixture-time">${f.date?escapeHTML(f.date)+"<br>"+timeText(f.start):"Not scheduled"}</div><div class="fixture-teams"><b>${escapeHTML(f.teamA)} <span style="color:#7586ac">vs</span> ${escapeHTML(f.teamB)}</b><small>${escapeHTML(f.sport)} · Round ${f.round} · ${f.duration} min</small></div><div class="fixture-meta">${escapeHTML(f.venue||"No venue")}<small>${f.status==="scheduled"?"Venue assigned":"Awaiting valid slot"}</small></div><div class="fixture-controls"><span class="status ${f.status}">${f.status}</span>${f.status==="scheduled"?`<button class="tiny-btn" data-regenerate="${escapeHTML(f.id)}">↻ Re-slot</button>`:""}</div></article>`;
}
function renderFixtures(){
 const sport=$("sportFilter").value,status=$("statusFilter").value;
 let list=fixtures.filter(f=>(sport==="all"||f.sport===sport)&&(status==="all"||f.status===status));
 $("fixtureSummary").textContent=`Showing ${list.length} of ${fixtures.length} matches · ${list.filter(f=>f.status==="scheduled").length} scheduled`;
 const root=$("fixtureContent");if(!list.length){root.innerHTML='<div class="empty-state">No matches to show. Adjust filters or generate fixtures.</div>';return}
 let groups={};
 if(activeView==="day")list.forEach(f=>(groups[f.date||"Unscheduled"]??=[]).push(f));
 else if(activeView==="venue")list.forEach(f=>(groups[f.venue||"Unassigned venue"]??=[]).push(f));
 else if(activeView==="team")list.forEach(f=>[f.teamA,f.teamB].forEach(t=>(groups[t]??=[]).push(f)));
 else groups["All matches"]=list;
 root.innerHTML=Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,items])=>`<section class="fixture-group"><h3 class="group-heading">${escapeHTML(name)} <small>${items.length} match${items.length===1?"":"es"}</small></h3><div class="fixture-list">${items.sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.start||"").localeCompare(b.start||"")).map(card).join("")}</div></section>`).join("");
 root.querySelectorAll("[data-regenerate]").forEach(b=>b.addEventListener("click",()=>regenerate(b.dataset.regenerate)));
}
function renderDiagnostics(){
 const bad=fixtures.filter(f=>f.status==="unscheduled"),root=$("diagnostics");
 root.innerHTML=!fixtures.length?'<div class="empty-state">Generate a schedule to see diagnostics.</div>':!bad.length?'<div class="import-message"><span class="message-dot"></span>No unscheduled matches. Every generated fixture has a valid slot.</div>':bad.map(f=>`<div class="diagnostic"><b>${escapeHTML(f.sport)} · ${escapeHTML(f.teamA)} vs ${escapeHTML(f.teamB)}</b><p>${escapeHTML(f.reason)}</p></div>`).join("");
}
$("exportFixtures").addEventListener("click",()=>{
 if(!fixtures.length){toast("Generate fixtures before exporting.");return}
 const cols=["id","sport","format","teamA","teamB","round","date","day","start","duration","rest","venue","status","reason"];
 const rows=[cols.join(","),...fixtures.map(f=>cols.map(k=>'"'+String(k==="day"&&f.date?dayNames[parseDate(f.date).getDay()]:f[k]??"").replace(/"/g,'""')+'"').join(","))];
 download("arena-fixtures.csv",rows.join("\n"));toast("Fixture CSV exported.");
});
function save(){try{localStorage.setItem("arenaFixtureApp",JSON.stringify({data,fixtures,config}))}catch(e){toast("Browser storage is full; export your schedule to keep a copy.")}}
function restore(){try{const s=JSON.parse(localStorage.getItem("arenaFixtureApp"));if(s?.data&&s?.data.teams&&s?.data.sports&&s?.data.venues){data=s.data;fixtures=s.fixtures||[];config=s.config||null}}catch(e){console.warn("Could not restore local state",e)}}
restore();render();
