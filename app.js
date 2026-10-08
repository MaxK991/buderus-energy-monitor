const APP_VERSION="v3.0.4";
const DB_KEY="buderus_energy_v1";
const $=s=>document.querySelector(s);
const months=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
function fmt(v){return new Intl.NumberFormat("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(v)||0)}
let data=load();
let currentYear=new Date().getFullYear();

const versionEl=document.getElementById("appVersion");
if(versionEl) versionEl.textContent=`Version ${APP_VERSION}`;

function load(){try{return JSON.parse(localStorage.getItem(DB_KEY)||"[]")}catch{return[]}}
function save(){localStorage.setItem(DB_KEY,JSON.stringify(data));$("#lastUpdated").textContent="Gespeichert: "+new Date().toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})}
function populateYears(){
  const ys=years(); if(!ys.length) ys=[currentYear];
  if(!ys.includes(currentYear)) currentYear=ys[0];
  $("#yearSelect").innerHTML=ys.map(y=>`<option ${y===currentYear?"selected":""}>${y}</option>`).join("");
}
function drawChart(y){
  const c=$("#consumptionChart"),ctx=c.getContext("2d"),dpr=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;
  c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const arr=monthly(y),max=Math.max(...arr.map(x=>+x.gas||0),1),pad={l:42,r:10,t:12,b:36},cw=(w-pad.l-pad.r)/12;
  ctx.strokeStyle="#3b3b3b";ctx.lineWidth=1;
  for(let k=0;k<=4;k++){let yy=pad.t+(h-pad.t-pad.b)*k/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle="#777";ctx.font="11px sans-serif";ctx.fillText(fmt(max*(1-k/4)),4,yy+4)}
  arr.forEach((x,i)=>{let bh=((+x.gas||0)/max)*(h-pad.t-pad.b);let x0=pad.l+i*cw+cw*.2;let bw=cw*.6;ctx.fillStyle="#d6cfe6";ctx.fillRect(x0,h-pad.b-bh,bw,bh);ctx.fillStyle="#aaa";ctx.font="11px sans-serif";ctx.textAlign="center";ctx.fillText(months[i],x0+bw/2,h-12);});
  ctx.textAlign="start";
}
function renderYear(){
  const arr=monthly(currentYear),max=Math.max(...arr.map(x=>+x.gas||0),1);
  $("#yearTotal").textContent=fmt(total(currentYear))+" kWh";
  $("#yearView").innerHTML=`<div class="panel-head"><div><div class="eyebrow">${currentYear}</div><h2>Monatlicher Verbrauch</h2></div><div class="muted">Gas</div></div>`+
    arr.map(x=>`<div class="month-row"><strong>${months[x.month-1]}</strong><div class="bar-bg"><div class="bar" style="width:${Math.max(0,(x.gas/max)*100)}%"></div></div><div class="value">${fmt(+x.gas||0)} kWh</div></div>`).join("");
  drawChart(currentYear);
}
function renderCompare(){
  const ys=years().filter(y=>y<=currentYear).slice(0,2); if(ys.length<2){$("#compareView").innerHTML=`<h2>Jahresvergleich</h2><p class="muted">Importiere mindestens zwei Jahre, um 2026 mit 2025 vergleichen zu können.</p>`;return}
  const a=total(ys[0]),b=total(ys[1]),diff=b?((a-b)/b*100):0;
  $("#compareView").innerHTML=`<div class="panel-head"><div><div class="eyebrow">VERGLEICH</div><h2>${ys[0]} vs. ${ys[1]}</h2></div></div>
  <div class="compare-grid"><div class="metric"><span>${ys[0]}</span><strong>${fmt(a)} kWh</strong></div><div class="metric"><span>${ys[1]}</span><strong>${fmt(b)} kWh</strong></div><div class="metric"><span>Veränderung</span><strong>${diff>0?"+":""}${diff.toFixed(1).replace(".",",")} %</strong></div></div>
  <div>${months.map((m,i)=>{let va=monthly(ys[0])[i].gas,vb=monthly(ys[1])[i].gas;let p=vb?((va-vb)/vb*100):0;return `<div class="month-row"><strong>${m}</strong><div class="muted">${fmt(va)} / ${fmt(vb)} kWh</div><div class="value">${p>0?"+":""}${p.toFixed(1).replace(".",",")}%</div></div>`}).join("")}</div>`;
}
function num(v){
  if(v==null || v==="" || v==="-" ) return null;
  const s=String(v).trim().replace(/\u00a0/g,"");
  // Buderus exports German decimals (e.g. 4.335,2) but may also contain
  // plain integers/decimal values without a comma (e.g. 14.8).
  if(s.includes(",")) return Number(s.replace(/\./g,"").replace(",","."));
  return Number(s);
}
function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  if(lines.length<4) throw Error("Keine gültigen Buderus-Daten gefunden.");
  const rows=[];
  for(let line of lines.slice(3)){
    const c=line.split(";");
    if(c.length<8) continue;
    const kind=c[0].trim(), ts=c[1].trim();
    if(!["Stunde","Tag","Monat"].includes(kind)) continue;
    if(!/^\d{4}-\d{2}(?:-\d{2})?(?:T\d{2}:\d{2})?$/.test(ts)) continue;
    const id=`${kind}|${ts}`;
    rows.push({
      id, kind, timestamp:ts,
      year:+ts.slice(0,4), month:+ts.slice(5,7),
      day:ts.length>=10?+ts.slice(8,10):null,
      hour:kind==="Stunde"&&ts.length>=13?+ts.slice(11,13):null,
      gas:num(c[2]), heating:num(c[3]), hotWater:num(c[4]),
      outside:num(c[5]), room:num(c[6]), waterTemp:num(c[7])
    });
  }
  if(!rows.length) throw Error("Keine Stunde/Tag/Monat-Zeilen im Buderus-Export gefunden.");
  return rows;
}
function mergeRows(rows){
  const map=new Map(data.map(x=>[x.id,x]));
  rows.forEach(r=>map.set(r.id,r));
  data=[...map.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.kind.localeCompare(b.kind));
}
function monthly(y){
  return months.map((m,i)=>{
    const x=data.find(r=>r.kind==="Monat"&&r.year===y&&r.month===i+1);
    return x?{year:y,month:i+1,gas:x.gas||0,out:x.outside||0,room:x.room||0}:{year:y,month:i+1,gas:0,out:0,room:0}
  });
}
function total(y){return monthly(y).reduce((s,x)=>s+(+x.gas||0),0)}
function years(){return [...new Set(data.filter(x=>x.kind==="Monat").map(x=>x.year))].sort((a,b)=>b-a)}

$("#yearSelect").addEventListener("change",e=>{currentYear=+e.target.value;renderYear();renderCompare()});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");["yearView","compareView","dataView"].forEach(id=>$("#"+id).classList.add("hidden"));$("#"+({year:"yearView",compare:"compareView",data:"dataView"}[b.dataset.view])).classList.remove("hidden");}));
$("#csvInput").addEventListener("change",async e=>{
  const f=e.target.files[0];
  if(!f) return;
  try{
    const rows=parseCSV(await f.text());
    const map=new Map(data.map(x=>[x.id,x]));
    rows.forEach(r=>map.set(r.id,r));
    data=[...map.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.kind.localeCompare(b.kind));
    save();
    populateYears();
    renderYear();
    renderCompare();
    $("#importStatus").textContent=`${rows.length} Buderus-Datensätze importiert.`;
  }catch(err){
    $("#importStatus").textContent=`Importfehler: ${err.message}`;
  }
});
$("#clearBtn").addEventListener("click",()=>{
  if(confirm("Alle lokal gespeicherten Heizungsdaten löschen?")){
    data=[];
    save();
    populateYears();
    renderYear();
    renderCompare();
  }
});
window.addEventListener("resize",()=>drawChart(currentYear));
// load() is synchronous (localStorage). Do not call .then() on it.
populateYears();
renderYear();
renderCompare();
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js");
