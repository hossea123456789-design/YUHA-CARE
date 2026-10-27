'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const STORE=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
function env(store=STORE()){
 const win={crypto:crypto.webcrypto,innerWidth:390,innerHeight:844,addEventListener:()=>{}};
 const ctx={window:win,document:{hidden:false,addEventListener:()=>{},getElementById:()=>null},
  navigator:{onLine:true,userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/145 SamsungBrowser/29'},
  location:{origin:'https://hossea123456789-design.github.io'},
  localStorage:store,Uint8Array,Date,Math,JSON,console,Blob,URL,
  setTimeout:()=>1,clearTimeout:()=>{}};
 return {win,ctx,store};
}
function diag(env){
 vm.runInNewContext(fs.readFileSync('mental-diagnostics.js','utf8'),env.ctx);
 return env.win.YuhaMentalDiagnostics;
}
(function testJournal(){
 const a=env(),d=diag(a);
 assert.match(d.getDeviceId(),/^[a-f0-9]{24}$/);
 d.setRole('wife');
 d.emit('ENTRY_LOCAL_WRITE',{date:'2026-10-28',complete:7,memo:'DO_NOT_LOG_THIS',pin:'1234'});
 assert(!JSON.stringify(d.getRecent()).includes('DO_NOT_LOG_THIS'));
 assert(!JSON.stringify(d.getRecent()).includes('"pin"'));
 const b=env(a.store),other=diag(b);
 assert.equal(other.getDeviceId(),d.getDeviceId());
 assert.equal(other.role(),'wife');
 let sent=null;
 a.win.google={script:{run:{withSuccessHandler(fn){return {withFailureHandler(){
  return {reportMentalClientEvents(p){sent=p;fn({ok:true,accepted:p.events.length});}};
 }};}}}};
 d.setBackendSupport(true);d.flush('PRIVATE_PIN');
 assert(sent&&sent.events.length);
 assert(!JSON.stringify(sent.events).includes('PRIVATE_PIN'));
 assert(d.getRecent().every(x=>x.sent===true));
 console.log('PASS: private metadata-only journal, browser ID persistence, device role, upload ACK');
})();
function mental(env){
 let src=fs.readFileSync('mental.js','utf8');
 const marker='window.YuhaMental={render,lock,activate';
 assert(src.includes(marker));
 src=src.replace(marker,'window.__test={normalize,localIsRicher,mergeCloudMonth,syncNext,setRecords:x=>records=x,getRecords:()=>records,setPending:x=>pending=x,getPending:()=>pending,setSession:()=>{cloudReady=true;cloudCode="1234";unlocked=true;cloudEpoch=1;cloudSaving=false},protected:()=>[...locallyProtectedDates]};'+marker);
 env.win.YuhaMentalDiagnostics={emit:()=>{},metadata:()=>({requestId:'test'}),flush:()=>{},setBackendSupport:()=>{}};
 vm.runInNewContext(src,env.ctx,{filename:'mental.js'});
 return env.win.__test;
}
function record(date){
 return {date,scores:{energy:7,control:6,capacity:6,tolerance:6,rest:5,selfAction:7,self:8},
  memo:'private memo',offDutyMinutes:0,offDutyType:[],basicNeedsDelayed:[],
  contexts:[],husbandLetter:'',husbandLetterStatus:'',husbandLetterOpenedAt:'',revision:''};
}
function rpc(env,save,read){
 env.win.google={script:{run:{withSuccessHandler(fn){return {withFailureHandler(fail){
  return {syncMentalEntry(p){try{fn(save(p))}catch(e){fail(e)}},
  getMentalMonth(){try{fn(read())}catch(e){fail(e)}}};
 }};}}}};
}
(function testMerge(){
 const date='2026-10-22',e=env(),t=mental(e),local=record(date);
 const empty={...record(date),scores:Object.fromEntries(Object.keys(local.scores).map(k=>[k,null])),memo:''};
 t.setRecords({[date]:local});t.mergeCloudMonth({[date]:empty});
 assert.equal(t.getRecords()[date].scores.energy,7);
 assert(t.protected().includes(date));
 console.log('PASS: richer local records survive empty server reads');
})();
(function testReadbackMismatch(){
 const date='2026-10-22',e=env(),t=mental(e),data=t.normalize(date,record(date));
 t.setRecords({[date]:data});t.setPending({[date]:{entry:data,expectedRevision:'',letterOnly:false,letterAction:''}});
 t.setSession();
 rpc(e,()=>({ok:true,revision:'first'}),()=>({ok:true,records:{[date]:{...data,revision:'other'}}}));
 t.syncNext();
 assert(t.getPending()[date],'Server mismatch must preserve pending');
 console.log('PASS: wrong readback revision cannot acknowledge pending write');
})();
(function testLetterAck(){
 const date='2026-10-22',e=env(),t=mental(e);
 const data=t.normalize(date,{...record(date),husbandLetter:'hello',husbandLetterStatus:'sealed'});
 const remote=t.normalize(date,{...data,scores:Object.fromEntries(Object.keys(data.scores).map(k=>[k,null])),memo:''});
 t.setRecords({[date]:data});
 t.setPending({[date]:{entry:data,expectedRevision:'',letterOnly:true,letterAction:'seal'}});
 t.setSession();
 rpc(e,()=>({ok:true,revision:'latest'}),()=>({ok:true,records:{[date]:{...remote,revision:'latest'}}}));
 t.syncNext();
 assert.equal(t.getRecords()[date].scores.energy,7);
 assert.equal(Object.keys(t.getPending()).length,0);
 console.log('PASS: verified letter ACK preserves local-only recovery scores');
})();
