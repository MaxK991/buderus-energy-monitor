// Public Supabase URL and publishable key. Never put service-role/secret keys here.
const BASE='https://eddbnykcztpxtwelgric.supabase.co';
const KEY='sb_publishable_lXoUa50-BBPuaYVmtbyK6w_IVRc9_bv';
const SESSION_KEY='buderus_hub_cloud_session_v1';
const FIELDS={gas:'gas_kwh',heating:'heating_kwh',hotWater:'hot_water_kwh',outside:'outside_temp_c',room:'room_temp_c',waterTemp:'hot_water_temp_c'};
let session=null;
let enabled=false;
const on=s=>document.getElementById(s);
function status(s){on('cloudStatus').textContent=s}
async function api(path,{method='GET',token,body,headers={}}={}){
  const response=await fetch(BASE+path,{method,headers:{apikey:KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();let result;try{result=text?JSON.parse(text):null}catch{result=text}
  if(!response.ok)throw Error(result?.msg||result?.message||result?.error_description||`HTTP ${response.status}`);
  return result;
}
function persistSession(value){session=value;if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY)}
async function access(){
  if(!session)throw Error('Bitte anmelden.');
  if(session.expires_at&&Date.now()>session.expires_at-90000){
    const next=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});
    persistSession({...next,expires_at:Date.now()+next.expires_in*1000});
  }
  return session.access_token;
}
function connected(){return !!session?.access_token}
function update(){on('cloudSignedOut').hidden=connected();on('cloudSignedIn').hidden=!connected();on('cloudAccount').textContent=connected()?'Angemeldet: '+(session.user?.email||'Supabase Benutzerkonto'):''}
async function signIn(mode){
  const email=on('cloudEmail').value.trim(),password=on('cloudPassword').value;
  if(!email||password.length<8){status('Bitte E-Mail und Passwort (mindestens 8 Zeichen) eingeben.');return}
  try{
    status('Verbindung wird hergestellt …');
    const path=mode==='signup'?'/auth/v1/signup':'/auth/v1/token?grant_type=password';
    const v=await api(path,{method:'POST',body:{email,password}});
    on('cloudPassword').value='';
    if(!v.access_token){status('Bitte E-Mail-Bestätigung abschließen und danach anmelden.');return}
    persistSession({...v,expires_at:Date.now()+(v.expires_in||3600)*1000});
    enabled=false;update();status('Angemeldet. Deine lokalen Daten wurden noch nicht hochgeladen. Tippe „Jetzt synchronisieren“.');
  }catch(e){status('Anmeldung fehlgeschlagen: '+e.message)}
}
function toDB(r,uid){
  const t=r.timestamp;
  const period_start=r.kind==='month'?t+'-01T00:00:00':r.kind==='day'?t+'T00:00:00':t+':00';
  const v={user_id:uid,period_type:r.kind,period_start};
  for(const [a,b] of Object.entries(FIELDS))v[b]=r[a];
  return v;
}
function fromDB(r){
  const stamp=r.period_start.slice(0,16);
  const timestamp=r.period_type==='month'?stamp.slice(0,7):r.period_type==='day'?stamp.slice(0,10):stamp;
  const v={kind:r.period_type,timestamp,capturedAt:new Date(r.imported_at||Date.now()).toISOString().slice(0,10)};
  for(const [a,b] of Object.entries(FIELDS))v[a]=r[b];
  return v;
}
async function sync(localRows,mergeFn,persistFn){
  if(!connected())throw Error('Bitte zuerst anmelden.');
  status('Cloud-Abgleich läuft …');
  const token=await access();
  const uid=session.user?.id;
  if(!uid)throw Error('Benutzerkonto konnte nicht verifiziert werden.');
  let cloud=[];
  // Paginate: PostgREST defaults to 1000 rows.
  for(let offset=0;;offset+=500){
    const batch=await api('/rest/v1/buderus_measurements?select=*&order=period_start.asc&limit=500&offset='+offset,{token});
    if(!Array.isArray(batch))throw Error('Unerwartete Antwort der Cloud.');
    cloud.push(...batch);if(batch.length<500)break;
    if(offset>100000)throw Error('Zu viele Datensätze für den Abgleich.');
  }
  const merged=mergeFn(cloud.map(fromDB),localRows).rows;
  if(!persistFn(merged))throw Error('Die zusammengeführten Daten konnten lokal nicht gespeichert werden.');
  const dbRows=merged.map(r=>toDB(r,uid));
  for(let i=0;i<dbRows.length;i+=150){
    await api('/rest/v1/buderus_measurements?on_conflict=user_id,period_type,period_start',{method:'POST',token,body:dbRows.slice(i,i+150),headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
  }
  enabled=true;
  status(`Synchronisiert: ${merged.length} Messdatensätze. Deine Daten sind lokal und in deiner privaten Cloud gespeichert.`);
  return merged;
}
export function initCloud({getRows,merge,persist,refresh}){
  try{const stored=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(stored?.refresh_token)session=stored}catch{}
  update();status(connected()?'Angemeldet. Synchronisierung starten, um deine Cloud-Historie abzugleichen.':'Cloud nicht verbunden.');
  on('cloudLogin').addEventListener('click',()=>signIn('login'));
  on('cloudSignup').addEventListener('click',()=>signIn('signup'));
  on('cloudLogout').addEventListener('click',()=>{persistSession(null);enabled=false;update();status('Abgemeldet. Die lokale Historie bleibt erhalten.')});
  const doSync=async()=>{try{await sync(getRows(),merge,rows=>persist(rows),);refresh()}catch(e){status('Synchronisierung fehlgeschlagen: '+e.message)}};
  on('cloudSync').addEventListener('click',doSync);
  return {afterImport:()=>{if(connected()&&enabled)doSync()},isConnected:connected};
}
