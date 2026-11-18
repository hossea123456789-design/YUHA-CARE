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
