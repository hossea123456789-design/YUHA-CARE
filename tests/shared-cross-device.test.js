"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8");
const script=fs.readFileSync("apps-script/Code.gs","utf8");
const illness=fs.readFileSync("illness-care.js","utf8");
const mental=fs.readFileSync("mental.js","utf8");
const block=(source,start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert(a>=0&&b>a,"Cannot find source boundaries: "+start+" → "+end);
 return source.slice(a,b);
};
(function testChecklistServerCompareAndSwap(){
 const src=block(script,"function saveAppData(payload) {","\nfunction resetServerData()");
 const db={revision:"cloud-newer",value:{daycare:{sections:[]}}};
 let writes=0,locked=false;
 const sheet={getDataRange(){return {getValues:()=>[["key","value_json","updated_at"],["checklist",JSON.stringify(db.value),db.revision]]};}};
 const ctx={
  setupSpreadsheet_(){},DB_SHEET_NAME:"CHECKLIST_DB",DATA_KEY:"checklist",
  CHECKLIST_SYNC_SCHEMA_:2,CACHE_KEY:"checklist_payload_v1",CACHE_TTL_SECONDS:21600,
  LockService:{getScriptLock(){return {tryLock(){locked=true;return true},releaseLock(){locked=false;}}}},
  SpreadsheetApp:{getActiveSpreadsheet(){return {getSheetByName(){return sheet;}}},flush(){}},
  CacheService:{getScriptCache(){return {put(){}}}},
  Utilities:{getUuid:()=>"abcdefgh-1234"},
  saveRawData_(data,revision){writes++;db.value=data;db.revision=revision;},
  Date,JSON,Object,String
 };
 const save=vm.runInNewContext("("+src.replace("function saveAppData","function")+")",ctx);
 const stale=save({data:{daycare:{sections:[{id:"old"}]}},updatedAt:"cloud-old"});
 assert.equal(stale.conflict,true);
 assert.equal(writes,0,"A stale phone cannot overwrite other device's cloud edit");
 assert.equal(locked,false);
 assert.throws(()=>save({data:{}}),/안전버전/);
 const valid=save({data:{daycare:{sections:[{id:"new"}]}},updatedAt:"cloud-newer"});
 assert.equal(valid.ok,true);
 assert.equal(valid.revisionGuardApplied,true);
 assert.equal(writes,1);
 assert.equal(locked,false);
 const read=block(script,"function getAppData(forceFresh) {","\nfunction saveAppData(");
 assert(read.includes("hasChecklistRow"),"A corrupt/empty existing row must never be initialized silently");
 assert(read.includes("throw new Error('CHECKLIST_DB 저장 행은 있지만 JSON이 비어 있습니다."),"An empty existing DB must be retained");
 assert(!read.includes("recovered: true"),"Broken JSON must not be auto-overwritten with defaults");
 assert(html.includes("archiveChecklistDifference")&&html.includes("getAppData(true)"));
 assert(html.includes("revisionGuardApplied!==true"),"Legacy server must not receive unsafe checklist edits");
 console.log("PASS checklist: atomic compare-and-swap rejects stale or unguarded writes");
})();
(function testSleepCleanVsDirtyVsUnknown(){
 const keys=["wakeTime","napStart","napEnd"],month="2026-11",day="2026-11-17";
 const old={[day]:{wakeTime:"06:00",napStart:"12:00",napEnd:"13:45"}};
 const newest={[day]:{wakeTime:"06:40",napStart:"12:00",napEnd:"13:45"}};
 const fn=block(html,"    function sleepRecordHasData(","    function persistSleepMonth(");
 const make=(baseline,pending)=>{
  const ctx={SLEEP_KEYS:keys,SLEEP_RESCUE_CACHE:"temp_",
   sleepServerMonths:baseline===null?{}:{[month]:baseline},sleepPending:pending,
   defaultSleepRecord:()=>Object.fromEntries(keys.map(k=>[k,""])),
   localStorage:{getItem(){return null},setItem(){}},setSleepStatus(){},JSON,String,Object,Set};
  vm.runInNewContext(fn+"globalThis.merge=mergeSleepMonthWithoutErasing;",ctx);
  return ctx.merge;
 };
 const clean=make(old,[])(month,newest,old);
 assert.equal(clean.records[day].wakeTime,"06:40");
 assert.equal(clean.refreshed,1);
 assert.equal(clean.mismatches.length,0);
 const pending=[{date:day,field:"wakeTime",value:"06:15",expectedValue:"06:00"}];
 const edited={[day]:{...old[day],wakeTime:"06:15"}};
 const dirty=make(old,pending)(month,newest,edited);
 assert.equal(dirty.records[day].wakeTime,"06:15");
 assert.equal(dirty.mismatches.length,1);
 const unknown=make(null,[])(month,newest,old);
 assert.equal(unknown.records[day].wakeTime,"06:00","Unknown device original must be preserved");
 assert.equal(unknown.mismatches.length,1);
 assert.equal(make(old,[])(month,{},old).records[day].wakeTime,"06:00",
  "Missing server days must not erase previously cached actual readings");
 assert(html.includes("function verifySleepSnapshot(snapshot,callback)"));
 assert(html.includes("verifySleepSnapshot(toUpload,verified=>"));
 assert(html.includes("verifySleepSnapshot(snapshot,verified=>"));
 console.log("PASS sleep: newer cloud data visible only for unedited verified fields, pending and blanks protected");
})();
function device(initial={}){
 const store=new Map(Object.entries(initial));
 const root={dataset:{},innerHTML:"",addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
 const win={addEventListener(){},confirm(){return true}};
 const ctx={window:win,document:{getElementById(){return root},addEventListener(){}},
  localStorage:{getItem(k){return store.get(k)||null},setItem(k,v){store.set(k,String(v))}},
  setInterval(){return 1},clearInterval(){},setTimeout(){return 1},clearTimeout(){},
  Date,JSON,Object,String,Number,Math,Intl,console};
 vm.runInNewContext(illness,ctx,{filename:"illness-care.js"});
 win.YuhaIllness.render();
 return {store,root,model:win.YuhaIllness.model,api:win.YuhaIllness._test};
}
const record=(revision,value)=>({
 id:"ifever_shared",title:"발열",onsetAt:"2026-11-13T08:00:00.000Z",
 status:"active",revision,visits:[],medications:[],medicationGroups:[],
 temperatures:[{id:"it1",at:"2026-11-13T09:00:00.000Z",celsius:value,site:"ear"}]});
(function testIllnessCloudOnlyAndStaleCopy(){
 const cloud=record("server-new",38.7);
 const fresh=device();
 fresh.api.absorbServer({[cloud.id]:cloud});
 assert.equal(fresh.model.cases[cloud.id].temperatures[0].celsius,38.7);
 assert.equal(JSON.parse(fresh.store.get("yuha_illness_records_v1"))[cloud.id].revision,"server-new");
 assert(fresh.root.innerHTML.includes("기록이 없습니다")===false||fresh.model.cases[cloud.id],
  "Fetched shared case is held in the device journal");
 const old=record("server-old",38.2),updated=record("server-new",38.7);
 const d=device({yuha_illness_records_v1:JSON.stringify({[old.id]:old})});
 d.api.absorbServer({[old.id]:updated});
 assert.equal(d.model.cases[old.id].temperatures[0].celsius,38.7);
 assert.equal(Object.keys(d.model.conflicts).length,0);
 assert(JSON.parse(d.store.get("yuha_illness_snapshots_v1")).some(x=>x.reason==="before-server-refresh"));
 const pending={episode:old,expectedRevision:"server-old"};
 const other=device({yuha_illness_records_v1:JSON.stringify({[old.id]:old}),
  yuha_illness_pending_v1:JSON.stringify({[old.id]:pending})});
 other.api.absorbServer({[old.id]:updated});
 assert.equal(other.model.cases[old.id].temperatures[0].celsius,38.2,
  "A genuine local unsent change is retained");
 assert.equal(Object.keys(other.model.conflicts).length,1,
  "A remote conflicting edit must be flagged, not silently overwritten");
 console.log("PASS illness: new device sees cloud records, stale clean device refreshes, unsynced edits protected");
})();
(function testTwoPhonesConvergeAfterConcurrentEdits(){
 const base=record("2026-11-18T00:00:00.000Z-v0",38.1);
 const local=JSON.parse(JSON.stringify(base));
 local.temperatures[0].celsius=38.5;
 local.temperatures.push({id:"it_husband",at:"2026-11-18T00:08:00.000Z",celsius:38.0,site:"ear"});
 const wife=JSON.parse(JSON.stringify(base));
 wife.temperatures[0].celsius=38.3;
 wife.temperatures.push({id:"it_wife",at:"2026-11-18T00:09:00.000Z",celsius:37.8,site:"ear"});
 wife.revision="2026-11-18T00:10:00.000Z-v1";
 const husband=device({
  yuha_illness_records_v1:JSON.stringify({[base.id]:local}),
  yuha_illness_last_verified_server_v1:JSON.stringify({[base.id]:base}),
  yuha_illness_pending_v1:JSON.stringify({[base.id]:{
   episode:local,expectedRevision:base.revision,
   editedAt:"2026-11-18T00:11:00.000Z",
   editedFields:{"/temperatures/it1/celsius":"2026-11-18T00:11:00.000Z"}
  }})
 });
 const wifePhone=device({
  yuha_illness_records_v1:JSON.stringify({[base.id]:wife}),
  yuha_illness_last_verified_server_v1:JSON.stringify({[base.id]:wife})
 });
 husband.api.absorbServer({[base.id]:wife});
 const merged=husband.model.cases[base.id];
 assert.equal(merged.temperatures[0].celsius,38.5,"later husband edit wins same field");
 assert.equal(merged.temperatures.length,3,"both phones' separate readings must survive");
 const published={...merged,revision:"2026-11-18T00:12:00.000Z-v2"};
 husband.api.absorbServer({[base.id]:published});
 wifePhone.api.absorbServer({[base.id]:published});
 assert.equal(Object.keys(husband.model.pending).length,0,"husband upload must be acknowledged");
 assert.equal(Object.keys(husband.model.conflicts).length,0);
 assert.equal(Object.keys(wifePhone.model.conflicts).length,0);
 assert.equal(JSON.stringify(husband.api.normalize(husband.model.cases[base.id])),
  JSON.stringify(wifePhone.api.normalize(wifePhone.model.cases[base.id])),
  "the two phones must converge on the same verified server record");
 console.log("PASS illness: simulated husband/wife concurrent edits converge to one result");
})();
(function testLegacyPhoneConflictAutomaticallyResolvesAndPurgesDeletedGroups(){
 const episodeId="ifever_shared";
 const base=record("2026-11-18T03:00:00.000Z-base",38.2);
 const remote=record("2026-11-18T06:00:00.000Z-new",38.7);
 remote.medicationGroups=[
  {id:"iold_hidden",name:"이전 삭제 묶음",mode:"scheduled",
   intervalHours:null,timesPerDay:2,days:3,deletedAt:"2026-11-18T03:20:00.000Z",
   items:[{id:"id_old",name:"삭제한 약",amount:2,unit:"mL"}],events:[]},
  {id:"inew_drug",name:"실제 최근 처방",mode:"scheduled",
   intervalHours:null,timesPerDay:2,days:3,deletedAt:"",
   items:[{id:"id_new",name:"새 약",amount:4,unit:"mL"}],events:[]}
 ];
 const local=record("2026-11-18T03:00:00.000Z-base",38.3);
 local.temperatures.push({id:"iunique_local_temp",at:"2026-11-18T05:30:00.000Z",celsius:36.6,site:"ear"});
 local.medicationGroups=[
  {id:"iold_deleted_before",name:"옛날 처방",mode:"scheduled",
   intervalHours:null,timesPerDay:3,days:3,deletedAt:"",
   items:[{id:"id_ancient",name:"옛날 약",amount:3,unit:"mL"}],events:[]}
 ];
 const oldPending={episode:local,expectedRevision:base.revision};
 const conflict={local,server:base};
 const phone=device({
  yuha_illness_records_v1:JSON.stringify({[episodeId]:local}),
  yuha_illness_pending_v1:JSON.stringify({[episodeId]:oldPending}),
  yuha_illness_conflicts_v1:JSON.stringify({[episodeId]:conflict})
  // No baseline (actual old-client conflict); it previously stayed locked forever.
 });
 phone.api.absorbServer({[episodeId]:remote});
 const merged=phone.model.cases[episodeId],out=phone.model.pending[episodeId];
 assert.equal(Object.keys(phone.model.conflicts).length,0,"persisted conflict flag must clear");
 assert(out,"merged unsent readings need a new outbound pending job");
 assert.equal(out.expectedRevision,remote.revision,"retry must use current cloud revision");
 assert.equal(merged.temperatures.length,2,"unique unsent reading must survive");
 assert.equal(merged.temperatures[0].celsius,38.7,"untracked duplicate uses verified latest cloud");
 assert(merged.temperatures.some(v=>v.id==="iunique_local_temp"));
 assert.deepEqual(Array.from(merged.medicationGroups.map(g=>g.id)),["inew_drug"],
  "deleted archived groups and local stale groups may not reappear");
 assert.equal(JSON.parse(phone.store.get("yuha_illness_pending_v1"))[episodeId].expectedRevision,
  remote.revision,"legacy reconciliation must persist new queue before sync");
 const phone2=device();
 phone2.api.absorbServer({[episodeId]:{...merged,revision:"2026-11-18T06:01:00.000Z-written"}});
 phone.api.absorbServer({[episodeId]:{...merged,revision:"2026-11-18T06:01:00.000Z-written"}});
 assert.equal(Object.keys(phone.model.pending).length,0,"write acknowledgement clears old local queue");
 assert.equal(Object.keys(phone.model.conflicts).length,0);
 assert.equal(JSON.stringify(phone.model.cases[episodeId]),
  JSON.stringify(phone2.model.cases[episodeId]),
  "both phones must show exactly the same server-verified result");
 console.log("PASS illness: screenshot-style old pending/conflict auto-recovers, purges old groups and converges both devices");
})();
(function testAutoPurgeServerTombstonesWithNoExistingPhoneConflict(){
 const remote=record("2026-11-18T06:00:00.000Z-new",37.5);
 remote.medicationGroups=[{id:"iold_group",name:"삭제한 묶음",mode:"scheduled",
  intervalHours:null,timesPerDay:2,days:3,deletedAt:"2026-11-18T01:30:00.000Z",
  items:[{id:"i_old",name:"예전 약",amount:2,unit:"mL"}],events:[]}];
 const phone=device();
 phone.api.absorbServer({[remote.id]:remote});
 assert.equal(phone.model.cases[remote.id].medicationGroups.length,0,
  "never show deleted prescription as current list");
 assert.equal(phone.model.pending[remote.id].expectedRevision,remote.revision,
  "automatic server cleanup must queue a write with latest revision");
 assert.equal(phone.model.pending[remote.id].episode.medicationGroups.length,0);
 console.log("PASS illness: old archived prescriptions automatically cleaned from shared server");
})();
(function testMentalRefreshAndStateVisibility(){
 assert(mental.includes("function refreshCloudRecords(force=false)"));
 assert(mental.includes('document.addEventListener?.("visibilitychange"'));
 assert(mental.includes('screen.querySelector("#mentalRefreshServer")'));
 assert(mental.includes("archiveBeforeOtherDeviceRefresh"));
 assert(mental.includes('locallyProtectedDates.add(date)'),
  "Unresolved protected device rows remain available");
 assert(html.includes("function refreshSharedTabsAfterReturn()"));
 assert(html.includes('window.addEventListener("focus",refreshSharedTabsAfterReturn)'));
 assert(illness.includes("serverBaseline")&&illness.includes("기기 저장"));
 console.log("PASS cross-tab: foreground revalidation, manually refreshed recovery and explicit sync warnings");
})();
console.log("PASS shared cross-device integrity regression suite");
