const $ = id => document.getElementById(id);
const API = "https://api.alquran.cloud/v1/surah/";
// بيانات احتياطية تعمل بدون إنترنت
const FALLBACK = {112:["قُلْ هُوَ ٱللَّهُ أَحَدٌ","ٱللَّهُ ٱلصَّمَدُ","لَمْ يَلِدْ وَلَمْ يُولَدْ","وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ"]};
// توحيد الإملاء بين الرسم العثماني والإملاء المعتاد (الهمزات لا تُشترط، والألف الخنجرية تُطابَق بحسب الكلمة)
const norm = s => s.replace(/و\u0670/g,"\u0003").replace(/ى\u0670/g,"\u0002").replace(/\u0670/g,"\u0001")
  .replace(/[\u06E6\u06E7]/g,"\u0004").replace(/\u06E5/g,"\u0005")
  .replace(/[\u064B-\u065F\u06D6-\u06ED\u0640]/g,"").replace(/[أإءؤئ]/g,"").replace(/[آٱ]/g,"ا")
  .replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/\s+/g,"");
// كلمات يحذف فيها الإملاء المعتاد الألف (ذلك، هذا، الرحمن...) فتكون الألف الخنجرية اختيارية، وفي غيرها (كتاب، عالمين) مطلوبة
const OPT=["ذلك","هذ","رحمن","لكن","ولك","هلا","سموت"];
const same = (typed,target) => {
  if(typed===target) return true;
  const key=target.replace(/\u0001/g,""), opt=OPT.some(x=>key.includes(x))||key==="له";
  return new RegExp("^"+target.replace(/\u0001/g,opt?"ا?":"ا").replace(/\u0002/g,"[اي]").replace(/\u0003/g,"[او]").replace(/\u0004/g,"ي?").replace(/\u0005/g,"و?")+"$").test(typed);
};

const tokens=t=>t.split(" ").reduce((o,w)=>{if(norm(w)===""&&o.length)o[o.length-1]+=" "+w;else o.push(w);return o},[]); // علامات الوقف تُلحق بالكلمة السابقة
let tfs=null, curSurah=0, prog=false, stg=1, locked=false, ayahs=[], idx=0, wi=0, words=[], look=false, errors=0, typed=0, surahName="";
const store = {
  get(){try{return JSON.parse(localStorage.getItem("hifz"))||{}}catch{return{}}},
  set(v){try{localStorage.setItem("hifz",JSON.stringify(v))}catch{}}
};

function renderStats(){
  const s=store.get();
  $("st-streak").textContent=s.streak||0; $("st-words").textContent=s.words||0;
  {const w=s.words||0,e=s.errors||0;$("st-acc").textContent=w+e>0?Math.round(100*w/(w+e))+"%":"—"}
}
const ds=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
function today(){return ds(new Date())}
function bump(key,n=1){
  const s=store.get(); s[key]=(s[key]||0)+n;
  if(key==="words"&&s.last!==today()){
    const y=new Date();y.setDate(y.getDate()-1);
    s.streak=s.last===ds(y)?(s.streak||0)+1:1; s.last=today();
  }
  store.set(s); renderStats();
}

async function loadSurahList(){
  let list;
  try{
    list=JSON.parse(localStorage.getItem("surahs")||"null");
    if(!list){const r=await fetch("https://api.alquran.cloud/v1/surah");list=(await r.json()).data.map(x=>({n:x.number,name:x.name,c:x.numberOfAyahs}));localStorage.setItem("surahs",JSON.stringify(list));}
  }catch{list=[{n:112,name:"سورة الإخلاص",c:4}]}
  $("surah").innerHTML=list.map(x=>`<option value="${x.n}" data-c="${x.c}">${x.n}. ${x.name}</option>`).join("");
  $("surah").value=list.find(x=>x.n===112)?112:list[0].n; syncRange();
}
function syncRange(){const c=+$("surah").selectedOptions[0].dataset.c;$("from").max=$("to").max=c;$("from").value=1;$("to").value=Math.min(c,5)}

async function getSurah(n){
  const k="v2s"+n; const cached=localStorage.getItem(k);
  if(cached) return JSON.parse(cached);
  try{
    const d=(await (await fetch(API+n+"/quran-uthmani")).json()).data;
    let list=d.ayahs.map(a=>a.text); const nums=d.ayahs.map(a=>a.number);
    if(n!==1){const w=list[0].split(" ");if(same(norm("بسم الله الرحمن الرحيم"),norm(w.slice(0,4).join(" "))))list[0]=w.slice(4).join(" ")}
    const out={name:d.name,list,nums}; try{localStorage.setItem(k,JSON.stringify(out))}catch{} return out;
  }catch{ if(FALLBACK[n]) return {name:"سورة الإخلاص",list:FALLBACK[n],nums:[6222,6223,6224,6225]}; throw new Error("offline") }
}

async function start(){
  const n=+$("surah").value, f=+$("from").value, t=+$("to").value;
  if(!(f>=1&&t>=f)){alert("تأكد من أن آية البداية أقل من أو تساوي آية النهاية.");return}
  $("start").disabled=true;
  try{
    const s=await getSurah(n); surahName=s.name;
    ayahs=s.list.slice(f-1,t).map((text,i)=>({no:f+i,text,num:s.nums[f-1+i]}));
  }catch{alert("تعذر تحميل السورة. تحقق من الإنترنت وحاول مرة أخرى.");$("start").disabled=false;return}
  $("start").disabled=false; idx=0; errors=0; typed=0; stg=1;
  if(!ayahs.length){alert("هذا النطاق خارج آيات السورة. اختر آيات موجودة.");return}
  $("empty").hidden=$("done").hidden=true; $("stage").hidden=false; tfs=null; curSurah=n; loadAyah(); loadQuran(); loadTafsir(n);
}
function loadAyah(){
  const a=ayahs[idx]; words=tokens(a.text); wi=0;
  $("ayah-no").textContent=`${surahName} — الآية ${a.no}`; $("prog").textContent=`${idx+1} / ${ayahs.length}`+(prog?` — المرحلة ${stg} من 3`:"");
  $("bar").style.width=(idx/ayahs.length*100)+"%";
  $("stage").classList.toggle("look",look);
  $("ayah").innerHTML=words.map((w,i)=>`<span class="w" data-i="${i}">${w}</span>`).join("");
  if(prog){ // المرحلة 1: كاملة، 2: يختفي نصفها عشوائياً، 3: كلها مخفية
    const n=words.length, hide=stg===1?0:stg===3?n:Math.max(1,Math.floor(n/2));
    const hid=new Set([...words.keys()].sort(()=>Math.random()-.5).slice(0,hide));
    document.querySelectorAll(".w").forEach((e,i)=>e.classList.toggle("show",!hid.has(i)));
  }
  showTafsir();
  locked=false; if(!cont)stop(); $("similar").hidden=true; mark(); $("typer").value=""; $("typer").focus();
  if($("auto").checked&&!cont) play();
}
function mark(){document.querySelectorAll(".w").forEach(e=>e.classList.toggle("cur",+e.dataset.i===wi))}
function accept(skip=false){
  if(locked||wi>=words.length) return;
  $("similar").hidden=true;
  const e=document.querySelector(`.w[data-i="${wi}"]`); e.classList.remove("hint"); e.classList.add(skip?"skip":"lit");
  if(!skip){bump("words");typed++} wi++; $("typer").value="";
  if(wi>=words.length) return finishAyah(); mark();
}
function finishAyah(){
  if(prog&&stg<3){locked=true;stg++;$("typer").value="";setTimeout(loadAyah,700);return}
  stg=1; addWird("ayat",1);
  $("ayah").insertAdjacentHTML("beforeend",`<span class="end">﴿${ayahs[idx].no}﴾</span>`);
  locked=true; if(!cont)stop(); idx++; $("bar").style.width=(idx/ayahs.length*100)+"%";
  setTimeout(()=>idx>=ayahs.length?finish():loadAyah(),900);
}
function finish(){
  stop();
  $("stage").hidden=true; $("done").hidden=false;
  $("summary").textContent=`كتبت ${typed} كلمة بـ ${errors} محاولة خاطئة.`;
}
function check(force){
  if(locked||wi>=words.length) return;
  const el=$("typer"), v=norm(el.value), t=norm(words[wi]);
  el.classList.remove("bad","good");
  if(!v) return;
  if(same(v,t)){el.classList.add("good");accept();return}
  if(force||v.length>=t.length){void el.offsetWidth;el.classList.add("bad");errors++;bump("errors");similar(v);el.value=""}
}
$("typer").addEventListener("input",()=>check(false));
$("hint").onclick=()=>{if(locked||wi>=words.length)return;const e=document.querySelector(`.w[data-i="${wi}"]`);e.textContent=(words[wi].match(/^(?:.[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]*){1,3}/u)||[""])[0]+"…";e.classList.add("hint");$("typer").focus()};
$("reveal").onclick=()=>{if(locked||wi>=words.length)return;const e=document.querySelector(`.w[data-i="${wi}"]`);e.textContent=words[wi];accept(true)};
$("restart").onclick=()=>{if(!locked)loadAyah()};
function setMode(m){
  look=m==="look"; prog=m==="prog"; stg=1;
  ["memory","look","prog"].forEach(k=>$("m-"+k).classList.toggle("on",k===m));
  document.querySelectorAll(".w.show").forEach(e=>e.classList.remove("show"));
  $("stage").classList.toggle("look",look);
  if(!$("stage").hidden&&ayahs[idx]&&!locked) loadAyah();
}
["memory","look","prog"].forEach(k=>$("m-"+k).onclick=()=>setMode(k));
$("start").onclick=start; $("again").onclick=start; $("surah").onchange=syncRange;
/* ===== الصوت ===== */
const prefs=(()=>{try{return JSON.parse(localStorage.getItem("hifzPrefs"))||{}}catch{return{}}})();
$("reciter").value=prefs.r||"ar.alafasy"; $("speed").value=prefs.s||"1";
$("auto").checked=!!prefs.a; $("loop").checked=!!prefs.l;
const savePrefs=()=>{try{localStorage.setItem("hifzPrefs",JSON.stringify({r:$("reciter").value,s:$("speed").value,a:$("auto").checked,l:$("loop").checked}))}catch{}};
["reciter","speed","auto","loop"].forEach(id=>$(id).addEventListener("change",()=>{savePrefs();if(id==="speed")audio.playbackRate=+$("speed").value;if(id==="reciter"&&!audio.paused)play(playingIdx)}));
const audio=new Audio(); audio.preload="auto";
function setPlaying(on){
  $("audio").classList.toggle("playing",on);
  $("play").textContent=on&&!cont?"⏸ إيقاف":"▶ استمع";
  $("playall").textContent=cont?"⏹ إيقاف المتصلة":"⏩ تلاوة متصلة";
  $("astat").textContent=on&&cont&&ayahs[playingIdx]?`تُتلى الآية ${ayahs[playingIdx].no}`:"";
}
function clearSing(){document.querySelectorAll(".sing").forEach(e=>e.classList.remove("sing"))}
let cont=false, playingIdx=0, blobUrl=null;
const aurl=(a,r=$("reciter").value)=>`https://cdn.islamic.network/quran/audio/128/${r}/${a.num}.mp3`;
async function play(i=idx){
  const a=ayahs[i]; if(!a||!a.num) return;
  playingIdx=i; let src=aurl(a);
  try{ // إن كانت الآية منزَّلة نشغّلها من الجهاز
    const r=await (await caches.open("hifz-audio")).match(src);
    if(r){ if(blobUrl)URL.revokeObjectURL(blobUrl); src=blobUrl=URL.createObjectURL(await r.blob()); }
  }catch{}
  audio.src=src; audio.playbackRate=+$("speed").value;
  audio.play().catch(()=>setPlaying(false));
}
function stop(){audio.pause();cont=false;setPlaying(false);clearSing()}
audio.onplay=()=>setPlaying(true);
audio.onerror=()=>setPlaying(false);
audio.onended=()=>{
  setPlaying(false);clearSing();
  if(cont){ if(playingIdx+1<ayahs.length) setTimeout(()=>{if(cont)play(playingIdx+1)},500); else {cont=false;setPlaying(false)} }
  else if($("loop").checked&&!locked&&!$("stage").hidden) setTimeout(()=>{if(!locked)play()},700);
};
audio.ontimeupdate=()=>{
  if(!audio.duration||!words.length||playingIdx!==idx) return;
  const L=words.map(w=>norm(w).length+1), T=L.reduce((x,y)=>x+y);
  let p=audio.currentTime/audio.duration*T, i=0;
  while(i<L.length-1&&p>=L[i]){p-=L[i];i++}
  document.querySelectorAll(".w").forEach((e,k)=>e.classList.toggle("sing",k===i));
};
$("play").onclick=()=>{audio.paused?play():stop();$("typer").focus()};
$("typer").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();if(e.shiftKey)audio.paused?play():stop();else check(true)}});

/* ===== تلاوة متصلة وتنزيل الصوت ===== */
$("playall").onclick=()=>{ if(cont)stop(); else {cont=true;play(idx)} $("typer").focus() };
$("dl").onclick=async()=>{
  if(!("caches" in window)||!ayahs.length) return;
  const r=$("reciter").value; let n=0; $("dl").disabled=true;
  try{
    const c=await caches.open("hifz-audio");
    for(const a of ayahs){
      const u=aurl(a,r);
      if(!(await c.match(u))){const res=await fetch(u,{mode:"cors"}); if(!res.ok) throw 0; await c.put(u,res)}
      $("dlst").textContent=`تنزيل ${++n} / ${ayahs.length}`;
    }
    $("dlst").textContent="تم التنزيل، يعمل الآن بلا إنترنت ✓";
  }catch{ $("dlst").textContent="تعذّر التنزيل، تحقق من الاتصال." }
  $("dl").disabled=false;
};

/* ===== عرض المتشابهات (يُحسب من نص المصحف نفسه) ===== */
let Q=null, qLoad=null;
function loadQuran(){
  if(qLoad) return qLoad;
  return qLoad=(async()=>{
    try{
      const d=(await (await fetch("https://api.alquran.cloud/v1/quran/quran-uthmani")).json()).data.surahs, bsm=norm("بسم الله الرحمن الرحيم"); Q=[];
      for(const s of d) s.ayahs.forEach((a,i)=>{
        let t=a.text;
        if(s.number!==1&&i===0){const w=t.split(" "); if(same(bsm,norm(w.slice(0,4).join(" ")))) t=w.slice(4).join(" ")}
        Q.push({sn:s.name,s:s.number,a:a.numberInSurah,t,n:" "+tokens(t).map(norm).join(" ")+" "});
      });
    }catch{Q=null;qLoad=null}
  })();
}
function similar(typedNorm){
  if(!Q||wi<2) return;
  const cur=ayahs[idx], nw=words.map(norm), ok=nw[wi];
  for(const k of new Set([Math.min(wi,3),2])){
    const ctx=" "+nw.slice(wi-k,wi).join(" ")+" ", hits=[];
    for(const q of Q){
      if(q.s===cur.s&&q.a===cur.no) continue;
      for(let p=q.n.indexOf(ctx);p>=0;p=q.n.indexOf(ctx,p+1)){
        const head=q.n.slice(0,p+ctx.length), nx=q.n.slice(head.length).split(" ")[0];
        if(nx&&nx!==ok){hits.push({q,nx,ix:head.split(" ").length-2});break}
      }
      if(hits.length>=6)break;
    }
    if(!hits.length) continue;
    hits.sort((a,b)=>same(typedNorm,b.nx)-same(typedNorm,a.nx));
    const mine=same(typedNorm,hits[0].nx);
    $("similar").innerHTML=`<h3>${mine?"الكلمة التي كتبتها وردت في آية أخرى بنفس السياق":"هذا السياق ورد في آيات أخرى فانتبه"}</h3>`+
      hits.slice(0,3).map(h=>`<p>${tokens(h.q.t).map((w,i)=>i===h.ix?`<mark>${w}</mark>`:w).join(" ")}<small>${h.q.sn} — الآية ${h.q.a}</small></p>`).join("");
    $("similar").hidden=false; return;
  }
}

/* ===== التثبيت وخدمة العمل بلا إنترنت ===== */
let dip=null;
addEventListener("beforeinstallprompt",e=>{e.preventDefault();dip=e;$("install").hidden=false});
$("install").onclick=async()=>{if(!dip)return;dip.prompt();await dip.userChoice;dip=null;$("install").hidden=true};
if("serviceWorker" in navigator) addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));

/* ===== الورد اليومي والتذكير ===== */
let lastAct=0, pend=0, lastSync="";
const W={get(){try{return JSON.parse(localStorage.getItem("hifzWird"))||{}}catch{return{}}},set(v){try{localStorage.setItem("hifzWird",JSON.stringify(v))}catch{}}};
function day(){const s=store.get();s.days=s.days||{};const k=today();s.days[k]=s.days[k]||{ayat:0,secs:0};return [s,s.days[k]]}
const goalDone=(w,d)=>!!w.n&&(w.type==="min"?d.secs>=w.n*60:d.ayat>=w.n);
function toast(m){const t=$("toast");t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,3500)}
function addWird(k,n){
  const [s,d]=day(); d[k]+=n;
  const ks=Object.keys(s.days).sort(); while(ks.length>45) delete s.days[ks.shift()];
  store.set(s); renderWird();
}
function renderWird(){
  const w=W.get(), [s,d]=day();
  if(!w.n){$("wbtn").textContent="🎯 حدّد ورد اليوم";return}
  const done=goalDone(w,d);
  $("wbtn").textContent="🎯 "+(w.type==="min"?`${Math.floor(d.secs/60)}/${w.n} د`:`${d.ayat}/${w.n} آية`)+(done?" ✓":"");
  if(done&&!d.done){d.done=1;store.set(s);toast("ما شاء الله، أتممت ورد اليوم 🌙")}
  const j=JSON.stringify({time:w.time||"",done,day:today(),notified:s.notified||""});
  if(j!==lastSync&&"caches" in window){lastSync=j;caches.open("hifz-data").then(c=>c.put("wird.json",new Response(j))).catch(()=>{})}
}
["input","keydown","click"].forEach(ev=>document.addEventListener(ev,()=>lastAct=Date.now(),true));
setInterval(()=>{ // عدّاد الدقائق: فقط أثناء التدريب الفعلي
  if(!$("stage").hidden&&!document.hidden&&Date.now()-lastAct<30000) pend++;
  if(pend>=10){addWird("secs",pend);pend=0}
},1000);
setInterval(async()=>{ // تذكير أثناء فتح التطبيق
  const w=W.get(); if(!w.time||!("Notification" in window)||Notification.permission!=="granted") return;
  const [s,d]=day(), n=new Date(), [h,m]=w.time.split(":").map(Number);
  if(n.getHours()*60+n.getMinutes()<h*60+m||goalDone(w,d)||s.notified===today()) return;
  s.notified=today(); store.set(s);
  const o={body:"حان وقت وردك اليوم. ابدأ ولو بآية.",icon:"icon-192.png",tag:"wird",lang:"ar",dir:"rtl"};
  try{(await navigator.serviceWorker.ready).showNotification("نُور الحِفظ",o)}catch{try{new Notification("نُور الحِفظ",o)}catch{}}
},30000);
$("wbtn").onclick=()=>{
  const w=W.get(); $("w-type").value=w.type||"ayat"; $("w-n").value=w.n||5; $("w-time").value=w.time||""; $("w-msg").textContent="";
  if($("wird").showModal) $("wird").showModal();
};
$("w-save").onclick=async e=>{
  e.preventDefault();
  const n=Math.min(500,Math.floor(+$("w-n").value)||0);
  if(n<1){$("w-msg").textContent="أدخل مقداراً صحيحاً (1 أو أكثر).";return}
  const w={type:$("w-type").value,n,time:$("w-time").value}; W.set(w); let msg="";
  if(w.time){
    if(!("Notification" in window)) msg="متصفحك لا يدعم الإشعارات.";
    else{
      const p=Notification.permission==="granted"?"granted":await Notification.requestPermission();
      if(p!=="granted") msg="لم تسمح بالإشعارات، فلن يصلك تذكير.";
      else{
        msg="سيصلك التذكير عندما يكون التطبيق مفتوحاً ولو في الخلفية. وعلى أندرويد المثبّت قد يصل أحياناً وهو مغلق.";
        try{const r=await navigator.serviceWorker.ready; if(r.periodicSync) await r.periodicSync.register("hifz-wird",{minInterval:216e5})}catch{}
      }
    }
  }
  lastSync=""; renderWird();
  if(msg) $("w-msg").textContent=msg; else $("wird").close();
};

/* ===== التفسير الميسر ===== */
const TAFSIR_SRC=[
  async n=>(await (await fetch(`https://api.alquran.cloud/v1/surah/${n}/ar.muyassar`)).json()).data.ayahs.map(a=>a.text),
  async n=>{const a=(await (await fetch(`https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/ar-tafsir-muyassar/${n}.json`)).json()).ayahs;const o=[];a.forEach(x=>o[x.ayah-1]=x.text);return o}
];
async function loadTafsir(n){
  let t=null; try{t=JSON.parse(localStorage.getItem("tf"+n))}catch{}
  if(!t) for(const src of TAFSIR_SRC){
    try{ const r=await src(n); if(Array.isArray(r)&&r.length&&r.some(x=>typeof x==="string"&&x.trim())){t=r;try{localStorage.setItem("tf"+n,JSON.stringify(r))}catch{}break} }catch{}
  }
  if(curSurah!==n) return;
  tfs=t||false; showTafsir();
}
function showTafsir(){
  const a=ayahs[idx]; if(!a) return;
  $("tafsir-text").textContent=tfs===null?"جارٍ تحميل التفسير…":tfs===false?"تعذّر تحميل التفسير. يحتاج إنترنت في أول مرة ثم يُحفظ على جهازك.":(tfs[a.no-1]||"لا يتوفر تفسير لهذه الآية.");
}
try{$("tafsir").open=localStorage.getItem("hifzTafsir")!=="0"}catch{$("tafsir").open=true}
$("tafsir").addEventListener("toggle",()=>{try{localStorage.setItem("hifzTafsir",$("tafsir").open?"1":"0")}catch{}});

renderStats(); renderWird(); loadSurahList();
