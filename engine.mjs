/** Pure energy-data functions, independent of the DOM and browser storage. */
export const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export const FIELDS = ['gas','heating','hotWater','outside','room','waterTemp'];
export const KIND = {Stunde:'hour', Tag:'day', Monat:'month', hour:'hour', day:'day', month:'month'};

export function parseNumber(input) {
  if(input === null || input === undefined) return null;
  if(typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = String(input).trim().replace(/\u00a0|\s/g,'');
  if(!s || s === '-' || s.toLowerCase()==='null') return null;
  let normalized = s;
  if(s.includes(',')) normalized = s.replace(/\./g,'').replace(',','.');
  else if(/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g,'');
  const v = Number(normalized);
  return Number.isFinite(v) ? v : null;
}

export function validTimestamp(kind, ts) {
  const regex = {hour:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, day:/^\d{4}-\d{2}-\d{2}$/, month:/^\d{4}-\d{2}$/};
  if(!regex[kind]?.test(ts)) return false;
  const y = +ts.slice(0,4), m=+ts.slice(5,7), d=ts.length>=10 ? +ts.slice(8,10) : 1;
  if(y<2000 || y>2100 || m<1 || m>12) return false;
  const daysInMonth=new Date(Date.UTC(y,m,0)).getUTCDate();
  if(d<1 || d>daysInMonth) return false;
  if(kind==='hour' && (+ts.slice(11,13)>23 || +ts.slice(14,16)>59)) return false;
  return true;
}

export function captureDateFromName(filename, fallback = new Date().toISOString().slice(0,10)) {
  const m=String(filename||'').match(/(20\d{2})[_-](\d{2})[_-](\d{2})/);
  if(m){ const d=`${m[1]}-${m[2]}-${m[3]}`; if(validTimestamp('day',d)) return d; }
  return fallback;
}

export function normalizeRecord(raw, defaultCapture = new Date().toISOString().slice(0,10)) {
  if(!raw || typeof raw!=='object') return null;
  const kind = KIND[raw.kind || raw.category];
  const timestamp = String(raw.timestamp || '').trim();
  if(!kind || !validTimestamp(kind,timestamp)) return null;
  const out={id:`${kind}|${timestamp}`,kind,timestamp,capturedAt:validTimestamp('day',String(raw.capturedAt||''))?raw.capturedAt:defaultCapture};
  for(const f of FIELDS) out[f]=parseNumber(raw[f]);
  return FIELDS.some(f=>out[f]!==null) ? out : null;
}

export function parseBuderusCSV(text,filename='',now=new Date()) {
  if(typeof text!=='string' || text.length>6_000_000) throw new Error('Datei ist leer oder zu groß.');
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  const header=lines.findIndex(line=>line.startsWith('Kategorie;Zeitstempel;'));
  if(header<0) throw new Error('Buderus-Kopfzeile (Kategorie;Zeitstempel) fehlt.');
  const capturedAt=captureDateFromName(filename,now.toISOString().slice(0,10));
  const rows=[];
  let missing=0,invalid=0;
  for(const line of lines.slice(header+1)) {
    if(!line.trim()) continue;
    const c=line.split(';');
    const kind=KIND[(c[0]||'').trim()], timestamp=(c[1]||'').trim();
    if(!kind || !validTimestamp(kind,timestamp) || c.length<8){invalid++;continue;}
    const row=normalizeRecord({kind,timestamp,gas:c[2],heating:c[3],hotWater:c[4],outside:c[5],room:c[6],waterTemp:c[7],capturedAt},capturedAt);
    if(row) rows.push(row); else missing++;
  }
  if(!rows.length) throw new Error('Kein Messwert gefunden. Bitte den MyBuderus-Gesamtexport verwenden.');
  return {rows,skippedEmpty:missing,skippedInvalid:invalid,filename,capturedAt};
}

export function mergeRecords(existing=[],incoming=[]) {
  const records=new Map();
  let added=0,updated=0,unchanged=0;
  for(const item of existing) { const r=normalizeRecord(item); if(r) records.set(r.id,r); }
  for(const item of incoming){
    const row=normalizeRecord(item);
    if(!row) continue;
    const prev=records.get(row.id);
    if(!prev){ records.set(row.id,row);added++;continue; }
    const newer=row.capturedAt>=prev.capturedAt;
    let changed=false;
    const next={...prev};
    for(const f of FIELDS){
      if(row[f]!==null && (next[f]===null || newer)){
        if(next[f]!==row[f]) changed=true;
        next[f]=row[f];
      }
    }
    if(row.capturedAt>prev.capturedAt){next.capturedAt=row.capturedAt;changed=true;}
    if(changed){records.set(row.id,next);updated++;}else unchanged++;
  }
  return {rows:[...records.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.kind.localeCompare(b.kind)),added,updated,unchanged};
}

export function getYears(rows){return [...new Set(rows.map(r=>+r.timestamp.slice(0,4)))].filter(Number.isFinite).sort((a,b)=>b-a);}
export function average(values){const numbers=values.filter(x=>x!==null && Number.isFinite(x)); return numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:null;}
function daysInMonth(year,month){return new Date(Date.UTC(year,month,0)).getUTCDate();}
function isMonthPartial(rec, year, month, now){
  if(!rec)return true;
  const capture=rec.capturedAt || now.toISOString().slice(0,10);
  const sameMonth=+capture.slice(0,4)===year && +capture.slice(5,7)===month;
  return sameMonth && +capture.slice(8,10)<daysInMonth(year,month);
}

export function getMonth(rows,year,month,now=new Date()){
  const items=rows.filter(r=>r.timestamp.startsWith(`${year}-${String(month).padStart(2,'0')}`));
  const monthly=items.filter(r=>r.kind==='month').sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt))[0];
  const days=items.filter(r=>r.kind==='day' && FIELDS.some(f=>r[f]!==null));
  const hours=items.filter(r=>r.kind==='hour');
  let source='none',partial=false,observed=false;
  let values=Object.fromEntries(FIELDS.map(f=>[f,null]));
  if(monthly){
    values=Object.fromEntries(FIELDS.map(f=>[f,monthly[f]]));
    source='month'; observed=true;
    partial=isMonthPartial(monthly,year,month,now);
  } else if(days.length){
    observed=true; source='day';
    const daysWithGas=days.filter(r=>r.gas!==null);
    const complete=daysWithGas.length===daysInMonth(year,month);
    partial=!complete;
    for(const f of ['gas','heating','hotWater']){
      const vals=days.map(r=>r[f]).filter(v=>v!==null);
      values[f]=vals.length ? vals.reduce((a,b)=>a+b,0) : null;
    }
    for(const f of ['outside','room','waterTemp']) values[f]=average(days.map(r=>r[f]));
  } else if(hours.length){
    observed=true; source='hour'; partial=true;
    for(const f of ['gas','heating','hotWater']){
      const vals=hours.map(r=>r[f]).filter(v=>v!==null);
      values[f]=vals.length ? vals.reduce((a,b)=>a+b,0) : null;
    }
    for(const f of ['outside','room','waterTemp']) values[f]=average(hours.map(r=>r[f]));
  }
  // A month row may lack a sensor; fill missing sensor from daily readings without replacing measured monthly values.
  if(monthly && days.length){for(const f of ['outside','room','waterTemp']) if(values[f]===null)values[f]=average(days.map(r=>r[f]));}
  const comparable=observed && !partial && source!=='hour' && values.gas!==null;
  return {year,month,source,observed,partial,comparable,days:days.length,hours:hours.length,...values};
}
export function getYear(rows,year,now=new Date()){
  const months=Array.from({length:12},(_,i)=>getMonth(rows,year,i+1,now));
  const values=months.filter(m=>m.gas!==null);
  return {year,months,total:values.length?values.reduce((sum,m)=>sum+m.gas,0):null,monthsWithData:values.length,completeMonths:months.filter(m=>m.comparable).length,partialMonths:months.filter(m=>m.observed && m.partial).length};
}
export function getComparison(rows,yearA,yearB,now=new Date()){
  const a=getYear(rows,yearA,now), b=getYear(rows,yearB,now);
  const common=a.months.map((m,i)=>m.comparable&&b.months[i].comparable?i:null).filter(i=>i!==null);
  const sumA=common.reduce((n,i)=>n+a.months[i].gas,0),sumB=common.reduce((n,i)=>n+b.months[i].gas,0);
  const change=common.length && sumB!==0?((sumA-sumB)/sumB)*100:null;
  return {a,b,common,sumA:common.length?sumA:null,sumB:common.length?sumB:null,change};
}
export const formatEnergy = v=>v===null||!Number.isFinite(v)?'–':new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v);
export const formatTemp = v=>v===null||!Number.isFinite(v)?'–':new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v)+' °C';
