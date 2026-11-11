"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8"),gs=fs.readFileSync("apps-script/Code.gs","utf8");
const functionBlock=(source,start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,"Missing tested code block "+start);
 return source.slice(a,b);
};
const fields=["bedTime","asleepTime","napStart","napEnd","wakeTime","nap2Start","nap2End",
 "nightAwakeMinutes","nightWakings","napSource","onsetState","specialFlags","morningCondition"];
const key="2026-10",date=key+"-19";
const memory={};
const c={
 SLEEP_KEYS:fields,SLEEP_RESCUE_CACHE:"yuha_sleep_rescue_20261111_",
 localStorage:{getItem(k){return memory[k]||null},setItem(k,v){memory[k]=v}},
 defaultSleepRecord:()=>Object.fromEntries(fields.map(f=>[f,""])),
 setSleepStatus(msg){c.status=msg}
};
vm.runInNewContext(functionBlock(html,"    function sleepRecordHasData(", "    function persistSleepMonth(")+
 "globalThis.__safe={mergeSleepMonthWithoutErasing,rescueSleepSnapshot,cleanSleepSnapshot};",c);
const safe=c.__safe;
(function testEmptyServerCannotEraseLocal(){
 const original={[date]:{bedTime:"20:00",asleepTime:"20:25",wakeTime:"06:15",napStart:"12:25",napEnd:"14:25"}};
 assert(safe.rescueSleepSnapshot(key,original,"device"));
 const result=safe.mergeSleepMonthWithoutErasing(key,{},original);
 assert.equal(result.serverCount,0);assert.equal(result.deviceCount,1);
 assert.equal(result.records[date].wakeTime,"06:15");
 assert.equal(result.records[date].napEnd,"14:25");
 assert.equal(result.deviceOnly,1);
 safe.rescueSleepSnapshot(key,{}, "device");
 assert.equal(JSON.parse(memory[c.SLEEP_RESCUE_CACHE+key+"_device_original"])[date].wakeTime,"06:15");
 console.log("PASS rescue: empty server response never deletes cached sleep record or original snapshot");
})();
(function testPartialResponseRetainsMissingDatesAndFields(){
 const second=key+"-20";
 const local={[date]:{asleepTime:"20:25",wakeTime:"06:15",napStart:"12:25"},
  [second]:{asleepTime:"20:30",wakeTime:"06:20",napStart:"12:30"}};
 const server={[date]:{wakeTime:"06:15",napEnd:"14:25"}};
 const merged=safe.mergeSleepMonthWithoutErasing(key,server,local);
 assert.equal(Object.keys(merged.records).length,2);
 assert.equal(merged.records[date].asleepTime,"20:25");
 assert.equal(merged.records[date].napEnd,"14:25");
 assert.equal(merged.records[second].napStart,"12:30");
 assert.equal(merged.deviceOnly,1);
 console.log("PASS rescue: partial month read merges fields and dates instead of whole-month replacement");
})();
(function testDiscordantVersionsNeverAutoWrite(){
 const local={[date]:{wakeTime:"06:00",nightAwakeMinutes:"30"}};
 const server={[date]:{wakeTime:"06:30",nightAwakeMinutes:""}};
 const merged=safe.mergeSleepMonthWithoutErasing(key,server,local);
 assert.equal(merged.records[date].wakeTime,"06:00");
 assert.equal(merged.mismatches.length,1);
 assert.equal(merged.mismatches[0].serverValue,"06:30");
 assert.equal(merged.mismatches[0].localValue,"06:00");
 assert(safe.rescueSleepSnapshot(key,server,"server"));
 assert.equal(JSON.parse(memory[c.SLEEP_RESCUE_CACHE+key+"_server_original"])[date].wakeTime,"06:30");
 console.log("PASS rescue: divergent versions remain separately preserved for review");
})();
(function testOccupiedLegacyColumnsNotTouched(){
 const body=functionBlock(gs,"const SLEEP_FIELDS_ =","const SLEEP_WEEKDAYS_ =");
 const context={ensureNap2Columns_(){},validateSleepTime_(){}};
 vm.runInNewContext(body+"globalThis.__meta={ensureSleepMetaColumns_,fields:SLEEP_FIELDS_};",context);
 const grid=Array(24).fill("");
 grid[13]="2차 낮잠 시작";grid[14]="2차 낮잠 종료"; // N:O in actual existing sheet
 const sh={
  getMaxColumns(){return 23;},
  getLastRow(){return 43;},
  insertColumnsAfter(){throw Error("Existing sheet already has sufficient columns");},
  getRange(row,col,rows,cols){
   if(row==="P:U")return {setNumberFormat(){return this;}};
   if(row===2&&col===16)return {getDisplayValues(){return Array.from({length:rows},()=>Array(6).fill(""));}};
   assert.equal(row,1);
   return {
    getDisplayValues(){return [grid.slice(col-1,col-1+cols)];},
    setValues(v){for(let i=0;i<cols;i++)grid[col-1+i]=v[0][i];return this;},
    setFontWeight(){return this},setBackground(){return this},setFontColor(){return this}
   }
  },
  setColumnWidths(){}
 };
 context.__meta.ensureSleepMetaColumns_(sh);
 assert.equal(grid[13],"2차 낮잠 시작");assert.equal(grid[14],"2차 낮잠 종료");
 assert.deepEqual(grid.slice(15,21),[
  "밤중 깨어 있던 분","밤중 각성 횟수","낮잠 시간 출처",
  "잠들기 전 상태","특별한 날","아침 컨디션"
 ]);
 const bad=Array(24).fill("");
 bad[15]="기존 데이터 - 덮어쓰기 금지";
 const conflicting={
  ...sh,getRange(row,col,rows,cols){
   return {
    getDisplayValues(){return [bad.slice(col-1,col-1+cols)]},
    setValues(){throw Error("Must not overwrite occupied P:U")},setFontWeight(){return this},
    setBackground(){return this},setFontColor(){return this}
   }
  }
 };
 assert.throws(()=>context.__meta.ensureSleepMetaColumns_(conflicting),/보존/);
 console.log("PASS rescue: legacy N:O headers remain untouched; append new P:U or reject occupied columns");
})();
(function testRecoveryUi(){
 assert(html.includes('id="sleepRecoveryNotice"'));
 assert(html.includes('id="sleepRecoveryRefresh"'));
 assert(html.includes('id="sleepDeviceRecovery"'));
 assert(html.includes("서버가 이 달 기록을 0일로 반환했습니다"));
 assert(html.includes("XML 기록 추출"));
 assert(html.includes("function exportSleepDeviceRecovery()"));
 assert(html.includes("delete sleepLoadTokens[key];"));
 console.log("PASS rescue: visible data-source counts, safe server retry, local raw backup and failed-fetch retry");
})();
