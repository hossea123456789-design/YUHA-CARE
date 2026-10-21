/* YUHA CARE — Wife Mental Recovery Heatmap v1
 * Explicit self-report, not a medical diagnostic instrument.
 * Local-first data is PRIVATE TO THIS BROWSER but NOT encrypted.
 * Cross-device sync is opt-in with a separate Apps Script Script Properties secret.
 * No personal record or password is embedded in the public GitHub repository. */
(function(){
"use strict";
const STORE="yuha_mental_recovery_local_v1";
const PENDING="yuha_mental_recovery_pending_v1";
const META="yuha_mental_recovery_meta_v1";
const SYNC_SESSION="yuha_mental_sync_session_v1";
// Session-only sync credential: never publish it or persist it to localStorage.
function readSyncSession(){
 try{return sessionStorage.getItem(SYNC_SESSION)||"";}catch(_){return "";}
}
function rememberSyncSession(secret){
 try{sessionStorage.setItem(SYNC_SESSION,secret);}catch(_){/* private browsing may block storage */}
}
function forgetSyncSession(){
 try{sessionStorage.removeItem(SYNC_SESSION);}catch(_){}
}
const FIELDS=[
 {id:"energy",name:"신체 에너지",short:"에너지",question:"오늘 몸에 사용할 수 있는 에너지가 얼마나 남아 있었나요?",low:"완전 방전",high:"여유가 충분함"},
 {id:"control",name:"삶의 통제감",short:"통제감",question:"오늘 내 다음 행동을 내가 결정할 수 있었나요?",low:"선택권이 없음",high:"내가 선택함"},
 {id:"capacity",name:"육아 감당 여력",short:"육아여력",question:"오늘 육아 역할을 감당할 심리적 여유가 있었나요?",low:"너무 벅참",high:"감당할 여유"},
 {id:"tolerance",name:"돌발상황 인내력",short:"인내력",question:"예상 밖 상황을 얼마나 여유 있게 넘길 수 있었나요?",low:"작은 일도 버거움",high:"차분히 대응"},
 {id:"rest",name:"죄책감 없는 휴식",short:"휴식",question:"쉬는 동안 마음까지 편하게 쉴 수 있었나요?",low:"쉬어도 불편함",high:"편안히 쉼"},
 {id:"selfAction",name:"나를 위한 실제 행동",short:"나를 위한 행동",question:"의무가 아닌, 내가 원한 행동을 실제로 했나요?",low:"하지 못함",high:"충분히 했음"},
 {id:"self",name:"나다운 감각",short:"나다운 감각",question:"오늘 역할을 떠나 그냥 나답게 존재하는 느낌이 있었나요?",low:"내가 없는 느낌",high:"충분히 나다움"}
];
const CORE=["control","rest","self"];
const CHOICES=[{v:2,l:"매우 힘듦"},{v:4,l:"힘듦"},{v:5.5,l:"보통"},{v:7,l:"괜찮음"},{v:9,l:"좋음"}];
const CONTEXT_GROUPS=[
 ["개인시간",[["no_personal_time","없음"],["personal_under30","30분 미만"],["personal_30to60","30분~1시간"],["personal_60to120","1~2시간"],["personal_120to240","2~4시간"],["personal_over240","4시간 이상"]]],
 ["육아",[["care_normal","평이"],["care_hard","강도 높음"],["sleep_resistance","잠투정"],["meal_stress","식사 스트레스"],["outing_tired","외출 피로"],["behavior_issues","행동 문제"],["night_wakings","야간 각성"]]],
 ["가족·분담",[["husband_on_time","남편 정시퇴근"],["husband_overtime","남편 야근"],["husband_late_overtime","매우 늦은 야근"],["husband_available","육아 참여 가능"],["husband_unavailable","육아 참여 어려움"],["husband_exhausted","남편도 피곤함"],["maternal_help","친정 도움"],["no_maternal_help","친정 도움 없음"],["inlaw_schedule","시부모 일정"],["family_contact","가족 연락"],["family_event","가족행사"]]],
 ["몸·직장",[["sleep_deprived","수면 부족"],["meal_skipped","식사 부족"],["hungry","배고픔"],["physical_discomfort","신체 불편"],["period","생리"],["illness","몸살·질병"],["work_stress","직장 스트레스"],["work_overtime","업무 야근"]]]
];
const TYPES=[["home","집에서 혼자"],["shopping","쇼핑"],["cafe","카페"],["nap","낮잠"],["friends_family","만남"],["exercise","운동"],["hobby","취미"],["nothing","아무것도 안 함"]];
const NEEDS=[["toilet","화장실"],["meal","식사"],["water","물"],["shower","세안·샤워"],["hygiene","개인위생"],["sleep","수면"]];
const E=val=>String(val??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const iso=(date)=>date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
const at=(str)=>{const [y,m,d]=str.split("-").map(Number);return new Date(y,m-1,d,12)};
const shift=(str,n)=>{const d=at(str);d.setDate(d.getDate()+n);return iso(d)};
const daysIn=(y,m)=>new Date(y,m,0).getDate();
const monthKey=d=>d.slice(0,7);
const nice=v=>Number.isInteger(v)?String(v):Number(v).toFixed(1);
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const fixed=(n,places=1)=>typeof n==="number"&&Number.isFinite(n)?n.toFixed(places):"—";
const empty=date=>({date,scores:Object.fromEntries(FIELDS.map(x=>[x.id,null])),offDutyMinutes:0,offDutyType:[],basicNeedsDelayed:[],contexts:[],memo:"",revision:""});
const validScore=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=10;
function normalize(date,item){
 const x=empty(date),a=item&&typeof item==="object"?item:{};
 FIELDS.forEach(f=>{const n=a.scores?.[f.id];x.scores[f.id]=validScore(n)?Math.round(n*2)/2:null});
 x.offDutyMinutes=Number.isFinite(Number(a.offDutyMinutes))?Math.max(0,Math.min(1440,Math.round(Number(a.offDutyMinutes)))):0;
 for(const key of ["offDutyType","basicNeedsDelayed","contexts"])x[key]=Array.isArray(a[key])?[...new Set(a[key].filter(v=>typeof v==="string"))].slice(0,40):[];
 x.memo=String(a.memo||"").slice(0,600);
 x.revision=String(a.revision||"");
 return x;
}
function scoresOf(entry){
 if(!entry)return null;
 const nums=FIELDS.map(f=>entry.scores?.[f.id]);
 if(nums.some(x=>!validScore(x)))return null;
 const m=mean(nums);
 const recovery=entry.scores.control*.3+entry.scores.rest*.25+entry.scores.self*.25+
   entry.scores.energy*.1+entry.scores.tolerance*.1;
 return {mental:m,recovery,core:mean(CORE.map(k=>entry.scores[k])),by:entry.scores,score100:m*10};
}
function level(value){
 if(!validScore(value))return "empty";
 return value<3?"critical":value<4.5?"low":value<6?"watch":value<7.5?"stable":"good";
}
function levelName(v){
 return ({empty:"미기록",critical:"많이 소모됨",low:"소진",watch:"회복 필요",stable:"회복 중·안정",good:"양호"})[level(v)];
}
let records={};let pending={};let viewing=iso(new Date()),selected=viewing;
let month=viewing.slice(0,7),cloudCode="",cloudBusy=false,cloudReady=false,cloudError="",cloudSaving=false;
let syncingTimer=null, retryTimer=null,mutating=false,storageOkay=true,contextsOpen=false,cloudOpen=false;
let conflict=null,screen=null,unlocked=false,unlockBusy=false;
let pinFailures=0,pinBlockedUntil=0,cloudEpoch=0;
const loadedMentalMonths=new Set(),loadingMentalMonths=new Set(); // per-page throttling; not cryptographic brute-force protection.
const PIN_HASH="d387d8f016a1e8dd471de17fd837ce101676156ab7d2ec1e395a67d46f3472b0";
function sha256Fallback(bytes) {
 // Deterministic SHA-256 for WebViews without SubtleCrypto (PIN is only a UI lock).
 const k=[
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
 ];
 const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
 const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 const b=Array.from(bytes),bitLength=b.length*8;
 b.push(0x80);while(b.length%64!==56)b.push(0);
 for(let i=7;i>=0;i--)b.push(Math.floor(bitLength/Math.pow(2,i*8))&255);
 const w=new Uint32Array(64);
 for(let off=0;off<b.length;off+=64){
  for(let i=0;i<16;i++){const j=off+i*4;w[i]=((b[j]<<24)|(b[j+1]<<16)|(b[j+2]<<8)|b[j+3])>>>0;}
  for(let i=16;i<64;i++){
   const x=w[i-15],y=w[i-2],s0=rotr(x,7)^rotr(x,18)^(x>>>3),s1=rotr(y,17)^rotr(y,19)^(y>>>10);
   w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
  }
  let [a,b0,c,d,e,f,g,hh]=h;
  for(let i=0;i<64;i++){
   const s1=rotr(e,6)^rotr(e,11)^rotr(e,25),choose=(e&f)^(~e&g);
   const t1=(hh+s1+choose+k[i]+w[i])>>>0,s0=rotr(a,2)^rotr(a,13)^rotr(a,22);
   const t2=(s0+((a&b0)^(a&c)^(b0&c)))>>>0;
   hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b0;b0=a;a=(t1+t2)>>>0;
  }
  [a,b0,c,d,e,f,g,hh].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
 }
 return h.map(x=>x.toString(16).padStart(8,"0")).join("");
}
async function sha256(value){
 // The lock accepts ASCII digits only; avoid TextEncoder and SubtleCrypto compatibility requirements.
 const bytes=Uint8Array.from(String(value),ch=>ch.charCodeAt(0));
 if(typeof crypto!=="undefined"&&crypto&&crypto.subtle&&typeof crypto.subtle.digest==="function"){
  try{
   const hash=await crypto.subtle.digest("SHA-256",bytes);
   return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
  }catch(error){console.warn("[YUHA MENTAL] Native PIN digest unavailable; using local fallback");}
 }
 return sha256Fallback(bytes);
}
function lock(){
  cloudEpoch++;
  loadedMentalMonths.clear();loadingMentalMonths.clear();
  if(unlocked&&Object.keys(pending).length)saveLocal();
  unlocked=false;
  cloudCode="";cloudReady=false;cloudBusy=false;cloudSaving=false;cloudError="";
  clearTimeout(syncingTimer);clearTimeout(retryTimer);
  records={};pending={};conflict=null;
  if(screen)screen.replaceChildren();
}
function lockMarkup(){
 const keys=["1","2","3","4","5","6","7","8","9","지우기","0","⌫"];
 return '<div class="mental-root mental-locked">'+
   '<section class="sleep-card mental-lock-card">'+
     '<div class="mental-lock-icon" aria-hidden="true">✳</div>'+
     '<h2>아내 회복 · 비공개 기록</h2>'+
     '<p>숫자 4자리를 입력하면 자동으로 잠금이 해제됩니다.</p>'+
     '<form id="mentalUnlockForm" autocomplete="off">'+
       '<label for="mentalPinInput">잠금 비밀번호</label>'+
       '<input id="mentalPinInput" class="mental-pin-readout" type="password" inputmode="none" maxlength="4" autocomplete="off" readonly aria-label="입력된 비밀번호" placeholder="••••">'+
       '<div class="mental-pin-keypad" role="group" aria-label="숫자 비밀번호 입력 패드">'+
       keys.map(key=>'<button type="button" class="mental-pin-key'+(key==="지우기"||key==="⌫"?" mental-pin-edit":"")+
         '" data-mental-pin="'+(key==="지우기"?"clear":key==="⌫"?"back":key)+'" aria-label="'+(key==="⌫"?"마지막 숫자 지우기":key)+'">'+key+'</button>').join("")+
       '</div>'+
       '<span class="mental-lock-error" id="mentalLockError" role="alert" aria-live="polite"></span>'+
     '</form>'+
     '<div class="mental-lock-foot">다른 탭으로 이동하면 다시 잠깁니다. 4자리 잠금은 화면 열람용이며 기기 내 기록은 암호화되지 않습니다.</div>'+
   '</section></div>';
}
function bindLock(){
 const form=screen.querySelector("#mentalUnlockForm"),input=screen.querySelector("#mentalPinInput"),
   error=screen.querySelector("#mentalLockError");
 if(!form||!input)return;
 let digits="";
 const display=()=>{input.value=digits;input.setAttribute("aria-label","비밀번호 "+digits.length+"/4자리 입력");};
 const verify=async()=>{
  if(unlockBusy||digits.length!==4)return;
  if(Date.now()<pinBlockedUntil){
   error.textContent="잠시 후 다시 입력해 주세요.";digits="";display();return;
  }
  unlockBusy=true;
  try{
   const hash=await sha256(digits);
   if(hash!==PIN_HASH){
    pinFailures++;
    if(pinFailures>=5){pinBlockedUntil=Date.now()+30000;pinFailures=0;}
    error.textContent=pinBlockedUntil>Date.now()?"입력이 여러 번 틀렸습니다. 30초 후 다시 시도해 주세요.":"비밀번호가 다릅니다.";
    digits="";display();return;
   }
   pinFailures=0;pinBlockedUntil=0;
   unlocked=true;
   hydrate();
   render();
   // Restore an already authorized server sync after PIN unlock.
   const remembered=readSyncSession();
   if(remembered)activate(remembered);
  }catch(err){
   unlocked=false;
   console.error("[YUHA MENTAL] Unlock failed:",err);
   error.textContent="잠금 해제 중 문제가 발생했습니다. 새로고침 후 다시 시도해 주세요.";
   digits="";display();
  }finally{unlockBusy=false;}
 };
 const action=key=>{
  if(unlockBusy)return;
  if(Date.now()<pinBlockedUntil){error.textContent="잠시 후 다시 입력해 주세요.";return;}
  if(key==="clear")digits="";
  else if(key==="back")digits=digits.slice(0,-1);
  else if(/^[0-9]$/.test(key)&&digits.length<4)digits+=key;
  error.textContent="";
  display();
  if(digits.length===4)void verify();
 };
 form.querySelectorAll("[data-mental-pin]").forEach(button=>
  button.addEventListener("click",()=>action(button.dataset.mentalPin)));
 form.addEventListener("submit",e=>{e.preventDefault();void verify();});
 input.addEventListener("keydown",e=>{
  if(/^[0-9]$/.test(e.key)){e.preventDefault();action(e.key);}
  else if(e.key==="Backspace"){e.preventDefault();action("back");}
  else if(e.key==="Escape"){e.preventDefault();action("clear");}
 });
 try{input.focus({preventScroll:true});}catch(_){input.focus();}
}

function storageRead(key,def){
 try{const obj=JSON.parse(localStorage.getItem(key)||"null");return obj&&typeof obj==="object"?obj:def}catch{return def}
}
function saveLocal(){
 try{
  localStorage.setItem(STORE,JSON.stringify(records));
  localStorage.setItem(PENDING,JSON.stringify(pending));
  storageOkay=true;return true;
 }catch(e){storageOkay=false;console.error("[YUHA MENTAL] Local persistence failed",e);return false}
}
function hydrate(){
 const all=storageRead(STORE,{});
 for(const [date,item] of Object.entries(all))if(/^20\d{2}-\d{2}-\d{2}$/.test(date))records[date]=normalize(date,item);
 const p=storageRead(PENDING,{});
 for(const [date,item] of Object.entries(p))if(records[date]&&item&&typeof item==="object"){
   pending[date]={expectedRevision:String(item.expectedRevision||""),entry:normalize(date,item.entry||records[date])};
 }
}
function entry(date){return records[date]||empty(date)}
function list(start,end){
 return Object.entries(records).filter(([date])=>date>=start&&date<=end)
   .map(([date,v])=>({date,row:v,metric:scoresOf(v)})).sort((a,b)=>a.date.localeCompare(b.date));
}
function changes(date,fn){
 const obj=normalize(date,entry(date));fn(obj);
 records[date]=obj;
 pending[date]={entry:normalize(date,obj),expectedRevision:obj.revision||""};
 if(!saveLocal())setState("기기 저장 실패 · 저장 공간을 확인해 주세요",true);
 else setState(cloudReady?"기기 저장 완료 · 비공개 동기화 대기":"이 기기에 저장됨");
 scheduleCloud();
 if(screen&&unlocked)refreshOverview();
}
function status(text,error){
 const el=document.getElementById("mentalStatus");if(!el)return;
 el.textContent=text;el.dataset.error=error?"true":"false";
}
function setState(text,error=false){cloudError=error?text:"";status(text,error)}
function stateText(){return !storageOkay?"기기 저장 실패 · 저장 공간 확인":cloudBusy?"비공개 서버 연결 중":cloudSaving?"비공개 동기화 중":
 cloudError||(!cloudCode?"서버 동기화 미연결 · 기기에만 저장 중":cloudReady?"비공개 동기화 연결됨":"비공개 서버 미연결");}
function progress(state,msg){
 if(typeof window.showAppProgress==="function")window.showAppProgress("mental-save",msg,state);
}
function cloudCall(method,args,onSuccess,onFail){
 if(!window.google?.script?.run){onFail(new Error("서버 연결을 기다리는 중입니다."));return;}
 try{window.google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onFail)[method](...args)}catch(e){onFail(e)}
}
function activate(pass){
 const epoch=++cloudEpoch;
 loadedMentalMonths.clear();loadingMentalMonths.clear();
 cloudCode=pass;
 cloudBusy=true;cloudReady=false;cloudError="";
 setState("비공개 서버 연결 중");
 progress("busy","비공개 회복 기록 조회 중");
 const keys=[month,monthKey(shift(month+"-01",-1))];
 let outstanding=[...new Set(keys)].length,anyFailed=false;
 [...new Set(keys)].forEach(k=>{
  const [y,m]=k.split("-").map(Number);
  cloudCall("getMentalMonth",[cloudCode,y,m],result=>{
   if(epoch!==cloudEpoch || !unlocked)return;
   if(!result?.ok){failed(new Error("조회 실패"));return;}
   for(const [date,value] of Object.entries(result.records||{})){
     if(!pending[date])records[date]=normalize(date,value);
     else if(pending[date].expectedRevision===""&&value.revision)conflict={date,local:entry(date),server:normalize(date,value)};
   }
   loadedMentalMonths.add(k);
   saveLocal();
   if(--outstanding===0&&!anyFailed){
     cloudBusy=false;cloudReady=true;cloudError="";
     rememberSyncSession(cloudCode);
     progress("done","비공개 기록 연결 완료");setState(stateText());
     render();scheduleCloud(100);
   }
  },failed);
 });
 function failed(err){if(anyFailed||epoch!==cloudEpoch||!unlocked)return;anyFailed=true;cloudBusy=false;cloudReady=false;
   const reason=String(err?.message||err);
   if(/접근 암호가 올바르지|동기화가 아직 설정되지 않았습니다/.test(reason))forgetSyncSession();
   progress("error","비공개 기록 연결 실패");setState("연결 실패: "+reason,true);render();}
}
// Load navigated months without overwriting unsynced records.
function fetchMentalMonthIfNeeded(k){
 if(!cloudReady||!cloudCode||!unlocked||loadedMentalMonths.has(k)||loadingMentalMonths.has(k))return;
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(k))return;
 const epoch=cloudEpoch;
 loadingMentalMonths.add(k);
 const [year,monthNumber]=k.split("-").map(Number);
 cloudCall("getMentalMonth",[cloudCode,year,monthNumber],result=>{
  loadingMentalMonths.delete(k);
  if(epoch!==cloudEpoch||!unlocked||!cloudReady)return;
  if(!result?.ok){setState("회복 기록의 "+k+"월 조회 실패 · 기기 기록 보관",true);return;}
  for(const [date,value] of Object.entries(result.records||{})){
   if(!pending[date])records[date]=normalize(date,value);
   else if(pending[date].expectedRevision===""&&value.revision)
    conflict={date,local:entry(date),server:normalize(date,value)};
  }
  loadedMentalMonths.add(k);
  saveLocal();cloudError="";
  render();scheduleCloud(100);
 },error=>{
  loadingMentalMonths.delete(k);
  if(epoch!==cloudEpoch||!unlocked)return;
  setState("회복 기록의 "+k+"월 조회 실패 · 기기 기록 보관: "+String(error?.message||error),true);
 });
}
function loadVisibleMentalMonths(){
 if(!cloudReady||!unlocked)return;
 const needed=new Set([month,monthKey(shift(month+"-01",-1)),
  monthKey(shift(selected,-6)),monthKey(shift(selected,6))]);
 needed.forEach(fetchMentalMonthIfNeeded);
}
function scheduleCloud(delay=1800){
 clearTimeout(syncingTimer);
 if(!cloudReady||!cloudCode||!Object.keys(pending).length||cloudBusy||cloudSaving)return;
 syncingTimer=setTimeout(syncNext,delay);
}
function syncNext(){
 if(!cloudReady||!cloudCode||cloudSaving)return;
 const date=Object.keys(pending).sort()[0];
 if(!date)return;
 if(conflict?.date===date){setState("다른 기기 수정 충돌 · 선택 필요",true);return;}
 const p=pending[date],version=JSON.stringify(p.entry);
 cloudSaving=true;setState("비공개 서버에 저장 중");progress("busy","회복 기록 저장 중");
 const epoch=cloudEpoch;
 cloudCall("syncMentalEntry",[{passphrase:cloudCode,entry:p.entry,expectedRevision:p.expectedRevision}],result=>{
  if(epoch!==cloudEpoch||!unlocked)return;
  cloudSaving=false;
  if(result?.conflict){
    conflict={date,local:normalize(date,p.entry),server:normalize(date,result.serverEntry||{}),
      revision:String(result.serverRevision||"")};
    progress("error","다른 기기 기록과 충돌");setState("기록 충돌 · 비교 후 선택해 주세요",true);render();return;
  }
  if(!result?.ok){
    progress("error","서버 응답 확인 필요");setState(result?.message||"다시 시도합니다",true);
    retryTimer=setTimeout(syncNext,5000);return;
  }
  if(pending[date]&&JSON.stringify(pending[date].entry)===version){
    records[date].revision=String(result.revision||"");
    delete pending[date];
  }else if(pending[date]){
    pending[date].expectedRevision=String(result.revision||"");
    pending[date].entry.revision=String(result.revision||"");
  }
  saveLocal();progress("done","회복 기록 저장 완료");setState(stateText());
  scheduleCloud(250);if(screen)updateIndicators();
 },err=>{if(epoch!==cloudEpoch||!unlocked)return;
   cloudSaving=false;progress("error","회복 기록 저장 실패");
   setState("서버 오류 · 기기 기록 보관: "+String(err?.message||err),true);
   retryTimer=setTimeout(syncNext,10000);
 });
}
window.addEventListener("online",()=>{if(cloudReady)scheduleCloud(300);});
window.addEventListener("pagehide",saveLocal);
function trend(end=iso(new Date())){
 const weekStart=shift(end,-6),prevStart=shift(end,-13),prevEnd=shift(end,-7);
 const cur=list(weekStart,end).filter(x=>x.metric),prior=list(prevStart,prevEnd).filter(x=>x.metric);
 const currAvg=mean(cur.map(x=>x.metric.mental)),oldAvg=mean(prior.map(x=>x.metric.mental));
 const delta=cur.length>=4&&prior.length>=4?currAvg-oldAvg:null;
 return {cur,prior,currAvg,oldAvg,delta};
}
const avgKey=(list,key)=>mean(list.map(x=>x.row.scores[key]).filter(validScore));
function warningPatterns(end=iso(new Date())){
 const out=[],today=entry(end),curr=scoresOf(today),arr=[];
 for(let i=0;i<14;i++){const date=shift(end,-i);arr.push({date,entry:records[date]||null,metric:scoresOf(records[date])});}
 const contiguous=(n,condition)=>arr.slice(0,n).length===n&&arr.slice(0,n).every(x=>x.metric&&condition(x));
 const recent=arr.slice(0,5);
 if(recent.every(x=>x.metric)&&recent.slice(0,4).filter((x,i)=>x.metric.mental<recent[i+1].metric.mental).length>=4)
  out.push({kind:"watch",title:"최근 점수가 계속 낮아졌습니다",detail:"일정이나 분담 중 줄일 수 있는 부담이 있는지 함께 살펴보세요."});
 if(contiguous(4,x=>x.entry.scores.control<=3))
  out.push({kind:"watch",title:"내 시간을 선택하기 어려운 날이 이어집니다",detail:"짧더라도 스스로 정할 수 있는 개인시간을 확보하는 방향을 검토해 보세요."});
 if(contiguous(5,x=>x.entry.scores.energy<=3))
  out.push({kind:"watch",title:"신체 에너지 부족이 이어집니다",detail:"활동을 늘리기보다 수면·식사·휴식 확보를 우선 검토해 보세요."});
 if(contiguous(7,x=>x.entry.scores.self<=3&&x.entry.scores.selfAction<=3))
  out.push({kind:"watch",title:"나를 위한 시간이 거의 없었던 한 주입니다",detail:"생산적인 행동이 아니라 원하는 것을 고를 수 있는 시간을 마련해 보세요."});
 if(today.offDutyMinutes>=120&&validScore(today.scores.rest)&&today.scores.rest<=3)
  out.push({kind:"note",title:"쉬는 시간과 실제 쉼이 달랐던 날",detail:"개인시간은 있었지만 마음까지 편하게 쉬었는지 살펴볼 만합니다."});
 if(curr&&today.basicNeedsDelayed.length>=3&&curr.mental<=4)
  out.push({kind:"watch",title:"기본적인 돌봄이 밀린 날",detail:"식사·수분·위생·수면 중 무엇을 대신 맡거나 줄일 수 있을지 검토해 보세요."});
 const t=trend(end);
 if(t.delta!==null&&t.delta>=.3)
  out.push({kind:"good",title:"이번 주 평균 점수가 나아졌습니다",detail:"지난주보다 "+fixed(t.delta)+"점 높습니다. 어떤 환경 변화가 있었는지 기록을 함께 보세요."});
 for(const key of ["control","rest","self","tolerance"]){
  if(t.cur.length>=4&&t.prior.length>=4){
   const a=avgKey(t.cur,key),b=avgKey(t.prior,key);
   if(a!==null&&b!==null&&a-b>=.6)out.push({kind:"good",title:FIELDS.find(x=>x.id===key).name+"의 회복 신호",detail:"지난주보다 "+fixed(a-b)+"점 높습니다."});
  }
 }
 const actions=t.cur.filter(x=>x.row.scores.selfAction>=4).length;
 if(t.cur.length>=4&&actions>=2)out.push({kind:"good",title:"나를 위한 행동이 실제로 이어졌습니다",detail:"최근 7일 중 "+actions+"일에 4점 이상으로 기록됐습니다."});
 return out.slice(0,5);
}
function recoveryAssessment(end=iso(new Date())){
 const t=trend(end);
 if(t.cur.length<4||t.prior.length<4)return null;
 let count=0,signals=[];
 const rise=(key,label)=>{const a=avgKey(t.cur,key),b=avgKey(t.prior,key);
   if(a!==null&&b!==null&&a>b){count++;signals.push(label)};};
 if(t.delta!==null&&t.delta>0){count++;signals.push("전체 평균 상승")}
 rise("control","통제감 상승");rise("rest","휴식 상승");rise("self","나다움 상승");rise("tolerance","인내력 상승");
 if(t.cur.filter(x=>x.row.scores.selfAction>=4).length>=2){count++;signals.push("나를 위한 행동")}
 const n=x=>mean(x.map(v=>v.row.basicNeedsDelayed.length));
 if(n(t.cur)<n(t.prior)){count++;signals.push("기본욕구 미룸 감소")}
 const baseReady=count>=3;
 const okWeek=xs=>xs.length>=4&&mean(xs.map(x=>x.metric.mental))>=5.5&&
   ["control","rest","self","tolerance"].every(k=>avgKey(xs,k)>=5)&&
   xs.filter(x=>x.row.scores.selfAction>=4).length>=2&&
   mean(xs.map(x=>x.row.basicNeedsDelayed.length))<=1;
 // 2 weeks meeting criteria; not a "recovery complete" label.
 return {count,signals,baseReady,sustained:okWeek(t.cur)&&okWeek(t.prior)};
}
function weekDays(date){
 const d=at(date),weekday=(d.getDay()+6)%7;d.setDate(d.getDate()-weekday);
 return Array.from({length:7},(_,i)=>iso(new Date(d.getFullYear(),d.getMonth(),d.getDate()+i,12)));
}
function heatStyle(value){return "mental-"+level(value)}
function monthlyHeat(){
 const [y,m]=month.split("-").map(Number),first=(new Date(y,m-1,1).getDay()+6)%7;
 let html='<div class="sleep-heat-grid mental-month-grid">'+
  ["월","화","수","목","금","토","일"].map(x=>'<span class="sleep-heat-dow">'+x+'</span>').join("");
 for(let i=0;i<first;i++)html+='<span class="sleep-heat-blank"></span>';
 for(let day=1;day<=daysIn(y,m);day++){
  const date=month+"-"+String(day).padStart(2,"0"),score=scoresOf(records[date]),v=score?.mental??null;
  html+='<button class="sleep-heat-square mental-day '+heatStyle(v)+(date===selected?' selected':'')+
   (date===iso(new Date())?' today':'')+'" type="button" data-mental-date="'+date+'" aria-label="'+
   day+'일 '+(v===null?'미기록':fixed(v)+'점')+'">'+
   '<span class="sleep-heat-day">'+day+'</span><span class="sleep-heat-score">'+
   (v===null?'—':Math.round(v*10))+'</span></button>';
 }
 return html+"</div>";
}
function weeklyMatrix(){
 const d=weekDays(selected);
 let s='<div class="mental-matrix-wrap"><div class="mental-matrix" role="table" aria-label="이번 주 지표별 히트맵">';
 s+='<div class="mental-matrix-caption">지표</div>';
 d.forEach(date=>s+='<div class="mental-matrix-day '+(date===selected?'is-selected':'')+'">'+
  ['일','월','화','수','목','금','토'][at(date).getDay()]+'<small>'+Number(date.slice(-2))+'</small></div>');
 const rows=[...FIELDS,{id:"total",name:"총점",short:"총점"}];
 rows.forEach(f=>{
  s+='<div class="mental-matrix-label" title="'+E(f.name)+'">'+E(f.short)+'</div>';
  d.forEach(date=>{
   const metric=scoresOf(records[date]);
   const value=f.id==="total"?(metric?.mental??null):(validScore(records[date]?.scores?.[f.id])?records[date].scores[f.id]:null);
   s+='<button type="button" class="mental-matrix-cell '+heatStyle(value)+(date===selected?' is-selected':'')+
     '" data-mental-date="'+date+'" aria-label="'+E(f.name)+' '+date+' '+(value===null?'미기록':fixed(value)+'점')+'">'+
     (value===null?'·':fixed(value))+'</button>';
  });
 });
 return s+"</div></div>";
}
function sparkline(title,source,color){
 const dims={w:360,h:78,pad:12};const width=dims.w,height=dims.h;
 const arr=Array.from({length:daysIn(Number(month.slice(0,4)),Number(month.slice(5,7)))},(_,i)=>{
  const date=month+"-"+String(i+1).padStart(2,"0"),row=records[date],value=source(row);
  return value===null?null:{i,v:value};
 });
 const plotted=arr.filter(Boolean);if(plotted.length<2)return '<div class="mental-graph"><div class="mental-graph-title">'+title+'</div><p class="mental-chart-empty">기록 2일 이상부터 변화선을 표시합니다.</p></div>';
 const x=i=>dims.pad+i*(width-2*dims.pad)/Math.max(1,arr.length-1);
 const y=v=>height-dims.pad-(Math.max(0,Math.min(10,v))/10)*(height-2*dims.pad);
 // Connect only adjacent recorded calendar days, not across missing days.
 let segments=[],seg=[];
 arr.forEach(p=>{if(p){seg.push(p)}else{if(seg.length>1)segments.push(seg);seg=[];}});
 if(seg.length>1)segments.push(seg);
 const paths=segments.map(pts=>'<polyline points="'+pts.map(p=>x(p.i).toFixed(1)+','+y(p.v).toFixed(1)).join(' ')+
  '" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>').join('');
 const dots=plotted.map(p=>'<circle cx="'+x(p.i).toFixed(1)+'" cy="'+y(p.v).toFixed(1)+'" r="2.3" fill="'+color+'"/>').join('');
 return '<div class="mental-graph"><div class="mental-graph-title">'+title+'</div>'+
  '<svg viewBox="0 0 360 78" role="img" aria-label="'+title+' 월간 변화 그래프" preserveAspectRatio="none">'+
  '<path d="M12 12H348 M12 39H348 M12 66H348" stroke="#e7efec" stroke-dasharray="3 3" fill="none"/>'+
  paths+dots+'</svg></div>';
}
function summary(end=iso(new Date())){
 const t=trend(end),assessment=recoveryAssessment(end);
 const today=scoresOf(records[end]);const rows=t.cur;
 const recent14=list(shift(end,-13),end).filter(x=>x.metric);
 const metrics=FIELDS.map(f=>({...f,avg:avgKey(rows,f.id)}));
 const best=metrics.filter(v=>v.avg!==null).sort((a,b)=>b.avg-a.avg)[0];
 const lowest=metrics.filter(v=>v.avg!==null).sort((a,b)=>a.avg-b.avg)[0];
 const offDuty=rows.reduce((a,x)=>a+x.row.offDutyMinutes,0);
 const delayed=rows.filter(x=>x.row.basicNeedsDelayed.length>0).length;
 const bestDay=[...rows].sort((a,b)=>b.metric.mental-a.metric.mental)[0];
 let startEffect=null;
 // Descriptive, next-day average among adequate off-duty days vs non-off-duty days.
 const exposed=[],controls=[];
 for(let i=13;i>=1;i--){
  const date=shift(end,-i),next=shift(date,1);
  const row=records[date],target=scoresOf(records[next]);
  if(!row||!target)continue;
  if(row.offDutyMinutes>=120)exposed.push(target.mental);
  else if(row.offDutyMinutes===0)controls.push(target.mental);
 }
 if(exposed.length>=3&&controls.length>=3)startEffect=mean(exposed)-mean(controls);
 return {t,assessment,today,metrics,best,lowest,offDuty,delayed,bestDay,
  average14:recent14.length>=7?mean(recent14.map(x=>x.metric.mental)):null,
  needDelayAvg:rows.length?mean(rows.map(x=>x.row.basicNeedsDelayed.length)):null,
  startEffect,exposed:exposed.length,controls:controls.length};
}
function scoreCard(name,val,detail){
 return '<div class="mental-score-card"><span>'+E(name)+'</span><strong>'+ (val===null?'—':fixed(val))+
 '</strong><small>'+E(detail)+'</small></div>';
}
function mainSummary(){
 const s=summary(),day=s.today;
 return '<div class="mental-top-cards">'+
  scoreCard("오늘 상태",day?.mental??null,day?levelName(day.mental):"미기록")+
  scoreCard("가중 회복",day?.recovery??null,"통제감·휴식·나다움 중심")+
  scoreCard("7일 평균",s.t.currAvg,s.t.cur.length+'일 기록')+
  scoreCard("지난주 대비",s.t.delta,s.t.delta===null?"각 주 4일 이상 필요":(s.t.delta>0?"상승":s.t.delta<0?"하락":"동일"))+
  '</div>'+
  '<div class="mental-core-cards">'+CORE.map(k=>{
    const f=FIELDS.find(x=>x.id===k),v=avgKey(s.t.cur,k);
    return '<div class="mental-core"><span>'+E(f.short)+'</span><strong>'+fixed(v)+'</strong><small>7일 평균</small></div>';
  }).join('')+'</div>';
}
function insightHTML(){
 const s=summary();
 const patterns=warningPatterns();
 const a=s.assessment;
 const week=s.t.cur.length>=4?'<div class="mental-week-card">'+
  '<div class="mental-week-head"><strong>이번 주 돌아보기</strong><span>'+s.t.cur.length+'일 기록</span></div>'+
  '<div class="mental-week-grid"><span>7일 평균</span><strong>'+fixed(s.t.currAvg)+'/10</strong>'+
  '<span>14일 평균</span><strong>'+fixed(s.average14)+'/10</strong>'+
  '<span>기본욕구 미룸 평균</span><strong>'+fixed(s.needDelayAvg)+'개/기록일</strong>'+
  '<span>개인시간</span><strong>'+Math.floor(s.offDuty/60)+'시간 '+s.offDuty%60+'분</strong>'+
  '<span>기본욕구를 미룬 날</span><strong>'+s.delayed+'일</strong>'+
  '<span>가장 여유가 있었던 날</span><strong>'+(s.bestDay?.date.slice(5)||'—')+'</strong>'+
  '<span>상대적으로 높은 지표</span><strong>'+(s.best?E(s.best.short)+' '+fixed(s.best.avg):'—')+'</strong>'+
  '<span>낮게 기록된 지표</span><strong>'+(s.lowest?E(s.lowest.short)+' '+fixed(s.lowest.avg):'—')+'</strong></div></div>':
  '<p class="mental-muted">주간 요약은 최근 7일 중 4일 이상 기록되면 표시합니다. 기록하지 않은 날은 감점하지 않습니다.</p>';
 let html=week;
 if(a)html+='<p class="mental-assessment">'+
  (a.sustained?'최근 2주간 여러 지표가 비교적 안정적인 편입니다.':
    a.baseReady?'회복 방향의 변화를 살펴볼 수 있습니다.':'최근 2주 기록으로 변화 방향을 관찰하고 있습니다.')+
  ' <span>변화 신호 '+a.count+'/7개</span></p>';
 if(patterns.length)html+='<div class="mental-insights">'+patterns.map(p=>
  '<div class="mental-insight '+p.kind+'"><strong>'+E(p.title)+'</strong><p>'+E(p.detail)+'</p></div>').join('')+'</div>';
 else html+='<p class="mental-muted">현재 표시할 추세 신호가 없습니다. 여러 날의 기록이 쌓이면 변화 방향을 함께 살펴볼 수 있습니다.</p>';
 if(s.startEffect!==null)html+='<div class="mental-effect">개인시간이 2시간 이상 있었던 날의 다음 날 점수는 개인시간이 없었던 날에 비해 평균 <b>'+
  (s.startEffect>0?'+':'')+fixed(s.startEffect)+'</b>점 차이였습니다. (각 '+s.exposed+'일/'+s.controls+'일)'+
  '<small>기록 간 단순 비교로, 개인시간이 차이의 원인임을 뜻하지 않습니다.</small></div>';
 return html;
}
function dateEditor(){
 const d=selected,r=entry(d),metric=scoresOf(r),complete=FIELDS.filter(x=>validScore(r.scores[x.id])).length;
 let h='<div class="mental-editor-head"><div><h3>'+Number(d.slice(5,7))+'월 '+Number(d.slice(-2))+'일 기록</h3>'+
   '<p>본인이 느낀 상태를 기록해 주세요. 아기를 사랑하는 정도나 역할 수행 능력의 평가가 아닙니다. 같은 점수를 다시 누르면 선택이 취소됩니다.</p></div>'+
   '<strong class="mental-editor-score">'+(metric?fixed(metric.mental):complete+'/7')+'</strong></div>';
 h+='<div class="mental-score-list">';
 for(const f of FIELDS){
   const v=r.scores[f.id];
   h+='<div class="mental-score-row" data-score-row="'+f.id+'">'+
    '<div class="mental-score-title"><strong>'+E(f.name)+'</strong><output data-score-val="'+f.id+'">'+
      (v===null?'미입력':nice(v)+'점')+'</output></div>'+
    '<p>'+E(f.question)+'</p><div class="mental-choice-row" role="group" aria-label="'+E(f.name)+'">'+
    CHOICES.map(q=>'<button type="button" class="mental-choice'+(v===q.v?' active':'')+'" data-mental-score="'+f.id+'" data-value="'+q.v+'" aria-pressed="'+(v===q.v?'true':'false')+'">'+q.l+'</button>').join('')+
    '</div><div class="mental-fine-row"><span>'+E(f.low)+'</span><div class="mental-fine-actions">'+
    '<button type="button" data-mental-adjust="'+f.id+'" data-step="-0.5" aria-label="'+E(f.short)+' 0.5점 감소">−</button>'+
    '<span>0–10점</span>'+
    '<button type="button" data-mental-adjust="'+f.id+'" data-step="0.5" aria-label="'+E(f.short)+' 0.5점 증가">+</button>'+
    '</div><span>'+E(f.high)+'</span></div></div>';
 }
 h+='</div><details class="mental-context-details" '+(contextsOpen?'open':'')+' id="mentalContextDetails"><summary>오늘의 상황 · 선택 입력 <span>개인시간·가족지원·기본욕구·메모</span></summary>'+
   '<div class="mental-context-inner">'+
   '<label class="mental-minute-label">의무 없이 사용한 개인시간 <span><input type="number" inputmode="numeric" min="0" max="1440" step="10" id="mentalOffDuty" value="'+r.offDutyMinutes+'"/>분</span></label>'+
   '<p class="mental-muted">분 단위 기록은 선택사항입니다. 시간과 휴식의 질은 따로 평가합니다.</p>'+
   '<div class="mental-tags-group"><h4>개인시간 유형</h4>'+tags(TYPES,r.offDutyType,"type")+'</div>'+
   '<div class="mental-tags-group"><h4>육아 때문에 미룬 기본욕구</h4>'+tags(NEEDS,r.basicNeedsDelayed,"need")+'</div>'+
   CONTEXT_GROUPS.map(([group,options])=>'<div class="mental-tags-group"><h4>'+E(group)+'</h4>'+tags(options,r.contexts,"context")+'</div>').join('')+
   '<label class="mental-memo-label">오늘의 메모 <textarea maxlength="600" rows="2" id="mentalMemo" placeholder="자유롭게 기록하고 싶을 때만 작성해 주세요.">'+E(r.memo)+'</textarea></label>'+
   '</div></details>';
 h+='<div class="mental-local-note"><span class="mental-save-state" id="mentalStatus">'+E(stateText())+'</span>'+
   '<span>'+complete+'/7개 항목 입력 · '+(pending[d]?'변경 보관 중':'기록 저장됨')+'</span></div>';
 return h;
}
function tags(arr,values,kind){
 return '<div class="mental-tags">'+arr.map(([id,label])=>
  '<button type="button" class="mental-tag'+(values.includes(id)?' chosen':'')+'" data-mental-tag="'+kind+'" data-tag-id="'+E(id)+'" aria-pressed="'+values.includes(id)+'">'+E(label)+'</button>').join('')+'</div>';
}
function cloudPanel(){
 return '<details class="mental-cloud-details" '+(cloudOpen?'open':'')+' id="mentalCloudDetails"><summary>'+
  '<span>기록 저장과 개인정보</span><small>'+(!cloudReady?'기기에 저장됨':'비공개 서버 연결됨')+'</small></summary>'+
  '<div class="mental-cloud-inner"><p>정서·가족관계 기록은 민감한 개인 정보입니다. 이 기기 저장소는 암호화되어 있지 않으며 이 브라우저를 사용할 수 있는 사람에게 보일 수 있습니다. 공유할지 여부는 기록하는 본인이 결정해 주세요.</p>'+
  '<p>Apps Script에 최신 Code.gs를 배포했다면 Script Properties의 별도 비공개 접근 암호(12자 이상)를 입력해 연결하세요. 이 암호는 화면 잠금용 4자리 PIN과 다릅니다. 인증에 성공하면 현재 브라우저 탭에서는 PIN을 다시 풀 때 자동 재연결됩니다.</p>'+
  (cloudReady?'<button type="button" id="mentalCloudDisconnect">비공개 연결 끊기</button>':
  '<div class="mental-cloud-connect"><input type="password" id="mentalCloudPass" autocomplete="off" minlength="12" placeholder="비공개 접근 암호 (12자 이상)" aria-label="비공개 기록 접근 암호"/>'+
  '<button type="button" id="mentalCloudConnect">연결</button></div>')+
  '<p class="mental-cloud-small">연결이 끊겨도 이 기기의 미동기화 기록은 남습니다. 다른 사람이 기기를 사용하는 경우 브라우저 사이트 데이터와 접근 권한을 별도로 관리해 주세요.</p>'+
  '</div></details>';
}
function view(){
 const [y,m]=month.split("-").map(Number),s=summary();
 const warning=s.t.delta===null?"이번 주와 지난주에 각각 4일 이상 기록되면 비교합니다.":
 (s.t.delta>=0?"지난주보다 "+fixed(s.t.delta)+"점 높습니다.":"지난주보다 "+fixed(Math.abs(s.t.delta))+"점 낮습니다.");
 return '<div class="mental-root"><div class="panel-head"><div><h2 class="panel-title">아내 회복</h2>'+
  '<span class="count">Wife Mental Recovery · 개인 기록</span></div></div>'+
  '<div class="mental-intro"><strong>삶의 여유가 돌아오고 있는지 살펴봅니다.</strong>'+
  '<p>본인이 직접 느낀 회복 상태를 기록하는 공간입니다. 점수로 사람을 평가하거나 심리질환을 진단하지 않습니다.</p></div>'+
  (!cloudReady&&!cloudBusy?'<div class="mental-actions-row"><button type="button" class="mental-primary-action" id="mentalConnectJump">기록 동기화 연결</button><span>서버에 연결하기 전까지는 이 기기에만 저장됩니다.</span></div>':'')+
  mainSummary()+
  '<div class="mental-actions-row"><a href="#mentalToday" class="mental-primary-action" id="mentalJumpToday">오늘 기록</a>'+
  '<span>'+E(warning)+'</span></div>'+
  '<section class="sleep-card mental-month-card"><div class="mental-section-head"><h3>'+y+'년 '+m+'월 · 상태 히트맵</h3>'+
    '<div class="sleep-map-nav"><button type="button" data-month-step="-1" aria-label="이전 달">‹</button>'+
    '<button type="button" data-month-step="0" class="sleep-go-today">오늘</button>'+
    '<button type="button" data-month-step="1" aria-label="다음 달">›</button></div></div>'+
  monthlyHeat()+
  '<div class="mental-legend">'+[["critical","0~2.9"],["low","3~4.4"],["watch","4.5~5.9"],["stable","6~7.4"],["good","7.5~10"],["empty","미기록"]].map(([l,t])=>
    '<span><i class="mental-legend-dot mental-'+l+'"></i>'+t+'</span>').join('')+'</div>'+
  '<p class="mental-muted">빈 날은 감점하지 않습니다. 달력 중앙 숫자는 100점 환산 점수입니다.</p></section>'+
  '<section class="sleep-card mental-matrix-card"><div class="mental-section-head"><h3>지표별 주간 히트맵</h3>'+
   '<div class="sleep-map-nav"><button type="button" data-week-step="-1" aria-label="이전 주">‹</button>'+
   '<button type="button" data-week-step="0" class="sleep-go-today">이번 주</button>'+
   '<button type="button" data-week-step="1" aria-label="다음 주">›</button></div></div>'+
   weeklyMatrix()+'<p class="mental-muted">각 칸을 누르면 해당 날짜를 입력하거나 상세 기록을 확인할 수 있습니다.</p></section>'+
  '<section class="sleep-card mental-insight-card"><h3>회복 방향과 주간 요약</h3>'+insightHTML()+'</section>'+
  '<section class="sleep-card mental-chart-card"><h3>월간 변화</h3>'+
    sparkline("멘탈 점수",r=>scoresOf(r)?.mental??null,"#527cae")+
    sparkline("회복 핵심 · 통제감/휴식/나다움",r=>scoresOf(r)?.core??null,"#358b78")+
    '<div class="mental-two-line">'+sparkline("신체 에너지",r=>validScore(r?.scores?.energy)?r.scores.energy:null,"#bc8260")+
    sparkline("전체 멘탈",r=>scoresOf(r)?.mental??null,"#527cae")+'</div>'+
   '<p class="mental-muted">그래프는 기록된 날짜만 표시하고 미기록일을 0으로 연결하지 않습니다.</p></section>'+
  '<section class="sleep-card mental-input-card" id="mentalToday">'+dateEditor()+'</section>'+
  cloudPanel()+
  '<p class="mental-footer">이 점수는 개인 baseline과 장기 변화 관찰을 위한 참고값입니다. 낮은 점수가 모성애나 양육 능력을 뜻하지 않습니다. 지속적인 어려움이 있다면 의료·상담 전문가의 도움을 고려할 수 있습니다.</p>'+
  '</div>';
}
function render(){
 screen=document.getElementById("main");
 if(!screen)return;
 if(!unlocked){screen.innerHTML=lockMarkup();bindLock();return;}
 screen.innerHTML=view();
 bind();
 loadVisibleMentalMonths();
}
function refreshOverview(){
 if(!screen||!unlocked)return;
 // Update computed elements without recreating the seven input rows.
 const temp=document.createElement("div");temp.innerHTML=mainSummary();
 for(const name of ["mental-top-cards","mental-core-cards"]){
  const replacement=temp.querySelector("."+name),existing=screen.querySelector("."+name);
  if(existing&&replacement)existing.replaceWith(replacement);
 }
 const score=scoresOf(entry(selected));
 const monthDay=screen.querySelector('.mental-month-grid [data-mental-date="'+selected+'"]');
 if(monthDay){
  const val=score?.mental??null;
  monthDay.className="sleep-heat-square mental-day mental-"+level(val)+
    (selected===iso(new Date())?" today":"")+" selected";
  monthDay.querySelector(".sleep-heat-score").textContent=val===null?"—":Math.round(val*10);
  monthDay.setAttribute("aria-label",selected+" "+(val===null?"미기록":fixed(val)+"점"));
 }
 const weekday=weekDays(selected);
 if(weekday.includes(selected)){
  const metric=scoresOf(entry(selected));
  const cells=[...screen.querySelectorAll('.mental-matrix-cell[data-mental-date="'+selected+'"]')];
  cells.forEach((cell,i)=>{
    const f=FIELDS[i],v=i===7?(metric?.mental??null):
      validScore(entry(selected).scores[f?.id])?entry(selected).scores[f.id]:null;
    cell.className="mental-matrix-cell mental-"+level(v)+" is-selected";
    cell.textContent=v===null?"·":fixed(v);
  });
 }
 const replaceBody=(selector,html)=>{
  const el=screen.querySelector(selector);
  if(el)el.innerHTML=html;
 };
 replaceBody(".mental-insight-card",'<h3>회복 방향과 주간 요약</h3>'+insightHTML());
 replaceBody(".mental-chart-card",'<h3>월간 변화</h3>'+
   sparkline("멘탈 점수",r=>scoresOf(r)?.mental??null,"#527cae")+
   sparkline("회복 핵심 · 통제감/휴식/나다움",r=>scoresOf(r)?.core??null,"#358b78")+
   '<div class="mental-two-line">'+sparkline("신체 에너지",r=>validScore(r?.scores?.energy)?r.scores.energy:null,"#bc8260")+
   sparkline("전체 멘탈",r=>scoresOf(r)?.mental??null,"#527cae")+'</div>'+
   '<p class="mental-muted">미기록일을 0으로 연결하지 않습니다.</p>');
}
function refreshScores(){
 const row=entry(selected);
 FIELDS.forEach(f=>{
   const container=screen.querySelector('[data-score-row="'+f.id+'"]');if(!container)return;
   const val=row.scores[f.id];
   container.querySelector('[data-score-val="'+f.id+'"]').textContent=val===null?"미입력":nice(val)+"점";
   container.querySelectorAll("[data-mental-score]").forEach(btn=>{
     btn.classList.toggle("active",val===Number(btn.dataset.value));
     btn.setAttribute("aria-pressed",String(val===Number(btn.dataset.value)));
   });
 });
 const completed=FIELDS.filter(f=>validScore(row.scores[f.id])).length;
 const metric=scoresOf(row);
 screen.querySelector(".mental-editor-score").textContent=metric?fixed(metric.mental):completed+"/7";
 screen.querySelector(".mental-local-note>span:last-child").textContent=completed+"/7개 항목 입력 · "+(pending[selected]?"변경 보관 중":"기록 저장됨");
 refreshOverview();
 status(stateText(),!storageOkay);
}
function setSelected(d){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(d))return;
 selected=d;month=monthKey(d);render();
 const header=document.getElementById("mentalToday");
 if(header)header.scrollIntoView({block:"start",behavior:"smooth"});
}
function bind(){
 screen.querySelectorAll("[data-month-step]").forEach(b=>b.addEventListener("click",()=>{
  const step=Number(b.dataset.monthStep);
  if(step===0){selected=iso(new Date());month=monthKey(selected)}
  else{const [y,m]=month.split("-").map(Number),t=new Date(y,m-1+step,1);month=iso(t).slice(0,7);selected=month+"-01";}
  render();
 }));
 screen.querySelectorAll("[data-week-step]").forEach(b=>b.addEventListener("click",()=>{
  const step=Number(b.dataset.weekStep);
  if(step===0)selected=iso(new Date());
  else selected=shift(selected,7*step);
  month=monthKey(selected);render();
 }));
 screen.querySelectorAll("[data-mental-date]").forEach(b=>b.addEventListener("click",()=>setSelected(b.dataset.mentalDate)));
 screen.querySelectorAll("[data-mental-score]").forEach(b=>b.addEventListener("click",()=>{
  const field=b.dataset.mentalScore,val=Number(b.dataset.value);
  changes(selected,item=>{item.scores[field]=item.scores[field]===val?null:val;});
  refreshScores();
 }));
 screen.querySelectorAll("[data-mental-adjust]").forEach(b=>b.addEventListener("click",()=>{
  const k=b.dataset.mentalAdjust,delta=Number(b.dataset.step);
  changes(selected,item=>{const v=item.scores[k];item.scores[k]=Math.max(0,Math.min(10,(v===null?5:v)+delta))});
  refreshScores();
 }));
 screen.querySelectorAll("[data-mental-tag]").forEach(b=>b.addEventListener("click",()=>{
  const type=b.dataset.mentalTag,key=b.dataset.tagId;
  const target={type:"offDutyType",need:"basicNeedsDelayed",context:"contexts"}[type];
  if(!target)return;
  changes(selected,item=>{
    if(item[target].includes(key))item[target]=item[target].filter(x=>x!==key);
    else{
      if(type==="context"&&(key.startsWith("personal_")||key==="no_personal_time"))
        item[target]=item[target].filter(x=>!x.startsWith("personal_")&&x!=="no_personal_time");
      item[target].push(key);
    }
  });
  b.classList.toggle("chosen");b.setAttribute("aria-pressed",String(b.classList.contains("chosen")));
 }));
 const minutes=screen.querySelector("#mentalOffDuty");
 if(minutes){minutes.addEventListener("change",()=>{
  changes(selected,r=>{r.offDutyMinutes=Math.max(0,Math.min(1440,Math.round(Number(minutes.value)||0)))});
  minutes.value=entry(selected).offDutyMinutes;
 });}
 const memo=screen.querySelector("#mentalMemo");
 if(memo){let timer=null;memo.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>{
    changes(selected,r=>{r.memo=memo.value.slice(0,600)});
  },350);});memo.addEventListener("blur",()=>{clearTimeout(timer);
   if(entry(selected).memo!==memo.value)changes(selected,r=>{r.memo=memo.value.slice(0,600)});
  });}
 const contexts=screen.querySelector("#mentalContextDetails");
 if(contexts)contexts.addEventListener("toggle",()=>{contextsOpen=contexts.open});
 const cloud=screen.querySelector("#mentalCloudDetails");
 if(cloud)cloud.addEventListener("toggle",()=>{cloudOpen=cloud.open});
 screen.querySelector("#mentalConnectJump")?.addEventListener("click",()=>{
  if(!cloud)return;
  cloud.open=true;
  cloudOpen=true;
  cloud.scrollIntoView({behavior:"smooth",block:"start"});
 });
 screen.querySelector("#mentalCloudConnect")?.addEventListener("click",()=>{
  const code=screen.querySelector("#mentalCloudPass")?.value||"";
  if(code.length<12){setState("비공개 접근 암호는 12자 이상이어야 합니다.",true);return;}
  activate(code);screen.querySelector("#mentalCloudPass").value="";
 });
 screen.querySelector("#mentalCloudDisconnect")?.addEventListener("click",()=>{
  cloudEpoch++;cloudCode="";cloudReady=false;loadedMentalMonths.clear();loadingMentalMonths.clear();forgetSyncSession();clearTimeout(syncingTimer);clearTimeout(retryTimer);
  setState("이 기기에만 저장 중");render();
 });
 screen.querySelector("#mentalJumpToday")?.addEventListener("click",event=>{
  event.preventDefault();
  selected=iso(new Date());month=monthKey(selected);render();
  document.getElementById("mentalToday")?.scrollIntoView({behavior:"smooth",block:"start"});
 });
 updateIndicators();
}
function updateIndicators(){
 if(!screen)return;
 status(stateText(),Boolean(cloudError)||!storageOkay);
 const saveCount=screen.querySelector(".mental-local-note>span:last-child");
 if(saveCount&&screen.querySelector(".mental-editor-score")){
  const completed=FIELDS.filter(f=>validScore(entry(selected).scores[f.id])).length;
  saveCount.textContent=completed+"/7개 항목 입력 · "+(pending[selected]?"변경 보관 중":"기록 저장됨");
 }
}
window.YuhaMental={render,lock,activate,metric:scoresOf,trend,level,fields:FIELDS,
 /* testing helpers have no write privileges beyond local test data */ _preview:{normalize,scoresOf,summary,warningPatterns,weekDays}};
})();