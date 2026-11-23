"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("apps-script/Code.gs","utf8");
const begin=source.indexOf("const TIME_MINUTE_KEY_=");
const end=source.indexOf("function checkBirthDate_(",begin);
assert(begin>=0&&end>begin,"time-picker APP_SETTINGS API not found");
const rows=[
 ["key","value","updated_at"],
 ["birthDate","2025-03-23","birth-revision"]
];
const sheet={
 getLastRow(){return rows.length;},
 getRange(row,col,height=1,width=1){
  return {
   getDisplayValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(rows[row+i-1]?.[col+j-1]??"")));},
   setValues(values){values.forEach((line,i)=>{
    while(rows.length<row+i)rows.push([]);
    line.forEach((value,j)=>{rows[row+i-1][col+j-1]=value;});
   });return this;}
  };
 }
};
let seq=0,locks=0;
const ctx={
 getChildSettingsSheet_(){return sheet;},
 LockService:{getScriptLock(){return {
  tryLock(){locks++;return true;},
  releaseLock(){locks--;}
 }}},
 Utilities:{getUuid(){return "12345678-abcd-"+(++seq);}},
 SpreadsheetApp:{flush(){}},
 Date,JSON,Object,String,Number
};
vm.runInNewContext(source.slice(begin,end),ctx,{filename:"Code.gs/time-picker-settings"});
const read=ctx.getTimePickerSettings,save=ctx.saveTimePickerSettings;
const first=read();
assert.equal(first.ok,true);
assert.equal(first.minuteStep,5,"new DB rows default to five minutes");
assert.equal(first.revision,"","no DB row is an empty CAS revision");
assert.equal(rows.length,2,"read-only default must not write any record");
const result=save({minuteStep:10,expectedRevision:first.revision});
assert.equal(result.ok,true);
assert.equal(result.minuteStep,10);
assert.equal(rows.length,3,"new preference stored in APP_SETTINGS, not sleep or illness");
assert.equal(rows[2][0],"timePickerMinuteStep");
assert.equal(rows[2][1],"10");
assert.equal(rows[1][1],"2025-03-23","existing birthdate must not be overwritten");
const second=read();
assert.equal(second.minuteStep,10);
assert.equal(second.revision,result.revision);
const stale=save({minuteStep:20,expectedRevision:""});
assert.equal(stale.ok,false);
assert.equal(stale.conflict,true,"another phone cannot overwrite newer shared DB setting");
assert.equal(read().minuteStep,10);
const idempotent=save({minuteStep:10,expectedRevision:second.revision});
assert.equal(idempotent.unchanged,true);
assert.equal(rows.length,3);
const fresh=save({minuteStep:15,expectedRevision:second.revision});
assert.equal(fresh.ok,true);
assert.equal(read().minuteStep,15);
assert.throws(()=>save({minuteStep:7,expectedRevision:fresh.revision}),/증가폭/);
assert.throws(()=>save({minuteStep:5}),/이전 서버 버전/);
assert.equal(locks,0,"all DB writes release script lock");
console.log("PASS shared time settings: DB default, roundtrip, optimistic lock, conflict rejection, unchanged birthdate");
