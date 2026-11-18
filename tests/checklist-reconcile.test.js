"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const page=fs.readFileSync("index.html","utf8");
const source=fs.readFileSync("checklist-reconcile.js","utf8");
const win={};
vm.runInNewContext(source,{window:win,Date,JSON,Number,Map,Set,Object,String});
const merge=win.YuhaChecklistReconcile;
assert(merge);
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const data={daycare:{label:"얼집",title:"준비물",sections:[{
  id:"section_a",title:"매일 준비",items:[
   {id:"check_a",text:"양말",checked:false},
   {id:"check_b",text:"물통",checked:false}
  ]}]},
  outing:{label:"외출",title:"외출",sections:[]},
  daily:{label:"매일",title:"매일",sections:[]},
  weekly:{label:"주간",title:"주간",sections:[]}};
 return data;
}
const checked=(data,id)=>data.daycare.sections[0].items.find(x=>x.id===id)?.checked;
(function independentActionsAndNewestItem(){
 const base=fixture(),local=clone(base),remote=clone(base);
 local.daycare.sections[0].items[0].checked=true;
 remote.daycare.sections[0].items[1].checked=true;
 const at=Date.parse("2026-11-19T06:34:01.000+09:00");
 const remoteRevision="2026-11-18T21:33:35.000Z-server";
 const result=merge.reconcile(base,local,remote,{
  localEditAt:new Date(at).toISOString(),serverRevision:remoteRevision,
  checkedEdits:{check_a:at}});
 assert.equal(checked(result.data,"check_a"),true);
 assert.equal(checked(result.data,"check_b"),true);
 assert.equal(result.changedServer,true);
 assert.equal(result.changedLocal,true);
 const conflicting=clone(remote);
 conflicting.daycare.sections[0].items[0].checked=true;
 const localUnchecked=clone(base);
 const recent=merge.reconcile(base,localUnchecked,conflicting,{
  localEditAt:"2026-11-18T21:40:00.000Z",
  serverRevision:"2026-11-18T21:38:00.000Z-remote",
  checkedEdits:{check_a:Date.parse("2026-11-18T21:40:00.000Z")}});
 assert.equal(checked(recent.data,"check_a"),false,"recent deliberate uncheck must win");
 console.log("PASS checklist: independent phone updates merged; last edited checkbox wins");
})();
(function legacyDirtyCacheWithNoAncestor(){
 const base=fixture(),local=clone(base),remote=clone(base);
 local.daycare.sections[0].items[0].checked=true;
 remote.daycare.sections[0].items[1].checked=true;
 remote.daycare.sections[0].items.push({id:"check_c",text:"손수건",checked:true});
 const out=merge.reconcile(null,local,remote,{});
 assert.equal(checked(out.data,"check_a"),true);
 assert.equal(checked(out.data,"check_b"),true,
  "legacy unsent checklist must not erase a previously confirmed check");
 assert.equal(checked(out.data,"check_c"),true,
  "remote-only added rows must remain visible");
 const edit=clone(local);
 edit.daycare.sections[0].items[0].checked=false;
 const deliberate=merge.reconcile(null,edit,remote,{
  checkedEdits:{check_a:Date.parse("2026-11-18T21:40:00Z")},
  serverRevision:"2026-11-18T21:33:00.000Z-r2"});
 assert.equal(checked(deliberate.data,"check_a"),false);
 console.log("PASS checklist: legacy missing baseline never loses completed checks or added items");
})();
(function semanticComparator(){
 const a={daily:{label:"a",sections:[]},daycare:{sections:[],label:"b"}};
 const b={daycare:{label:"b",sections:[]},daily:{sections:[],label:"a"}};
 assert(merge.same(a,b),"object key order is not a content conflict");
 console.log("PASS checklist: equivalent key ordering does not count as a conflict");
})();
const cut=(begin,end)=>{
 const start=page.indexOf(begin),stop=page.indexOf(end,start+begin.length);
 assert(start>=0&&stop>start,"Missing frontend function boundary: "+begin);
 return page.slice(start,stop);
};
const readFn=cut("    function loadFromServer() {","\n    function queueChecklistSave(");
const saveFn=cut("    function saveNow() {","\n    function normalizeData(");
function fakeDevice(server,local,base,stamps={}){
 const alerts=[],status=[],calls={reads:0,writes:0},queued=[];
 const mock={
  navigator:{onLine:true},window:{YuhaChecklistReconcile:merge,
   confirm(){throw Error("Unexpected false other-device conflict confirmation");}},
  Date,Math,JSON,Object,String,Number,Map,Set,console,
  data:clone(local),checklistServerBaseline:base===null?null:clone(base),
  checklistDirty:true,checklistSaving:false,checklistLoading:false,
  checklistRefreshAfterSave:false,checklistServerChecked:true,
  checklistGuardSupported:true,checklistSaveQueued:false,
  checklistFirstLoadRetryTimer:null,checklistRetryCount:0,
  checklistCheckedEditTimes:{...stamps},
  serverUpdatedAt:"2026-11-18T21:30:00.000Z-origin",
  checklistLastChangeAt:Date.now()-7000,
  checklistLastInteractionAt:0,checklistActivePointers:new Set(),dragState:null,
  checklistVersion:3,CHECKLIST_SAVE_IDLE_MS:2000,
  saveTimer:null,checklistFirstLoadRetryAt:0,
  CHECKLIST_RETRY_BASE_MS:5000,CHECKLIST_RETRY_MAX_MS:60000,
  clearTimeout(){},setTimeout(fn){queued.push(fn);return queued.length;},
  loadClientCache(){return false},saveClientCache(){return true},
  normalizeData:v=>v,archiveChecklistDifference(){alerts.push("backup");return true;},
  render(){},setSaveStatus(msg){status.push(msg);},
  showAppProgress(){},scheduleChecklistRetry(){},clearChecklistRetry(){},
  queueChecklistSave(){queued.push(()=>this.saveNow());},
  getData(){return this.data;},
  document:{getElementById(){return null}},
  google:{script:{run:{
   withSuccessHandler(success){
    return {withFailureHandler(failure){
     return {
      getAppData(){
       calls.reads++;
       success({ok:true,schemaVersion:2,updatedAt:server.revision,
        data:clone(server.value),fromCache:false});
      },
      saveAppData(payload){
       calls.writes++;
       if(payload.updatedAt!==server.revision){
        success({ok:false,conflict:true,updatedAt:server.revision});
       }else{
        server.value=clone(payload.data);
        server.revision=new Date().toISOString()+"-saved"+calls.writes;
        success({ok:true,updatedAt:server.revision,revisionGuardApplied:true});
       }
      }
     };
    }};
   }
  }}}
 };
 const vmctx=vm.createContext(mock);
 vm.runInContext(readFn+"\n"+saveFn,vmctx,{filename:"index.html checklist runtime"});
 return {ctx:vmctx,status,alerts,calls,queued,server,
  load:()=>vm.runInContext("loadFromServer()",vmctx),
  save:()=>vm.runInContext("saveNow()",vmctx)};
}
(function actualFrontendReadWriteSequence(){
 const old=fixture(),local=clone(old),remote=clone(old);
 local.daycare.sections[0].items[0].checked=true;
 remote.daycare.sections[0].items[1].checked=true;
 const server={value:remote,revision:"2026-11-18T21:33:30.000Z-ownEarlierWrite"};
 const dev=fakeDevice(server,local,old,{check_a:Date.now()-7000});
 dev.load();
 assert.equal(dev.ctx.checklistServerChecked,true);
 assert.equal(dev.ctx.checklistDirty,true,"merged edit is pending server upload");
 assert.equal(checked(dev.ctx.data,"check_a"),true);
 assert.equal(checked(dev.ctx.data,"check_b"),true);
 assert.equal(dev.alerts.length,1,"original versions backed up before merge");
 assert(!dev.status.some(x=>x.includes("다른 기기")),
  "version difference must not be misidentified as someone else's editing");
 dev.save();
 assert.equal(dev.ctx.checklistDirty,false,"verified readback clears dirty");
 assert.equal(dev.ctx.serverUpdatedAt,server.revision);
 assert.equal(checked(server.value,"check_a"),true);
 assert.equal(checked(server.value,"check_b"),true);
 const second=fakeDevice(server,old,old,{});
 second.ctx.checklistDirty=false;
 second.load();
 assert(merge.same(second.ctx.data,server.value),
  "second device must display the same verified shared checklist");
 console.log("PASS checklist RPC: one editor's overlapping saves auto-rebase, verify, and converge both devices");
})();
(function inFlightOwnWriteDoesNotBecomeFalseConflict(){
 const original=fixture(),changed=clone(original);
 changed.daycare.sections[0].items[0].checked=true;
 const server={value:original,revision:"2026-11-18T21:30:00.000Z-origin"};
 const dev=fakeDevice(server,changed,original,{});
 dev.ctx.checklistSaving=true;
 dev.load();
 assert.equal(dev.ctx.checklistRefreshAfterSave,true,
  "a concurrent read is deferred while own save is still unacknowledged");
 assert.equal(dev.alerts.length,0,"own in-flight request is not another editor");
 assert.equal(dev.calls.reads,0,"no server read while an unverified write is in flight");
 console.log("PASS checklist RPC: own in-flight save cannot cause a false conflict dialog");
})();
console.log("PASS checklist reconciliation regression tests");
