'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const STORE=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
function env(store=STORE()){
 const win={crypto:crypto.webcrypto,innerWidth:390,innerHeight:844,addEventListener:()=>{},confirm:()=>true};
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
 src=src.replace(marker,'window.__test={normalize,localIsRicher,mergeCloudMonth,syncNext,registerConflict,differingFields,resolveConflict,hydrate,conflicts,conflictChoices,setArchiveSupport:v=>conflictArchiveSupported=v,setReactionSupport:v=>reactionBackendSupported=v,setSelectedDate:d=>selected=d,changes,husbandLetterHTML,syncSafetyHTML,setRecords:x=>records=x,getRecords:()=>records,setPending:x=>pending=x,getPending:()=>pending,setSession:()=>{cloudReady=true;cloudCode="1234";unlocked=true;cloudEpoch=1;cloudSaving=false;letterBackendSupported=true;conflictArchiveSupported=true},protected:()=>[...locallyProtectedDates]};'+marker);
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

(function testConflictRetainedAndResolved(){
 const date='2026-10-27',e=env(),t=mental(e);
 const original=t.normalize(date,{...record(date),memo:'an unsynced local memo of 165 characters'.padEnd(165,'x')});
 const server=t.normalize(date,{...record(date),memo:'short',revision:'server-v2'});
 t.setRecords({[date]:original});
 t.setPending({[date]:{entry:original,expectedRevision:'server-v1',letterOnly:false,letterAction:''}});
 t.setSession();
 assert.equal(t.registerConflict(date,original,server,'server-v2','revision_mismatch'),true);
 assert(t.conflicts[date]);
 const history=JSON.parse(e.store.getItem('yuha_mental_recovery_conflict_snapshots_v1'));
 assert(history[0].local.memo.length===165&&history[0].server.memo==='short');
 const keys=t.differingFields(original,server).map(x=>x.key);
 assert(keys.includes('memo'));
 for(const key of keys)t.conflictChoices[date]??={},t.conflictChoices[date][key]='local';
 let seen=null;
 rpc(e,(payload)=>{seen=payload;return {ok:true,revision:'server-v3',serverEntry:payload.entry,conflictArchived:true};},
  ()=>({ok:true,records:{[date]:{...seen.entry,revision:'server-v3'}}}));
 t.resolveConflict(date);
 assert(t.getPending()[date].resolution.confirmed);
 assert.equal(t.getPending()[date].entry.memo.length,165);
 t.syncNext();
 assert.equal(Object.keys(t.getPending()).length,0);
 assert.equal(Object.keys(t.conflicts).length,0);
 assert.equal(t.getRecords()[date].memo.length,165);
 assert.equal(seen.resolution.originalLocal.memo.length,165);
 console.log('PASS: user-picked values, two local original snapshots, archived server ACK and readback');
})();
(function testArchiveMissingCannotAck(){
 const date='2026-10-27',e=env(),t=mental(e);
 const original=t.normalize(date,record(date)),server=t.normalize(date,{...record(date),memo:'remote',revision:'v2'});
 t.setRecords({[date]:original});
 t.setPending({[date]:{entry:original,expectedRevision:'v1',letterOnly:false}});
 t.setSession();
 t.registerConflict(date,original,server,'v2','test');
 for(const diff of t.differingFields(original,server)) (t.conflictChoices[date]??={})[diff.key]='local';
 t.resolveConflict(date);
 rpc(e,(p)=>({ok:true,revision:'v3',conflictArchived:false}),()=>({ok:true,records:{[date]:{...p,revision:'v3'}}}));
 t.syncNext();
 assert(t.getPending()[date],'Missing server archive confirmation must not clear pending');
 assert(t.conflicts[date],'Conflict protection persists');
 console.log('PASS: missing private server archive ACK blocks resolution');
})();
(function testConflictAfterFurtherRemoteUpdate(){
 const date='2026-10-27',e=env(),t=mental(e);
 const orig=t.normalize(date,{...record(date),memo:'local revised memo'});
 const server=t.normalize(date,{...record(date),memo:'remote older',revision:'v2'});
 const newer=t.normalize(date,{...record(date),memo:'remote newest',revision:'v4'});
 t.setRecords({[date]:orig});
 t.setPending({[date]:{entry:orig,expectedRevision:'v1',letterOnly:false}});
 t.setSession();
 t.registerConflict(date,orig,server,'v2','initial');
 for(const diff of t.differingFields(orig,server))(t.conflictChoices[date]??={})[diff.key]='local';
 t.resolveConflict(date);
 rpc(e,()=>({ok:true,conflict:true,serverEntry:newer,serverRevision:'v4'}),()=>({ok:true,records:{}}));
 t.syncNext();
 assert.equal(t.conflicts[date].revision,'v4');
 assert.equal(t.getPending()[date].entry.memo,'local revised memo');
 assert.equal(t.getPending()[date].resolution,null);
 console.log('PASS: further server edits reopen comparison and restore original local draft');
})();

(function testRecoveryAfterBrowserRestartAndOldBackend(){
 const date='2026-10-27',first=env(),t=mental(first);
 const local=t.normalize(date,{...record(date),memo:'long device original'});
 const server=t.normalize(date,{...record(date),memo:'server original',revision:'r2'});
 t.setRecords({[date]:local});
 t.setPending({[date]:{entry:local,expectedRevision:'r1',letterOnly:false}});
 t.setSession();
 assert(t.registerConflict(date,local,server,'r2','test'));
 const second=env(first.store),reopened=mental(second);
 reopened.hydrate();reopened.setSession();
 assert.equal(reopened.conflicts[date].server.memo,'server original');
 assert.equal(reopened.getPending()[date].entry.memo,'long device original');
 reopened.setArchiveSupport(false);
 let remoteWrite=false;
 rpc(second,()=>{remoteWrite=true;return {ok:true,revision:'r3'};},()=>({ok:true,records:{}}));
 for(const diff of reopened.differingFields(local,server))
  (reopened.conflictChoices[date]??={})[diff.key]='local';
 reopened.resolveConflict(date);
 assert(!remoteWrite,'Old backend must never receive unarchived resolution');
 assert.equal(reopened.getPending()[date].entry.memo,'long device original');
 console.log('PASS: browser restart restores both originals and outdated Apps Script blocks overwrite');
})();

(function testMemoDivergenceIsReviewableWithExistingScores(){
 const date='2026-10-27',env1=env(),t=mental(env1);
 const local=t.normalize(date,{...record(date),memo:'long complete note'.repeat(15),revision:'old'});
 const server=t.normalize(date,{...record(date),memo:'short',revision:'server-v5'});
 t.setRecords({[date]:local});
 t.mergeCloudMonth({[date]:server});
 assert.equal(t.getRecords()[date].memo.length,local.memo.length);
 assert.equal(t.getPending()[date].entry.memo.length,local.memo.length);
 assert.equal(t.conflicts[date].server.memo,'short');
 assert.equal(t.getPending()[date].resolution,null);
 assert.equal(t.conflicts[date].phase,'review');
 const history=JSON.parse(env1.store.getItem('yuha_mental_recovery_conflict_snapshots_v1'));
 assert(history.some(x=>x.local.memo===local.memo&&x.server.memo==='short'));
 console.log('PASS: complete local memo is reviewable against truncated cloud despite 7/7 scores');
})();
(function testOfflineEditsWithStaleRevisionAreNotSentBlindly(){
 const date='2026-10-27',env1=env(),t=mental(env1);
 const local=t.normalize(date,{...record(date),memo:'edited offline',revision:'old'});
 const server=t.normalize(date,{...record(date),memo:'latest elsewhere',revision:'new'});
 t.setRecords({[date]:local});
 t.setPending({[date]:{entry:local,expectedRevision:'old',letterOnly:false}});
 t.mergeCloudMonth({[date]:server});
 assert.equal(t.conflicts[date].revision,'new');
 assert.equal(t.getRecords()[date].memo,'edited offline');
 console.log('PASS: stale nonempty revision is caught on cloud read before a write');
})();
(function testLostAckWhenCloudMatchesPending(){
 const date='2026-10-27',env1=env(),t=mental(env1);
 const local=t.normalize(date,{...record(date),memo:'this was already saved'});
 const server=t.normalize(date,{...local,revision:'latest'});
 t.setRecords({[date]:local});
 t.setPending({[date]:{entry:local,expectedRevision:'earlier',letterOnly:false}});
 t.mergeCloudMonth({[date]:server});
 assert.equal(t.getPending()[date],undefined);
 assert.equal(t.getRecords()[date].memo,'this was already saved');
 console.log('PASS: cloud exact match safely releases pending save after lost ACK');
})();

(function testRepairedCloudMemoSupersedesStaleHusbandCache(){
 const date='2026-10-27',e=env(),t=mental(e);
 const cached=t.normalize(date,{...record(date),memo:'아기가 아',revision:'old'});
 const full=t.normalize(date,{...record(date),memo:'Synthetic restored journal note with no personal data. '.repeat(5).slice(0,168),revision:'repaired'});
 t.setRecords({[date]:cached});
 t.mergeCloudMonth({[date]:full});
 assert.equal(t.getRecords()[date].memo,full.memo);
 assert.equal(t.getPending()[date],undefined);
 const backups=JSON.parse(e.store.getItem('yuha_mental_recovery_conflict_snapshots_v1'));
 assert(backups.some(x=>x.reason==='server_memo_longer_than_device'&&x.local.memo==='아기가 아'));
 console.log('PASS: shorter stale phone cache no longer masks restored 168-char cloud memo');
})();
(function testOtherFieldsDifferCannotAutoPromote(){
 const date='2026-10-27',e=env(),t=mental(e);
 const cached=t.normalize(date,{...record(date),memo:'short',revision:'local'});
 const full=t.normalize(date,{...record(date),memo:'longer changed server memo',revision:'remote',
   scores:{...record(date).scores,energy:4}});
 t.setRecords({[date]:cached});
 t.mergeCloudMonth({[date]:full});
 assert.equal(t.getRecords()[date].memo,'short');
 assert(t.conflicts[date],'Changes to other fields require manual comparison');
 console.log('PASS: longer server memo never silently overrides different scores');
})();

(function testLetterHeartOneTimeAndServerCompatibility(){
 const date='2026-10-28',e=env(),t=mental(e);
 const original=t.normalize(date,{...record(date),husbandLetter:'A thoughtful personal letter',
  husbandLetterStatus:'opened',husbandLetterOpenedAt:'2026-10-28T02:00:00.000Z'});
 t.setRecords({[date]:original});t.setSession();t.setSelectedDate(date);
 assert(t.husbandLetterHTML().includes('♡ 좋아요'));
 t.changes(date,row=>{row.husbandLetterLiked=true;},true,'like');
 assert(t.husbandLetterHTML().includes('♥ 1'));
 assert(t.husbandLetterHTML().includes('disabled'));
 assert.equal(t.getPending()[date].letterAction,'like');
 const afterLike=t.getRecords()[date];
 assert.equal(afterLike.husbandLetterLiked,true);
 const startMemo=afterLike.memo;
 let didSend=false,sendPayload;
 rpc(e,p=>{didSend=true;sendPayload=p;return {ok:true,revision:'v6-reaction'};},
  ()=>({ok:true,records:{[date]:{...afterLike,revision:'v6-reaction'}}}));
 t.setReactionSupport(false);t.syncNext();
 assert(!didSend,'Old v5 backend must not silently discard the reaction');
 assert(t.getPending()[date],'Reaction must persist in local pending queue');
 t.setReactionSupport(true);t.syncNext();
 assert(didSend);assert.equal(sendPayload.letterAction,'like');
 assert.equal(Object.keys(t.getPending()).length,0);
 assert.equal(t.getRecords()[date].memo,startMemo);
 assert.equal(t.getRecords()[date].husbandLetterLiked,true);
 console.log('PASS: one-heart 0/1 UI and v6-only verified cross-device saving');
})();
(function testNoDisruptiveConnectionBanner(){
 const e=env(),t=mental(e);
 assert(!t.syncSafetyHTML().includes('기기 간 저장 확인'));
 assert(!t.syncSafetyHTML().includes('서버 연결이 확인되지 않았습니다'));
 console.log('PASS: connection notice removed from recovery content panel');
})();
