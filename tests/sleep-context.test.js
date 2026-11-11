"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8");
const gs=fs.readFileSync("apps-script/Code.gs","utf8");
const summary=fs.readFileSync("sleep-monthly.js","utf8");
const nightFrom=html.indexOf("    function nightDurationGross(dateKey) {");
const nightTo=html.indexOf("    function formatDuration(minutes) {",nightFrom);
const qualityFrom=html.indexOf("    function getSleepQuality(dateKey) {");
const qualityTo=html.indexOf("    function conciseDuration(minutes) {",qualityFrom);
assert(nightFrom>=0&&nightTo>nightFrom&&qualityFrom>=0&&qualityTo>qualityFrom);
function make(){
 const rows=Object.create(null),toIso=d=>d.toISOString().slice(0,10);
 const shiftSleepDate=(day,offset)=>toIso(new Date(Date.parse(day+"T12:00:00Z")+offset*86400000));
 const sleepMinutes=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t||""))?
   Number(t.slice(0,2))*60+Number(t.slice(3)):null;
 const getSleepRecord=day=>rows[day]||{};
 const napIntervals=row=>{
  const start=sleepMinutes(row.napStart),end=sleepMinutes(row.napEnd);
  if(start===null||end===null||end<=start)
   return {complete:false,intervals:[],error:"낮잠 입력 필요"};
  return {complete:true,intervals:[{start,end,minutes:end-start,phase:1}],total:end-start};
 };
 const formatDuration=n=>Math.floor(n/60)+"시간 "+Math.round(n%60)+"분";
 const c={getSleepRecord,shiftSleepDate,sleepMinutes,napIntervals,formatDuration,
  sleepRecommendation:()=>({months:20,min:660,max:840,label:"1~2세 권고 11~14시간"}),
  SLEEP_META_KEYS:["nightAwakeMinutes","nightWakings","napSource","onsetState","specialFlags","morningCondition"]};
 vm.runInNewContext(html.slice(nightFrom,nightTo)+html.slice(qualityFrom,qualityTo)+
  "globalThis.__sleep={nightDuration,nightDurationGross,sleepObservedAwake,getSleepQuality,sleepSpecialDay};",c);
 return {rows,shiftSleepDate,...c.__sleep};
}
(function testActualNetNightAndZeroMeaning(){
 const t=make(),prev="2026-11-10",day="2026-11-11";
 t.rows[prev]={asleepTime:"20:30",bedTime:"20:00",onsetState:"crying"};
 t.rows[day]={wakeTime:"06:30",napStart:"12:30",napEnd:"14:00",
  nightAwakeMinutes:"40",nightWakings:"2",napSource:"daycare",
  specialFlags:"travel",morningCondition:"tired"};
 assert.equal(t.nightDurationGross(day),600);
 assert.equal(t.nightDuration(day),560);
 let q=t.getSleepQuality(day);
 assert.equal(q.night,560);assert.equal(q.nap,90);assert.equal(q.total,650);
 assert.equal(q.awakeMinutes,40);assert.equal(q.nightWakings,"2");
 assert.equal(q.napSource,"daycare");assert.equal(q.onsetState,"crying");
 assert.equal(q.morningCondition,"tired");assert.equal(q.specialFlags,"travel");
 assert(q.notes.some(note=>note.includes("어린이집 추정")));
 assert(q.notes.some(note=>note.includes("밤중 깨어 있던 40분")));
 t.rows[day].nightAwakeMinutes="";
 assert.equal(t.sleepObservedAwake(day),null);
 assert.equal(t.nightDuration(day),600);
 assert.equal(t.getSleepQuality(day).total,690);
 t.rows[day].nightAwakeMinutes="0";
 assert.equal(t.sleepObservedAwake(day),0);
 t.rows[day].nightAwakeMinutes="700";
 assert.equal(t.nightDuration(day),null);
 assert.equal(t.getSleepQuality(day).total,null);
 console.log("PASS sleep: night 600 less awake 40 plus nap 90; unknown zero and invalid distinct");
})();
(function testSpecialDaysExcludeRegularityOnly(){
 const t=make(),day="2026-11-11";
 for(let n=0;n<=9;n++){
  const date=t.shiftSleepDate(day,-n);
  t.rows[date]={asleepTime:"20:00",bedTime:"19:30",wakeTime:"06:30",
   napStart:"12:30",napEnd:"14:00",specialFlags:"none"};
 }
 let q=t.getSleepQuality(day);
 assert(q.breakdown.some(b=>b.key==="regularity"));
 t.rows[day].specialFlags="travel";
 q=t.getSleepQuality(day);
 assert(!q.breakdown.some(b=>b.key==="regularity"));
 assert(q.breakdown.some(b=>b.key==="total"));
 assert(q.notes.some(v=>v.includes("평소 수면 리듬")));
 t.rows[day].specialFlags="none";
 t.rows[t.shiftSleepDate(day,-1)].specialFlags="illness";
 q=t.getSleepQuality(day);
 assert(!q.breakdown.some(b=>b.key==="regularity"));
 console.log("PASS sleep: travel illness isolated from usual rhythm scoring but total still assessed");
})();
(function testMonthlyObservedCategories(){
 const t=make(),day="2026-11-11";
 t.rows["2026-11-10"]={asleepTime:"20:30",bedTime:"20:00",onsetState:"crying"};
 t.rows[day]={wakeTime:"06:30",napStart:"12:30",napEnd:"14:00",
  nightAwakeMinutes:"40",nightWakings:"2",napSource:"daycare",
  morningCondition:"tired",specialFlags:"travel"};
 const c={window:{}};
 vm.runInNewContext(summary,c,{filename:"sleep-monthly.js"});
 const report=c.window.YuhaSleepMonthly.buildMonthlySummary({
  year:2026,month:11,today:"2026-11-11",
  qualityFor:date=>t.getSleepQuality(date),
  recordFor:date=>t.rows[date]||{},
  recommendationFor:()=>({min:660,max:840})
 });
 assert.equal(report.completeDays,1);
 assert.equal(report.averageNight,560);assert.equal(report.averageNap,90);
 assert.equal(report.averageTotal,650);assert.equal(report.awakeMinutesSamples,1);
 assert.equal(report.awakeMinutesAverage,40);
 assert.equal(report.wakingCountAverage,2);assert.equal(report.specialDays,1);
 assert.equal(report.daycareEstimatedDays,1);assert.equal(report.morningTiredDays,1);
 assert.equal(report.onsetCryDays,1);
 assert(report.insights.some(x=>x.title.includes("여행")));
 assert(report.insights.some(x=>x.title.includes("낮잠 시간")));
 console.log("PASS sleep: monthly summary uses waking special situations estimated naps and condition");
})();
(function testBackendFormatsAndSheetSchema(){
 const start=gs.indexOf("const SLEEP_FIELDS_ =");
 const end=gs.indexOf("const SLEEP_WEEKDAYS_ =",start);
 assert(start>=0&&end>start);
 const ctx={validateSleepTime_:v=>{if(!/^\d{2}:\d{2}$/.test(v)&&v!=="")throw Error("invalid clock");}};
 vm.runInNewContext(gs.slice(start,end)+
  "globalThis.__meta={fields:SLEEP_FIELDS_,headers:SLEEP_META_HEADERS_,validate:validateSleepField_};",ctx);
 const m=ctx.__meta;
 for(const [key,n] of Object.entries({nightAwakeMinutes:16,nightWakings:17,
  napSource:18,onsetState:19,specialFlags:20,morningCondition:21}))
  assert.equal(m.fields[key],n);
 assert.equal(m.headers.length,6);
 for(const [key,value] of [
  ["nightAwakeMinutes",""],["nightAwakeMinutes","0"],["nightAwakeMinutes","960"],
  ["nightWakings","0"],["nightWakings","30"],["napSource","daycare"],
  ["onsetState","crying"],["specialFlags","travel,illness"],["specialFlags","none"],
  ["morningCondition","tired"]])assert.doesNotThrow(()=>m.validate(key,value));
 for(const [key,value] of [
  ["nightAwakeMinutes","-1"],["nightAwakeMinutes","961"],["nightAwakeMinutes","1.5"],
  ["nightWakings","31"],["nightWakings","2.1"],["specialFlags","none,illness"],
  ["specialFlags","travel,travel"],["specialFlags","invalid"],
  ["napSource","unverified"],["onsetState","unverified"],["morningCondition","unverified"]])
  assert.throws(()=>m.validate(key,value),key+" should reject "+value);
 assert(gs.includes("metadataSupported:true, schemaVersion:3"));
 assert(gs.includes("getRange(2,1,last-1,21).getDisplayValues()"));
 assert(gs.includes("getRange(2,1,sheet.getLastRow()-1,21).getDisplayValues()"));
 assert(gs.includes("ensureSleepMetaColumns_(sh)"));
 assert(gs.includes("IFERROR(VALUE(P")&&gs.includes("/1440,0)"));
 assert(gs.includes("if(op.field==='nightAwakeMinutes')"));
 console.log("PASS sleep: appended N:S metadata columns and server validation");
})();
(function testFrontendSafetyAndXml(){
 assert(html.includes('id="sleepObservationCard"'));
 assert(html.includes('drawSleepObservation();drawSleepMonthlySummary();fetchSleepMonth()'));
 assert(html.includes("sleepServerMetaReady=result.metadataSupported===true"));
 assert(html.includes("const cachedBefore=ensureSleepMonth(year,month);"));
 assert(html.includes("if(!sleepServerMetaReady)Object.entries(localMeta)"));
 assert(html.includes("sleepServerMetaReady||!SLEEP_META_KEYS.includes(op.field)"));
 assert(html.includes('key:"nightAwakeMinutes"'));
 assert(html.includes('key:"morningCondition"'));
 assert(html.includes("기록 기반 생활 리듬 참고 점수"));
 assert(html.includes('data-sleep-observe="nightAwakeMinutes"'));
 assert(html.includes('data-sleep-special="'));
 console.log("PASS sleep: editor, cache protection, XML fields and rhythm score label");
})();
