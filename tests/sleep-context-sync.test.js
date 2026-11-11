"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8");
function sliceFunction(first,last){
 const a=html.indexOf("    function "+first+"(");
 const b=html.indexOf("    function "+last+"(",a);
 assert(a>=0&&b>a,"Missing function "+first+" to "+last);
 return html.slice(a,b);
}
(function testLegacyBackendCannotEraseNewLocalObservation(){
 const month="2026-11",day=month+"-11",cached={
  wakeTime:"06:30",nightAwakeMinutes:"40",nightWakings:"2",
  napSource:"daycare",specialFlags:"travel",morningCondition:"tired",onsetState:"crying"
 };
 const captured={};
 const c={
  sleepMonths:{[month]:{[day]:{...cached}}},
  sleepServerMonths:{},sleepLoadTokens:{},sleepPending:[
   {date:day,field:"nightAwakeMinutes",value:"40",expectedValue:null}],
  SLEEP_META_KEYS:["nightAwakeMinutes","nightWakings","napSource","onsetState","specialFlags","morningCondition"],
  SLEEP_KEYS:["wakeTime","nightAwakeMinutes","nightWakings","napSource","specialFlags","morningCondition","onsetState"],
  SLEEP_SERVER_CACHE:"yuha_sleep_server_v5_",SLEEP_BIRTH_KEY:"yuha_sleep_birth_v3",
  SLEEP_RESCUE_CACHE:"yuha_sleep_rescue_20261111_",sleepRecoveryState:{},sleepFetchHealth:{},
  updateSleepRecoveryNotice(){},
  sleepMonthKey:(y,m)=>y+"-"+String(m).padStart(2,"0"),
  sleepMonthOfDate:date=>date.slice(0,7),
  ensureSleepMonth:()=>c.sleepMonths[month],
  defaultSleepRecord:()=>({}),
  persistSleepMonth:key=>{c.persisted=key;},
  localStorage:{setItem(k,v){captured[k]=v;},getItem(k){return captured[k]||null;}},
  navigator:{onLine:true},showAppProgress(){},setSleepStatus(message){c.status=message;},
  sleepServerNap2Ready:false,sleepServerMetaReady:true,sleepSessionOnline:false,
  sleepCacheOnly:true,currentTab:"settings",
  document:{getElementById(){return null}},
  birthDate:"2025-03-23",birthServerBase:null,
  renderSleepTab(){throw Error("No tab rerender expected");},
  requestSleepSync(){throw Error("Do not sync in cache-only mode")}
 };
 const result={ok:true,nap2Supported:true,schemaVersion:2,
  records:{[day]:{wakeTime:"06:45"}}};
 c.google={script:{run:{
  withSuccessHandler(fn){this.success=fn;return this},
  withFailureHandler(fn){this.failure=fn;return this},
  getSleepMonth(){this.success(result);}
 }}};
 c.window=c;
 vm.runInNewContext(sliceFunction("sleepRecordHasData","persistSleepMonth")+
  sliceFunction("fetchSleepMonthFor","fetchSleepMonth")+
  "globalThis.__fetch=fetchSleepMonthFor;",c,{filename:"old-backend-read.js"});
 c.__fetch(2026,11,true);
 assert.equal(c.sleepServerMetaReady,false);
 assert.equal(c.sleepMonths[month][day].wakeTime,"06:30","locally entered time must remain visible until versions are reviewed");
 assert.equal(c.sleepServerMonths[month][day].wakeTime,"06:45","verified cloud stays separately available");
 assert.equal(c.sleepRecoveryState[month].mismatches.length,1);
 assert(captured["yuha_sleep_rescue_20261111_2026-11_device_original"]);
 for(const key of c.SLEEP_META_KEYS)assert.equal(c.sleepMonths[month][day][key],cached[key]);
 assert.equal(c.sleepPending.length,1);
 assert(c.status.includes("차이"));
 assert.equal(c.persisted,month);
 console.log("PASS compatibility: old Apps Script read cannot erase new local qualitative observations");
})();
(function testUnsupportedBackendQueuesMetadataWithoutSending(){
 const c={
  sleepPending:[{date:"2026-11-11",field:"nightAwakeMinutes",value:"40",expectedValue:null}],
  sleepServerMetaReady:false,sleepServerNap2Ready:true,
  SLEEP_META_KEYS:["nightAwakeMinutes","nightWakings","napSource","onsetState","specialFlags","morningCondition"],
  sleepSaving:false,navigator:{onLine:true},sleepConflicts:[],
  setSleepStatus(message){c.status=message;},showAppProgress(){},
  sleepCacheOnly:false
 };
 let sent=null;
 c.google={script:{run:{
  withSuccessHandler(fn){this.success=fn;return this;},
  withFailureHandler(fn){this.failure=fn;return this;},
  syncSleepChanges(value){sent=value;}
 }}};
 vm.runInNewContext(sliceFunction("requestSleepSync","settleSleepEdits")+
  "globalThis.__sync=requestSleepSync;",c,{filename:"metadata-sync.js"});
 c.__sync(false);
 assert.equal(sent,null);
 assert.equal(c.sleepPending.length,1);
 assert(c.status.includes("v3"));
 c.sleepServerMetaReady=true;
 c.__sync(false);
 assert(sent&&sent.edits.length===1);
 assert.equal(sent.edits[0].field,"nightAwakeMinutes");
 assert.equal(sent.edits[0].value,"40");
 console.log("PASS compatibility: metadata retained until backend v3, then sent through existing conflict-safe API");
})();
