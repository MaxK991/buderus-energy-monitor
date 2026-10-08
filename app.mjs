import {MONTHS,FIELDS,parseBuderusCSV,mergeRecords,normalizeRecord,getYears,getYear,getComparison,formatEnergy,formatTemp} from './engine.mjs';

const VERSION='v4.0.0';
const STORAGE='buderus_monitor_v4_rows';
const LEGACY='buderus_energy_v2';
const FILE_COUNT='buderus_monitor_v4_file_count';
const LAST_IMPORT='buderus_monitor_v4_last_import';
const $=id=>document.getElementById(id);
const today=new Date();
let rows=[];
let currentYear=today.getFullYear();
let compareCurrent=currentYear;
let comparePrevious=currentYear-1;
let selectedMonth=null;
let selectedComparisonMonth=null;
let tab='year';
let importedFiles=0;
let lastImport=null;
let migrated=false;
const safeNumber=n=>Math.max(0,Math.min(100,Number(n)||0));
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readableDate(date){try{return new Date(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})}catch{return '–'}}
function setStatus(text,type='info'){$('importStatus').textContent=text;$('importStatus').className='notification '+(type==='info'?'':type)}
function error(text){$('globalError').hidden=false;$('globalError').textContent=text;}
function loadState(){
  try{
    const v4=localStorage.getItem(STORAGE);
    const legacy=v4===null?localStorage.getItem(LEGACY):null;
    const source=v4!==null?v4:legacy;
    const parsed=source?JSON.parse(source):[];
    if(!Array.isArray(parsed))throw Error('Gespeicherte Daten haben ein unerwartetes Format.');
    rows=mergeRecords([],parsed).rows;
    migrated=v4===null && legacy!==null;
    importedFiles=Number(localStorage.getItem(FILE_COUNT))||Number(localStorage.getItem(LEGACY+'_files'))||0;
    lastImport=localStorage.getItem(LAST_IMPORT);
  }catch(e){error('Gespeicherte Daten konnten nicht eingelesen werden: '+e.message+' Die Originaldaten bleiben erhalten.');rows=[];}
}
function persist(nextRows,nextCount){
  // Do not clear the legacy key: it remains an additional recovery option after upgrading.
  try{
    localStorage.setItem(STORAGE,JSON.stringify(nextRows));
    localStorage.setItem(FILE_COUNT,String(nextCount));
    const d=new Date().toISOString();
    localStorage.setItem(LAST_IMPORT,d);
    rows=nextRows; importedFiles=nextCount;lastImport=d;migrated=false;
    return true;
  }catch(e){error('Speichern fehlgeschlagen (möglicherweise ist der Gerätespeicher voll): '+e.message);return false;}
}
function updateMeta(){
  $('versionLabel').textContent='Version '+VERSION;
  $('saveLabel').textContent=lastImport?'Lokal gesichert · '+readableDate(lastImport):'Nur auf diesem Gerät';
  const years=getYears(rows);
  const withMonths=years.map(y=>getYear(rows,y,today).monthsWithData).reduce((a,b)=>a+b,0);
  $('dataStat').textContent=`${rows.length.toLocaleString('de-DE')} Messdatensätze · ${years.length} Jahr${years.length===1?'':'e'} · ${withMonths} Monate mit Verbrauchsdaten`+
    (importedFiles?` · ${importedFiles} verarbeitete Datei${importedFiles===1?'':'en'}`:'')+
    (migrated?' · Bestehende Historie aus vorheriger Version erkannt':'');
}
function buildOptions(id,yrs,value){
  const sel=$(id);
  sel.replaceChildren();
  const choices=yrs.length?yrs:[today.getFullYear()];
  for(const y of choices){const o=document.createElement('option');o.value=String(y);o.textContent=String(y);sel.append(o);}
  sel.value=String(choices.includes(value)?value:choices[0]);
  return Number(sel.value);
}
function renderSelectors(){
  const yrs=getYears(rows);
  if(yrs.length && !yrs.includes(currentYear))currentYear=yrs[0];
  currentYear=buildOptions('yearSelect',yrs,currentYear);
  if(yrs.length && !yrs.includes(compareCurrent))compareCurrent=yrs[0];
  if(yrs.length && !yrs.includes(comparePrevious))comparePrevious=yrs[1]??yrs[0];
  if(yrs.length>1 && comparePrevious===compareCurrent) comparePrevious=yrs.find(y=>y!==compareCurrent);
  compareCurrent=buildOptions('compareCurrent',yrs,compareCurrent);
  comparePrevious=buildOptions('comparePrevious',yrs,comparePrevious);
}
function monthDetail(m){
  const source={month:'Monatswert aus Buderus',day:'aus Tageswerten errechnet',hour:'aus Stundenwerten errechnet',none:'keine Daten'}[m.source];
  return `<div class="detail"><div class="detail-heading">${MONTHS[m.month-1]} ${m.year} · ${escapeHTML(source)}</div>
  <div class="detail-grid">
   <div><small>Gas gesamt</small><strong>${formatEnergy(m.gas)} kWh</strong></div>
   <div><small>Ø Außentemperatur</small><strong>${formatTemp(m.outside)}</strong></div>
   <div><small>Heizung</small><strong>${formatEnergy(m.heating)} kWh</strong></div>
   <div><small>Warmwasser</small><strong>${formatEnergy(m.hotWater)} kWh</strong></div>
   <div><small>Ø Raumtemperatur</small><strong>${formatTemp(m.room)}</strong></div>
   <div><small>Ø Warmwassertemperatur</small><strong>${formatTemp(m.waterTemp)}</strong></div>
  </div>${m.partial?'<p>Teilmonat / unvollständiger Zeitraum. Dieser Wert wird nicht als voller Monat mit einem anderen Jahr verglichen.</p>':''}</div>`;
}
function renderYear(){
  const y=getYear(rows,currentYear,today);
  const title=y.monthsWithData===12&&y.partialMonths===0?'Jahresverbrauch':'Summe vorhandener Daten';
  $('yearSummary').innerHTML=`<div><small>${title}</small><strong>${y.total===null?'–':formatEnergy(y.total)+' kWh'}</strong></div><div class="coverage"><span>${y.monthsWithData} von 12 Monaten</span><span>${y.partialMonths?`${y.partialMonths} Teilmonat${y.partialMonths>1?'e':''}`:'verfügbar'}</span></div>`;
  if(!rows.length){
    $('monthList').innerHTML=`<div class="empty-state"><strong>Noch keine Messwerte</strong>Importiere einen MyBuderus-Gesamtexport, um deine Monatsübersicht zu sehen.<br><button type="button" id="goImport">Zu Datenimport</button></div>`;
    $('yearNote').textContent='Deine Messwerte werden ausschließlich auf dem Gerät gespeichert.';
    return;
  }
  const max=Math.max(1,...y.months.map(m=>m.gas??0));
  $('monthList').innerHTML=y.months.map(m=>{
    const open=selectedMonth===m.month;
    const sub=m.gas===null?'Keine Daten':m.partial?'Teilmonat / bisher':'';
    const value=m.gas===null?'–':formatEnergy(m.gas)+' kWh';
    return `<div class="month-item">
      <button class="month-button" type="button" data-month="${m.month}" aria-expanded="${open}" aria-label="${MONTHS[m.month-1]} ${currentYear}: ${value}, Außentemperatur ${formatTemp(m.outside)}. Details ${open?'schließen':'öffnen'}">
      <div class="month-main"><span class="month-label">${MONTHS[m.month-1]}</span><span class="month-energy${m.gas===null?' missing':''}">${value}</span></div>
      <div class="month-sub"><div class="track"><div class="bar" style="width:${safeNumber((m.gas??0)/max*100)}%"></div></div><span class="temp-text">${m.outside===null?'Ø –':`Ø ${formatTemp(m.outside)}`}</span></div>
      ${sub?`<div class="month-extra">${sub}</div>`:''}</button>
      ${open?monthDetail(m):''}
    </div>`;
  }).join('');
  $('yearNote').textContent=y.monthsWithData<12?'Fehlende Monate werden bewusst nicht als 0 kWh dargestellt. Ein Jahreswert ist nur dann vollständig, wenn alle zwölf Monate vorhanden sind.':'';
}
function pctText(change){if(change===null)return 'Kein gültiger Vergleich';return (change>0?'+':'−')+Math.abs(change).toLocaleString('de-DE',{maximumFractionDigits:1,minimumFractionDigits:1})+' % '+(change>0?'Mehrverbrauch':change<0?'Einsparung':'Veränderung');}
function compareDetails(a,b,index){
  const x=a.months[index],y=b.months[index];
  return `<div class="detail"><div class="detail-heading">${MONTHS[index]} · ${a.year} und ${b.year}</div><div class="detail-grid">
    <div><small>${a.year} Gas</small><strong>${formatEnergy(x.gas)} kWh</strong></div>
    <div><small>${b.year} Gas</small><strong>${formatEnergy(y.gas)} kWh</strong></div>
    <div><small>${a.year} Außentemperatur</small><strong>${formatTemp(x.outside)}</strong></div>
    <div><small>${b.year} Außentemperatur</small><strong>${formatTemp(y.outside)}</strong></div>
  </div>${!(x.comparable&&y.comparable)?'<p>Mindestens einer der Monate fehlt oder ist unvollständig. Daher keine prozentuale Bewertung.</p>':''}</div>`;
}
function renderCompare(){
  $('legendCurrent').textContent=String(compareCurrent);
  $('legendPrevious').textContent=String(comparePrevious);
  const result=getComparison(rows,compareCurrent,comparePrevious,today),{a,b,common,change}=result;
  const comparable=compareCurrent!==comparePrevious&&common.length>0;
  const changeClass=change===null?'':change<0?'positive':change>0?'negative':'';
  $('compareSummary').innerHTML=comparable?`<div class="small">${common.length} gemeinsame, vollständige Monate</div><div class="big ${changeClass}">${change===null?'Veränderung nicht berechenbar':pctText(change)}</div><div class="note">${a.year}: ${formatEnergy(result.sumA)} kWh · ${b.year}: ${formatEnergy(result.sumB)} kWh (nur identische Monate)</div>`:
    `<div class="small">Jahresvergleich</div><div class="big">Noch kein belastbarer Vergleich</div><div class="note">${compareCurrent===comparePrevious?'Bitte zwei unterschiedliche Jahre auswählen.':'Es fehlen gemeinsame, vollständig erfasste Monate.'}</div>`;
  const max=Math.max(1,...a.months.map(m=>m.gas??0),...b.months.map(m=>m.gas??0));
  $('comparisonList').innerHTML=a.months.map((m,i)=>{
    const prev=b.months[i], can=compareCurrent!==comparePrevious&&m.comparable&&prev.comparable;
    const delta=can&&prev.gas!==0?((m.gas-prev.gas)/prev.gas)*100:null;
    const label=can?(delta===null?'Nicht berechenbar':(delta>0?'+':'')+delta.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' %'):'–';
    const css=delta===null?'':delta<0?'good':delta>0?'bad':'';
    const opened=selectedComparisonMonth===i;
    const pair=(data,year,klass)=>`<div class="comparison-line"><span class="year">${year}</span><div class="track"><div class="bar ${klass}" style="width:${safeNumber((data.gas??0)/max*100)}%"></div></div><span class="number">${formatEnergy(data.gas)}</span></div>`;
    return `<div class="comparison-item"><button type="button" class="comparison-button" data-compare-month="${i}" aria-expanded="${opened}" aria-label="${MONTHS[i]} vergleichen, ${compareCurrent}: ${formatEnergy(m.gas)} kWh, ${comparePrevious}: ${formatEnergy(prev.gas)} kWh">
      <div class="comparison-top"><strong>${MONTHS[i]}</strong><span class="change ${css}">${label}</span></div>
      ${pair(m,compareCurrent,'compare-current')}${pair(prev,comparePrevious,'compare-previous')}
      </button>${opened?compareDetails(a,b,i):''}</div>`;
  }).join('');
  $('compareNote').textContent='Jeder Monat enthält zwei getrennte Balken mit exakten kWh-Werten. Prozentwerte erscheinen nur bei zwei vollständigen Monatswerten. Fehlende oder laufende Monate zählen nicht als Einsparung.';
}
function setTab(value){
  if(!['year','compare','data'].includes(value))return;
  tab=value;
  for(const name of ['year','compare','data']){
    $(name+'Panel').hidden=name!==value;
    const button=document.querySelector(`[data-tab="${name}"]`);
    button.classList.toggle('is-active',name===value);
    button.setAttribute('aria-selected',String(name===value));
  }
  if(value==='year')renderYear();
  if(value==='compare')renderCompare();
}
function refresh(){renderSelectors();renderYear();renderCompare();updateMeta();}
async function importCSVs(files){
  if(!files.length)return;
  setTab('data');setStatus('Dateien werden gelesen …');
  let pending=rows;
  let added=0,updated=0,identical=0,validFiles=0,skipped=0;
  const failures=[];
  for(const file of files){
    try{
      if(!file.name.toLowerCase().endsWith('.csv'))throw Error('Nur CSV-Dateien werden unterstützt.');
      if(file.size>6_000_000)throw Error('Maximal 6 MB pro CSV-Datei.');
      const parsed=parseBuderusCSV(await file.text(),file.name);
      const merged=mergeRecords(pending,parsed.rows);
      pending=merged.rows;added+=merged.added;updated+=merged.updated;identical+=merged.unchanged;skipped+=parsed.skippedEmpty;validFiles++;
    }catch(e){failures.push(`${file.name}: ${e.message}`);}
  }
  if(validFiles){
    if(!persist(pending,importedFiles+validFiles)){setStatus('Dateien gelesen, aber Speichern fehlgeschlagen. Bitte eine Sicherung herunterladen und Speicherplatz prüfen.','error');return;}
    refresh();
    setStatus(`${validFiles} Datei${validFiles===1?'':'en'} verarbeitet · ${added} neue Messwerte · ${updated} aktualisiert · ${identical} unverändert · ${skipped} leere Zeilen übersprungen.`+(failures.length?'\nNicht verarbeitet: '+failures.join(' | '):''),failures.length?'error':'success');
  }else setStatus('Import fehlgeschlagen: '+failures.join(' | '),'error');
}
function downloadBackup(){
  if(!rows.length){setStatus('Noch keine Daten vorhanden, die gesichert werden können.','error');setTab('data');return;}
  const payload={schema:'buderus-monitor-backup-v1',exportedAt:new Date().toISOString(),version:VERSION,rows};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Buderus-Sicherung-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  setStatus('Sicherung vorbereitet. Bitte die JSON-Datei an einem sicheren Ort aufbewahren.','success');
}
async function restoreBackup(file){
  if(!file)return;
  try{
    if(file.size>10_000_000)throw Error('Sicherungsdatei ist zu groß.');
    const payload=JSON.parse(await file.text());
    if(payload.schema!=='buderus-monitor-backup-v1'||!Array.isArray(payload.rows))throw Error('Das ist keine gültige Buderus-Sicherung.');
    const normalized=mergeRecords([],payload.rows);
    if(!normalized.rows.length)throw Error('Keine gültigen Messwerte in der Sicherung.');
    const merged=mergeRecords(rows,normalized.rows);
    if(!persist(merged.rows,importedFiles)){setStatus('Wiederherstellung konnte nicht gespeichert werden.','error');return;}
    refresh();setStatus(`Sicherung ergänzt: ${merged.added} neue und ${merged.updated} aktualisierte Datensätze.`,'success');
  }catch(e){setStatus('Wiederherstellung fehlgeschlagen: '+e.message,'error');}
}
function attach(){
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  $('yearSelect').addEventListener('change',e=>{currentYear=Number(e.target.value);selectedMonth=null;renderYear()});
  $('compareCurrent').addEventListener('change',e=>{compareCurrent=Number(e.target.value);selectedComparisonMonth=null;renderCompare()});
  $('comparePrevious').addEventListener('change',e=>{comparePrevious=Number(e.target.value);selectedComparisonMonth=null;renderCompare()});
  $('monthList').addEventListener('click',e=>{
    if(e.target.id==='goImport'){setTab('data');return;}
    const b=e.target.closest('[data-month]'); if(!b)return;
    const n=Number(b.dataset.month);selectedMonth=selectedMonth===n?null:n;renderYear();
  });
  $('comparisonList').addEventListener('click',e=>{const b=e.target.closest('[data-compare-month]');if(!b)return;const n=Number(b.dataset.compareMonth);selectedComparisonMonth=selectedComparisonMonth===n?null:n;renderCompare()});
  $('csvInput').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';await importCSVs(files)});
  $('backupBtn').addEventListener('click',downloadBackup);
  $('restoreInput').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';await restoreBackup(file)});
  $('clearBtn').addEventListener('click',()=>{
    if(!window.confirm('Alle lokal gespeicherten Buderus-Messwerte wirklich löschen? Bitte vorher eine Sicherung herunterladen.'))return;
    try{
      localStorage.removeItem(STORAGE);localStorage.removeItem(LEGACY);localStorage.removeItem(LEGACY+'_files');localStorage.removeItem(FILE_COUNT);localStorage.removeItem(LAST_IMPORT);
      rows=[];importedFiles=0;lastImport=null;selectedMonth=null;selectedComparisonMonth=null;refresh();setStatus('Die lokale Historie wurde gelöscht.','success');
    }catch(e){error('Löschen fehlgeschlagen: '+e.message);}
  });
}
function registerSW(){
  if(!('serviceWorker'in navigator))return;
  navigator.serviceWorker.register('./sw.js?v=4.0.0').catch(()=>{});
}
window.addEventListener('error',event=>error('App-Fehler: '+event.message));
window.addEventListener('unhandledrejection',event=>error('Unerwarteter Fehler: '+(event.reason?.message||String(event.reason))));

loadState();
attach();
refresh();
setTab('year');
registerSW();
