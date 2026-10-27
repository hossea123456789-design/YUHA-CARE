/* YUHA CARE — privacy-minimized, device-scoped diagnostics.
   NO scores, memo text, letters, PIN, cookies or full User-Agent in audit data. */
(function(){
'use strict';
const KEY='yuha_mental_diagnostic_events_v1';
const DEVICE='yuha_mental_diagnostic_device_v1';
const ROLE='yuha_mental_diagnostic_role_v1';
const VERSION='20261028-trace1';
const ROLES=['wife','husband','shared','unassigned'];
function get(k, fallback){try{return localStorage.getItem(k)||fallback;}catch(_){return fallback;}}
function put(k,v){try{localStorage.setItem(k,v);return true;}catch(_){return false;}}
function uid(){
 const a=new Uint8Array(12);
 if(!window.crypto?.getRandomValues)return 'unavailable';
 window.crypto.getRandomValues(a);
 return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
}
let deviceId=get(DEVICE,'');
if(!/^[a-f0-9]{24}$/.test(deviceId)){deviceId=uid();if(deviceId!=='unavailable')put(DEVICE,deviceId);}
function role(){const r=get(ROLE,'unassigned');return ROLES.includes(r)?r:'unassigned';}
function environment(){
 const ua=navigator.userAgent||'';
 const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Other';
 const browser=/SamsungBrowser/i.test(ua)?'Samsung Internet':/Edg\//i.test(ua)?'Edge':/CriOS|Chrome\//i.test(ua)?'Chrome':/Firefox|FxiOS/i.test(ua)?'Firefox':/Safari/i.test(ua)?'Safari':'Other';
 const webview=/\bwv\b|; wv\)|KAKAOTALK|NAVER\(/i.test(ua)?'in-app':'browser';
 return {os,browser,webview,viewport:String(window.innerWidth||0)+'x'+String(window.innerHeight||0),
   origin:location.origin,online:navigator.onLine!==false};
}
const permitted=['date','month','requestId','revision','serverRevision','count','localCount','serverCount','complete','serverComplete','pendingCount','memoLength','letterLength','reason','result','phase','code','storageOk','mismatched','schema','line'];
function metadata(){return {deviceId,role:role(),version:VERSION,...environment(),requestId:uid()};}
function load(){
 try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(v=>v&&typeof v==='object').slice(-500):[];}catch(_){return [];}
}
let entries=load(),lastMemo={};let writing=false,flushBusy=false,supported=false;
function persist(){if(writing)return false;writing=true;try{return put(KEY,JSON.stringify(entries.slice(-500)));}finally{writing=false;}}
function emit(type,data={}){
 if(!/^[A-Z][A-Z0-9_]{1,39}$/.test(String(type)))return;
 if(type==='MEMO_LOCAL_WRITE'){
   const k=String(data.date||'');const n=Date.now();
   if(lastMemo[k]&&n-lastMemo[k]<3500)return;
   lastMemo[k]=n;
 }
 const values={};
 for(const k of permitted){
   if(data[k]!==undefined && data[k]!==null){
     const v=data[k];
     if(typeof v==='boolean'||typeof v==='number')values[k]=v;
     else if(typeof v==='string')values[k]=v.slice(0,90);
   }
 }
 entries.push({id:uid(),time:new Date().toISOString(),type,deviceId,role:role(),...values});
 entries=entries.slice(-500);
 if(!persist())console.warn('[YUHA MENTAL DIAG] Diagnostic local storage unavailable');
}
function setRole(next){
 if(!ROLES.includes(next))return false;
 const ok=put(ROLE,next);
 emit('DEVICE_ROLE_SET',{reason:next,storageOk:ok});
 return ok;
}
function setBackendSupport(value){supported=value===true;}
function flush(passphrase,onDone){
 if(!supported||flushBusy||!passphrase||!window.google?.script?.run)return;
 const batch=entries.filter(x=>!x.sent).slice(0,35).map(({sent,...x})=>x);
 if(!batch.length){onDone?.();return;}
 flushBusy=true;
 try{
 window.google.script.run.withSuccessHandler(result=>{
   flushBusy=false;
   if(result?.ok){
     const ids=new Set(batch.map(x=>x.id));
     entries.forEach(x=>{if(ids.has(x.id))x.sent=true;});
     persist();
     onDone?.();
     if(entries.some(x=>!x.sent))setTimeout(()=>flush(passphrase,onDone),1200);
   }
 }).withFailureHandler(()=>{flushBusy=false;})['reportMentalClientEvents']({passphrase,device:metadata(),events:batch});
 }catch(_){flushBusy=false;}
}
function getServer(passphrase,onSuccess,onFailure){
 if(!supported){onFailure?.(new Error('서버 진단 API 배포가 필요합니다.'));return;}
 window.google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onFailure)['getMentalAuditLog'](passphrase,70);
}
function exportLocal(){
 const obj={kind:'yuha-mental-diagnostics',createdAt:new Date().toISOString(),device:metadata(),events:entries};
 const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
 const a=document.createElement('a'),url=URL.createObjectURL(blob);
 a.href=url;a.download='yuha-mental-diagnostic-'+new Date().toISOString().slice(0,10)+'.json';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
// Capture connection transitions and script failures without message bodies or URL parameters.
let lastStatus='',lastStatusAt=0;
window.addEventListener('yuha-db-status',event=>{
 const state=String(event?.detail?.state||'').slice(0,30);
 if(!/^(connected|connecting|error|offline)$/.test(state))return;
 const now=Date.now();
 if(state===lastStatus&&now-lastStatusAt<15000)return;
 lastStatus=state;lastStatusAt=now;
 emit('BRIDGE_STATUS',{reason:state});
});
window.addEventListener('error',event=>{
 const file=String(event.filename||'').split('?')[0].split('/').pop();
 emit('BROWSER_SCRIPT_ERROR',{code:String(event.error?.name||'Error').slice(0,28),
  reason:/^[a-z0-9_.-]{1,55}$/i.test(file)?file:'unknown',line:Number(event.lineno)||0});
});
document.addEventListener('visibilitychange',()=>{
 emit(document.hidden?'APP_BACKGROUND':'APP_FOREGROUND',{pendingCount:entries.filter(x=>!x.sent).length});
});
window.addEventListener('offline',()=>emit('NETWORK_OFFLINE',{reason:'navigator_offline'}));
window.addEventListener('online',()=>emit('NETWORK_ONLINE',{reason:'navigator_online'}));
emit('APP_SCRIPT_LOADED',{code:VERSION});
window.YuhaMentalDiagnostics={emit,metadata,flush,getServer,setBackendSupport,exportLocal,setRole,role,getRecent:()=>entries.slice(-50),getDeviceId:()=>deviceId,isSupported:()=>supported};
})();