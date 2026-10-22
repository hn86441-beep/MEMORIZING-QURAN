const V="hifz-v3", KEEP=[V,"hifz-audio","hifz-data"];
const SHELL=["./","index.html","style.css","app.js","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>!KEEP.includes(x)).map(x=>caches.delete(x)))));self.clients.claim()});
// الصوت يُدار من الصفحة (طلبات Range)، وما عداه: من الذاكرة أولاً مع تحديث في الخلفية
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET"||u.hostname==="cdn.islamic.network") return;
  e.respondWith(caches.open(u.origin===location.origin?V:"hifz-data").then(async c=>{
    const hit=await c.match(r);
    const net=fetch(r).then(res=>{if(res.ok||res.type==="opaque")c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net;
  }));
});
