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
  $("empty").hidden=$("done").hidden=true; $("stage").hidden=false; loadAyah();
}
function loadAyah(){
  const a=ayahs[idx]; words=tokens(a.text); wi=0;
  $("ayah-no").textContent=`${surahName} — الآية ${a.no}`; $("prog").textContent=`${idx+1} / ${ayahs.length}`;
  $("bar").style.width=(idx/ayahs.length*100)+"%";
  $("stage").classList.toggle("look",look);
  $("ayah").innerHTML=words.map((w,i)=>`<span class="w" data-i="${i}">${w}</span>`).join("");
  locked=false; stop(); mark(); $("typer").value=""; $("typer").focus();
  if($("auto").checked) play();
}
function mark(){document.querySelectorAll(".w").forEach(e=>e.classList.toggle("cur",+e.dataset.i===wi))}
function accept(skip=false){
  const e=document.querySelector(`.w[data-i="${wi}"]`); e.classList.remove("hint"); e.classList.add(skip?"skip":"lit");
  if(!skip){bump("words");typed++} wi++; $("typer").value="";
  if(wi>=words.length) return finishAyah(); mark();
}
function finishAyah(){
  $("ayah").insertAdjacentHTML("beforeend",`<span class="end">﴿${ayahs[idx].no}﴾</span>`);
  locked=true; stop(); idx++; $("bar").style.width=(idx/ayahs.length*100)+"%";
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
    if(v.length>=target.length){void el.offsetWidth;el.classList.add("bad");errors++;bump("errors");el.value=""}
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
["reciter","speed","auto","loop"].forEach(id=>$(id).addEventListener("change",()=>{savePrefs();if(id==="speed")audio.playbackRate=+$("speed").value;if(id==="reciter"&&!audio.paused)play()}));
const audio=new Audio(); audio.preload="auto";
function setPlaying(on){$("audio").classList.toggle("playing",on);$("play").textContent=on?"⏸ إيقاف":"▶ استمع"}
function clearSing(){document.querySelectorAll(".sing").forEach(e=>e.classList.remove("sing"))}
function play(){
  const a=ayahs[idx]; if(!a||!a.num) return;
  audio.src=`https://cdn.islamic.network/quran/audio/128/${$("reciter").value}/${a.num}.mp3`;
  audio.playbackRate=+$("speed").value;
  audio.play().catch(()=>setPlaying(false));
}
function stop(){audio.pause();setPlaying(false);clearSing()}
audio.onplay=()=>setPlaying(true);
audio.onerror=()=>setPlaying(false);
audio.onended=()=>{setPlaying(false);clearSing();if($("loop").checked&&!locked&&!$("stage").hidden)setTimeout(()=>{if(!locked)play()},700)};
// إضاءة تقريبية للكلمات مع التلاوة (بحسب طول الكلمة)
audio.ontimeupdate=()=>{
  if(!audio.duration||!words.length) return;
  const L=words.map(w=>norm(w).length+1), T=L.reduce((x,y)=>x+y);
  let p=audio.currentTime/audio.duration*T, i=0;
  while(i<L.length-1&&p>=L[i]){p-=L[i];i++}
  document.querySelectorAll(".w").forEach((e,k)=>e.classList.toggle("sing",k===i));
};
$("play").onclick=()=>{audio.paused?play():stop();$("typer").focus()};
$("typer").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.shiftKey){e.preventDefault();audio.paused?play():stop()}});

renderStats(); loadSurahList();
