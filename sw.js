/* Network first for releases, offline fallback for already cached application files. */
const CACHE='buderus-monitor-v4.2.0';
const ASSETS=['./','./index.html','./styles.css?v=4.1.0','./app.mjs?v=4.1.0','./engine.mjs','./cloud.mjs?v=4.2.0','./manifest.webmanifest?v=4.1.0','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('buderus-monitor-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {const response=await fetch(e.request);if(response.ok)cache.put(e.request,response.clone()).catch(()=>{});return response;}
    catch {const cached=await cache.match(e.request,{ignoreSearch:true});if(cached)return cached;throw new Error('Offline und Datei nicht im Cache');}
  })());
});
