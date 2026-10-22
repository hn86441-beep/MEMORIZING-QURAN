const $ = id => document.getElementById(id);
const API = "https://api.alquran.cloud/v1/surah/";
// بيانات احتياطية تعمل بدون إنترنت
const FALLBACK = {112:["قُلْ هُوَ ٱللَّهُ أَحَدٌ","ٱللَّهُ ٱلصَّمَدُ","لَمْ يَلِدْ وَلَمْ يُولَدْ","وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ"]};
// توحيد الإملاء: الرسم العثماني (الصلوٰة) يُقبل بالإملاء المعتاد (الصلاة)
const norm = s => s.replace(/و[\u064B-\u065F]*\u0670/g,"ا").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g,"")
  .replace(/[أإآٱ]/g,"ا").replace(/ا/g,"").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/ؤ/g,"و").replace(/ئ/g,"ي").replace(/\s+/g," ").trim();

const tokens=t=>t.split(" ").reduce((o,w)=>{if(norm(w)===""&&o.length)o[o.length-1]+=" "+w;else o.push(w);return o},[]); // علامات الوقف تُلحق بالكلمة السابقة
let locked=false, ayahs=[], idx=0, wi=0, words=[], look=false, errors=0, typed=0, surahName="";
const store = {
  get(){try{return JSON.parse(localStorage.getItem("hifz"))||{}}catch{return{}}},
  set(v){try{localStorage.setItem("hifz",JSON.stringify(v))}catch{}}
};

function renderStats(){
  const s=store.get();
  $("st-streak").textContent=s.streak||0; $("st-words").textContent=s.words||0;
  $("st-acc").textContent=(s.words+s.errors)>0?Math.round(100*s.words/(s.words+s.errors))+"%":"—";
}
function today(){return new Date().toISOString().slice(0,10)}
function bump(key,n=1){
  const s=store.get(); s[key]=(s[key]||0)+n;
  if(key==="words"&&s.last!==today()){
    const y=new Date(Date.now()-864e5).toISOString().slice(0,10);
    s.streak=s.last===y?(s.streak||0)+1:1; s.last=today();
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
    if(n!==1){const w=list[0].split(" ");if(norm(w.slice(0,4).join(" "))===norm("بسم الله الرحمن الرحيم"))list[0]=w.slice(4).join(" ")}
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
  $("start").disabled=false; idx=0; errors=0; typed=0;
  $("empty").hidden=$("done").hidden=true; $("stage").hidden=false; loadAyah(); loadQuran();
}
function loadAyah(){
  const a=ayahs[idx]; words=tokens(a.text); wi=0;
  $("ayah-no").textContent=`${surahName} — الآية ${a.no}`; $("prog").textContent=`${idx+1} / ${ayahs.length}`;
  $("bar").style.width=(idx/ayahs.length*100)+"%";
  $("stage").classList.toggle("look",look);
  $("ayah").innerHTML=words.map((w,i)=>`<span class="w" data-i="${i}">${w}</span>`).join("");
  locked=false; if(!cont)stop(); $("similar").hidden=true; mark(); $("typer").value=""; $("typer").focus();
  if($("auto").checked&&!cont) play();
}
function mark(){document.querySelectorAll(".w").forEach(e=>e.classList.toggle("cur",+e.dataset.i===wi))}
function accept(skip=false){
  $("similar").hidden=true;
  const e=document.querySelector(`.w[data-i="${wi}"]`); e.classList.remove("hint"); e.classList.add(skip?"skip":"lit");
  if(!skip){bump("words");typed++} wi++; $("typer").value="";
  if(wi>=words.length) return finishAyah(); mark();
}
function finishAyah(){
  $("ayah").insertAdjacentHTML("beforeend",`<span class="end">﴿${ayahs[idx].no}﴾</span>`);
  locked=true; if(!cont)stop(); idx++; $("bar").style.width=(idx/ayahs.length*100)+"%";
  setTimeout(()=>idx>=ayahs.length?finish():loadAyah(),900);
}
function finish(){
  stop();
  $("stage").hidden=true; $("done").hidden=false;
  $("summary").textContent=`كتبت ${typed} كلمة بـ ${errors} محاولة خاطئة.`;
}
$("typer").addEventListener("input",e=>{
  const el=e.target, v=norm(el.value), target=norm(words[wi]);
  el.classList.remove("bad","good");
  if(!v) return;
  if(v===target){el.classList.add("good");accept();return}
  if(v.length>=target.length||!target.startsWith(v)&&v.length>1){
    if(v.length>=target.length){void el.offsetWidth;el.classList.add("bad");errors++;bump("errors");similar(v);el.value=""}
  }
});
$("hint").onclick=()=>{const e=document.querySelector(`.w[data-i="${wi}"]`);e.textContent=(words[wi].match(/^(?:.[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]*){1,3}/u)||[""])[0]+"…";e.classList.add("hint");$("typer").focus()};
$("reveal").onclick=()=>{const e=document.querySelector(`.w[data-i="${wi}"]`);e.textContent=words[wi];accept(true)};
$("restart").onclick=loadAyah;
$("m-memory").onclick=()=>{look=false;$("m-memory").classList.add("on");$("m-look").classList.remove("on");$("stage").classList.remove("look")};
$("m-look").onclick=()=>{look=true;$("m-look").classList.add("on");$("m-memory").classList.remove("on");$("stage").classList.add("look")};
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
$("typer").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.shiftKey){e.preventDefault();audio.paused?play():stop()}});

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
        if(s.number!==1&&i===0){const w=t.split(" "); if(norm(w.slice(0,4).join(" "))===bsm) t=w.slice(4).join(" ")}
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
    hits.sort((a,b)=>(b.nx===typedNorm)-(a.nx===typedNorm));
    const mine=hits[0].nx===typedNorm;
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

renderStats(); loadSurahList();
