const V="hifz-v4", KEEP=[V,"hifz-audio","hifz-data"];
const SHELL=["./","index.html","style.css","app.js","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>!KEEP.includes(x)).map(x=>caches.delete(x)))));self.clients.claim()});
// الصوت يُدار من الصفحة (طلبات Range)، وما عداه: من الذاكرة أولاً مع تحديث في الخلفية
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET"||!u.protocol.startsWith("http")||u.hostname==="cdn.islamic.network") return;
  e.respondWith(caches.open(u.origin===location.origin?V:"hifz-data").then(async c=>{
    const hit=await c.match(r);
    const net=fetch(r).then(res=>{if(res.ok||res.type==="opaque")c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net;
  }));
});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window"}).then(l=>l[0]?l[0].focus():clients.openWindow("./")))});
// تذكير تقريبي (يحدد المتصفح توقيته) إذا كان التطبيق مثبّتاً على أندرويد
self.addEventListener("periodicsync",e=>{if(e.tag==="hifz-wird")e.waitUntil(remind())});
async function remind(){
  const c=await caches.open("hifz-data"), r=await c.match("wird.json"); if(!r) return;
  const w=await r.json(), n=new Date(), d=n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0");
  if(!w.time||(w.done&&w.day===d)||w.notified===d) return;
  const [h,m]=w.time.split(":").map(Number); if(n.getHours()*60+n.getMinutes()<h*60+m) return;
  await c.put("wird.json",new Response(JSON.stringify({...w,notified:d})));
  await self.registration.showNotification("نُور الحِفظ",{body:"حان وقت وردك اليوم. ابدأ ولو بآية.",icon:"icon-192.png",tag:"wird",lang:"ar",dir:"rtl"});
}
