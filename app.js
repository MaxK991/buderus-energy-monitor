const APP_VERSION="v3.3.0";
const DB_KEY="buderus_energy_v2";
const $=s=>document.querySelector(s);
const months=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function fmt(v){return new Intl.NumberFormat("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(v)||0)}
function num(v){
  if(v==null || v==="" || v==="-" ) return null;
  const s=String(v).trim().replace(/\u00a0/g,"");
  if(s.includes(",")) return Number(s.replace(/\./g,"").replace(",","."));
  return Number(s);
}
function load(){
  try{return JSON.parse(localStorage.getItem(DB_KEY)||"[]")}
  catch{return[]}
}
let data=load();
let currentYear=new Date().getFullYear();
let importedFiles=Number(localStorage.getItem(DB_KEY+"_files")||0);

const versionEl=$("#appVersion");
if(versionEl) versionEl.textContent=`Version ${APP_VERSION}`;

function save(){
  localStorage.setItem(DB_KEY,JSON.stringify(data));
  localStorage.setItem(DB_KEY+"_files",String(importedFiles));
  const el=$("#lastUpdated");
  if(el) el.textContent="Gespeichert: "+new Date().toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"});
  const fi=$("#importFiles");
  if(fi) fi.textContent=`${importedFiles} Datei${importedFiles===1?"":"en"} zusammengeführt · ${data.length.toLocaleString("de-DE")} Datensätze`;
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
      id,kind,timestamp:ts,
      year:+ts.slice(0,4),month:+ts.slice(5,7),
      day:ts.length>=10?+ts.slice(8,10):null,
      hour:kind==="Stunde"&&ts.length>=13?+ts.slice(11,13):null,
      gas:num(c[2]),heating:num(c[3]),hotWater:num(c[4]),
      outside:num(c[5]),room:num(c[6]),waterTemp:num(c[7])
    });
  }
  if(!rows.length) throw Error("Keine Stunde/Tag/Monat-Zeilen im Buderus-Export gefunden.");
  return rows;
}

function mergeRows(rows){
  const map=new Map(data.map(x=>[x.id,x]));
  rows.forEach(r=>{
    const old=map.get(r.id);
    // Prefer a record with more populated values if the same timestamp exists in both files.
    if(!old || Object.values(r).filter(v=>v!==null&&v!==undefined).length >= Object.values(old).filter(v=>v!==null&&v!==undefined).length){
      map.set(r.id,r);
    }
  });
  data=[...map.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.kind.localeCompare(b.kind));
}

function monthly(y){
  return months.map((m,i)=>{
    const monthRows=data.filter(r=>r.year===y&&r.month===i+1);
    const mon=monthRows.find(r=>r.kind==="Monat");
    const days=monthRows.filter(r=>r.kind==="Tag");
    const gas=mon?.gas ?? (days.length ? days.reduce((s,r)=>s+(r.gas||0),0) : 0);
    const heating=mon?.heating ?? (days.length ? days.reduce((s,r)=>s+(r.heating||0),0) : 0);
    const hotWater=mon?.hotWater ?? (days.length ? days.reduce((s,r)=>s+(r.hotWater||0),0) : 0);
    const out=mon?.outside ?? average(days.map(r=>r.outside));
    const room=mon?.room ?? average(days.map(r=>r.room));
    const waterTemp=mon?.waterTemp ?? average(days.map(r=>r.waterTemp));
    return {year:y,month:i+1,gas:gas||0,heating:heating||0,hotWater:hotWater||0,out:out,room:room,waterTemp:waterTemp};
  });
}
function average(a){const v=a.filter(x=>x!=null&&Number.isFinite(+x)).map(Number);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null}
function total(y){return monthly(y).reduce((s,x)=>s+(+x.gas||0),0)}
function years(){return [...new Set(data.map(x=>x.year))].sort((a,b)=>b-a)}

function renderChart(y){
  const host=$("#consumptionChart");
  if(!host)return;
  const arr=monthly(y);
  const W=760,H=350,pad={l:52,r:52,t:18,b:48};
  const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
  const max=Math.max(...arr.map(x=>+x.gas||0),1);
  const temps=arr.map(x=>x.out).filter(x=>x!=null&&Number.isFinite(+x));
  const tmin=temps.length?Math.floor(Math.min(...temps)-2):0;
  const tmax=temps.length?Math.ceil(Math.max(...temps)+2):20;
  const ty=v=>pad.t+ch-((v-tmin)/Math.max(1,tmax-tmin))*ch;
  const gy=v=>pad.t+ch-(v/max)*ch;
  const n=12,gap=9,bw=(cw-gap*(n-1))/n;
  const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  let s=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Monatlicher Gasverbrauch und Außentemperatur">`;
  for(let i=0;i<=4;i++){
    const v=max*(1-i/4), yy=gy(v);
    s+=`<line class="chart-grid" x1="${pad.l}" x2="${W-pad.r}" y1="${yy}" y2="${yy}"/>`;
    s+=`<text class="chart-axis" x="${pad.l-7}" y="${yy+4}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  if(temps.length){
    for(let i=0;i<=2;i++){
      const v=tmin+(tmax-tmin)*i/2, yy=ty(v);
      s+=`<text class="chart-temp-axis" x="${W-pad.r+7}" y="${yy+4}" text-anchor="start">${esc(Math.round(v))}°</text>`;
    }
  }
  const points=[];
  arr.forEach((x,i)=>{
    const x0=pad.l+i*(bw+gap);
    const bh=((+x.gas||0)/max)*ch;
    s+=`<rect class="chart-bar" data-index="${i}" x="${x0}" y="${pad.t+ch-bh}" width="${bw}" height="${Math.max(0,bh)}" rx="4" tabindex="0" role="button" aria-label="${months[i]} ${y}: ${fmt(+x.gas||0)} kWh${x.out!=null?`, Außentemperatur ${fmt(x.out)} °C`:""}"/>`;
    s+=`<text class="chart-label" x="${x0+bw/2}" y="${H-14}" text-anchor="middle">${months[i]}</text>`;
    if(x.out!=null&&Number.isFinite(+x.out)) points.push(`${x0+bw/2},${ty(+x.out)}`);
  });
  if(points.length){
    s+=`<polyline class="chart-temp" points="${points.join(" ")}"/>`;
    arr.forEach((x,i)=>{
      if(x.out!=null&&Number.isFinite(+x.out)){
        const x0=pad.l+i*(bw+gap);
        s+=`<circle class="chart-temp-dot" data-index="${i}" cx="${x0+bw/2}" cy="${ty(+x.out)}" r="4" tabindex="0" role="button" aria-label="${months[i]} ${y}: Außentemperatur ${fmt(x.out)} °C"/>`;
      }
    });
  }
  s+="</svg><div class=\"chart-tooltip\" id=\"chartTooltip\" aria-live=\"polite\"></div>";
  host.innerHTML=s;

  const tooltip=$("#chartTooltip");
  const show=i=>{
    const x=arr[i]; if(!x)return;
    host.querySelectorAll(".selected").forEach(el=>el.classList.remove("selected"));
    host.querySelectorAll(`[data-index="${i}"]`).forEach(el=>el.classList.add("selected"));
    tooltip.innerHTML=`<strong>${months[i]} ${y}</strong><span>Gas: <b>${fmt(+x.gas||0)} kWh</b></span>${x.out!=null?`<span class="temp">Außentemperatur: <b>${fmt(x.out)} °C</b></span>`:"<span>Außentemperatur: keine Daten</span>"}`;
    tooltip.style.display="block";
    clearTimeout(window.__buderusTooltipTimer);
    window.__buderusTooltipTimer=setTimeout(()=>{tooltip.style.display="none";host.querySelectorAll(".selected").forEach(el=>el.classList.remove("selected"));},5000);
  };
  host.querySelectorAll("[data-index]").forEach(el=>{
    el.addEventListener("click",()=>show(+el.dataset.index));
    el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();show(+el.dataset.index)}});
  });
}

function renderYear(){
  const arr=monthly(currentYear),max=Math.max(...arr.map(x=>+x.gas||0),1);
  $("#yearTotal").textContent=fmt(total(currentYear))+" kWh";
  $("#yearView").innerHTML=`<div class="panel-head"><div><div class="eyebrow">${currentYear}</div><h2>Monatlicher Verbrauch</h2></div><div class="muted">Gas</div></div>`+
    arr.map(x=>`<div class="month-row"><strong>${months[x.month-1]}</strong><div class="bar-bg"><div class="bar" style="width:${Math.max(0,(x.gas/max)*100)}%"></div></div><div class="value">${fmt(+x.gas||0)} kWh</div></div>`).join("");
  renderChart(currentYear);
}

function renderCompare(){
  const ys=years().filter(y=>y<=currentYear).slice(0,2);
  if(ys.length<2){$("#compareView").innerHTML=`<h2>Jahresvergleich</h2><p class="muted">Importiere mindestens zwei Jahre, um die Jahre vergleichen zu können.</p>`;return}
  const a=total(ys[0]),b=total(ys[1]),diff=b?((a-b)/b*100):0;
  $("#compareView").innerHTML=`<div class="panel-head"><div><div class="eyebrow">VERGLEICH</div><h2>${ys[0]} vs. ${ys[1]}</h2></div></div>
  <div class="compare-grid"><div class="metric"><span>${ys[0]}</span><strong>${fmt(a)} kWh</strong></div><div class="metric"><span>${ys[1]}</span><strong>${fmt(b)} kWh</strong></div><div class="metric"><span>Veränderung</span><strong>${diff>0?"+":""}${diff.toFixed(1).replace(".",",")} %</strong></div></div>
  ${months.map((m,i)=>{let va=monthly(ys[0])[i].gas,vb=monthly(ys[1])[i].gas;let p=vb?((va-vb)/vb*100):0;return `<div class="month-row"><strong>${m}</strong><div class="muted">${fmt(va)} / ${fmt(vb)} kWh</div><div class="value">${p>0?"+":""}${p.toFixed(1).replace(".",",")}%</div></div>`}).join("")}`;
}

$("#yearSelect").addEventListener("change",e=>{currentYear=+e.target.value;renderYear();renderCompare()});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  ["yearView","compareView","dataView"].forEach(id=>$("#"+id).classList.add("hidden"));
  $("#"+({year:"yearView",compare:"compareView",data:"dataView"}[b.dataset.view])).classList.remove("hidden");
}));

$("#csvInput").addEventListener("change",async e=>{
  const files=[...e.target.files];
  if(!files.length)return;
  let imported=0, totalRows=0, errors=[];
  for(const f of files){
    try{
      const rows=parseCSV(await f.text());
      mergeRows(rows);
      imported++;
      totalRows+=rows.length;
    }catch(err){errors.push(`${f.name}: ${err.message}`)}
  }
  if(imported){
    importedFiles+=imported;
    save();
    populateYears();
    renderYear();
    renderCompare();
    $("#importStatus").textContent=`${totalRows.toLocaleString("de-DE")} Datensätze aus ${imported} Datei${imported===1?"":"en"} zusammengeführt.`;
  }
  if(errors.length) $("#importStatus").textContent += ` ${errors.join(" · ")}`;
  e.target.value="";
});

$("#clearBtn").addEventListener("click",()=>{
  if(confirm("Alle lokal gespeicherten Heizungsdaten löschen?")){
    data=[]; importedFiles=0; save(); populateYears(); renderYear(); renderCompare();
    $("#importStatus").textContent="";
  }
});

function populateYears(){
  const ys=years(); if(!ys.length) ys=[currentYear];
  if(!ys.includes(currentYear)) currentYear=ys[0];
  $("#yearSelect").innerHTML=ys.map(y=>`<option ${y===currentYear?"selected":""}>${y}</option>`).join("");
}

populateYears();
renderYear();
renderCompare();
if(importedFiles) save();
if("serviceWorker"in navigator) navigator.serviceWorker.register("sw.js?v=3.3.0");
