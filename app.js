const APP_VERSION="v3.4.0";
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
  const host=$("#consumptionChart"), selection=$("#chartSelection");
  if(!host)return;
  const arr=monthly(y);
  const W=760,H=320,pad={l:52,r:52,t:14,b:42};
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
      s+=`<text class="chart-temp-axis" x="${W-pad.r+7}" y="${yy+4}" text-anchor="start">${Math.round(v)}°</text>`;
    }
  }
  const points=[];
  arr.forEach((x,i)=>{
    const x0=pad.l+i*(bw+gap), bh=((+x.gas||0)/max)*ch;
    s+=`<rect class="chart-bar" data-index="${i}" x="${x0}" y="${pad.t+ch-bh}" width="${bw}" height="${Math.max(0,bh)}" rx="4" tabindex="0" role="button" aria-label="${months[i]} ${y}: ${fmt(+x.gas||0)} kWh${x.out!=null?`, Außentemperatur ${fmt(x.out)} °C`:""}"/>`;
    s+=`<text class="chart-label" x="${x0+bw/2}" y="${H-12}" text-anchor="middle">${months[i]}</text>`;
    if(x.out!=null&&Number.isFinite(+x.out))points.push(`${x0+bw/2},${ty(+x.out)}`);
  });
  if(points.length){
    s+=`<polyline class="chart-temp" points="${points.join(" ")}"/>`;
    arr.forEach((x,i)=>{
      if(x.out!=null&&Number.isFinite(+x.out)){
        const x0=pad.l+i*(bw+gap);
        s+=`<circle class="chart-temp-dot" data-index="${i}" cx="${x0+bw/2}" cy="${ty(+x.out)}" r="4.5" tabindex="0" role="button" aria-label="${months[i]} ${y}: Außentemperatur ${fmt(x.out)} °C"/>`;
      }
    });
  }
  s+="</svg>";
  host.innerHTML=s;

  const show=i=>{
    const x=arr[i]; if(!x)return;
    host.querySelectorAll(".selected").forEach(el=>el.classList.remove("selected"));
    host.querySelectorAll(`[data-index="${i}"]`).forEach(el=>el.classList.add("selected"));
    if(selection){
      selection.innerHTML=`<strong>${months[i]} ${y}</strong><div class="detail-grid"><span class="detail-item">Gas: <b>${fmt(+x.gas||0)} kWh</b></span><span class="detail-item temp">Außentemperatur: <b>${x.out!=null?fmt(x.out)+" °C":"keine Daten"}</b></span>${x.heating!=null?`<span class="detail-item">Heizung: <b>${fmt(x.heating)} kWh</b></span>`:""}${x.hotWater!=null?`<span class="detail-item">Warmwasser: <b>${fmt(x.hotWater)} kWh</b></span>`:""}</div>`;
    }
  };
  host.querySelectorAll("[data-index]").forEach(el=>{
    el.addEventListener("click",()=>show(+el.dataset.index));
    el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();show(+el.dataset.index)}});
  });
  const first=arr.findIndex(x=>(+x.gas||0)>0||x.out!=null);
  if(first>=0)show(first);
}

function renderYear(){
  const arr=monthly(currentYear),max=Math.max(...arr.map(x=>+x.gas||0),1);
  $("#yearTotal").textContent=fmt(total(currentYear))+" kWh";
  $("#yearView").innerHTML=`<div class="panel-head"><div><div class="eyebrow">${currentYear}</div><h2>Monatlicher Verbrauch</h2></div><div class="muted">Gas</div></div>`+
    arr.map(x=>`<div class="month-row"><strong>${months[x.month-1]}</strong><div class="bar-bg"><div class="bar" style="width:${Math.max(0,(x.gas/max)*100)}%"></div></div><div class="value">${fmt(+x.gas||0)} kWh</div></div>`).join("");
  renderChart(currentYear);
}

function renderCompare(){
  const all=years().filter(y=>y<=currentYear);
  if(all.length<2){
    $("#compareView").innerHTML=`<div class="panel-head"><div><div class="eyebrow">VERGLEICH</div><h2>Mehrjahresvergleich</h2></div></div><p class="muted">Importiere mindestens zwei Jahre, um Einsparungen und Monatsverläufe direkt gegenüberzustellen.</p>`;
    return;
  }
  const ys=all.slice(0,4).reverse(); // oldest -> newest, max. 4 years
  const latestMonth=Math.max(1,...monthly(currentYear).map((x,i)=>(x.gas>0||x.out!=null)?i+1:0));
  const current=totalToMonth(currentYear,latestMonth);
  const previous=ys.filter(y=>y!==currentYear).map(y=>({y,total:totalToMonth(y,latestMonth)}));
  const baseline=previous.length?previous[previous.length-1].total:0;
  const savings=baseline?((baseline-current)/baseline*100):0;

  const W=760,H=280,pad={l:48,r:18,t:18,b:36},cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
  const max=Math.max(1,...ys.flatMap(y=>monthly(y).map(x=>+x.gas||0)));
  const palette=["#9b94b5","#c8c1dc","#25a9e8","#f2a65a"];
  const lines=ys.map((y,yi)=>{
    const pts=monthly(y).map((x,i)=>`${pad.l+(i/11)*cw},${pad.t+ch-(x.gas/max)*ch}`).join(" ");
    return `<polyline class="line" style="stroke:${palette[yi]}" points="${pts}"/>`+
      monthly(y).map((x,i)=>`<circle class="dot" style="fill:${palette[yi]}" cx="${pad.l+(i/11)*cw}" cy="${pad.t+ch-(x.gas/max)*ch}" r="3.5"><title>${y} · ${months[i]}: ${fmt(x.gas)} kWh</title></circle>`).join("");
  }).join("");
  let grid="";
  for(let i=0;i<=4;i++){
    const v=max*(1-i/4),yy=pad.t+ch-(v/max)*ch;
    grid+=`<line class="grid" x1="${pad.l}" x2="${W-pad.r}" y1="${yy}" y2="${yy}"/><text class="axis" x="${pad.l-6}" y="${yy+4}" text-anchor="end">${fmt(v)}</text>`;
  }
  months.forEach((m,i)=>{grid+=`<text class="axis" x="${pad.l+(i/11)*cw}" y="${H-10}" text-anchor="middle">${m}</text>`});
  const summaryLabel=latestMonth===12?"Jahresvergleich":"Vergleich bis "+months[latestMonth-1];
  $("#compareView").innerHTML=`<div class="panel-head"><div><div class="eyebrow">MEHRJAHRESVERGLEICH</div><h2>Verbrauch auf einen Blick</h2></div><div class="muted">${summaryLabel}</div></div>
  <div class="compare-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Mehrjahresvergleich">${grid}${lines}</svg></div>
  <div class="compare-legend">${ys.map((y,i)=>`<span><i class="dot" style="background:${palette[i]}"></i>${y}</span>`).join("")}</div>
  <div class="compare-summary">
    <div class="metric"><span>${currentYear} bis ${months[latestMonth-1]}</span><strong>${fmt(current)} kWh</strong></div>
    <div class="metric"><span>Vergleich ${ys.find(y=>y!==currentYear)||""}</span><strong>${baseline?fmt(baseline)+" kWh":"–"}</strong></div>
    <div class="metric"><span>${savings>=0?"Einsparung":"Mehrverbrauch"}</span><strong>${baseline?`${savings>=0?"−":"+"}${Math.abs(savings).toFixed(1).replace(".",",")} %`:"–"}</strong></div>
  </div>
  <div class="panel-head" style="margin-top:18px"><div><div class="eyebrow">MONATLICH</div><h2>Exakte Werte</h2></div></div>
  ${months.map((m,i)=>`<div class="month-row"><strong>${m}</strong><div class="muted">${ys.map(y=>`${y}: ${fmt(monthly(y)[i].gas)} kWh`).join(" · ")}</div><div class="value">${i+1<=latestMonth?"":"–"}</div></div>`).join("")}`;
}
function totalToMonth(y,m){return monthly(y).slice(0,m).reduce((s,x)=>s+(+x.gas||0),0)}

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
