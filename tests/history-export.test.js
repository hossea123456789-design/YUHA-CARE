"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const source=fs.readFileSync("history-export.js","utf8");
const scope={window:{}};
vm.runInNewContext(source,scope,{filename:"history-export.js"});
const x=scope.window.YuhaHistoryExport;
assert(x&&typeof x.buildXml==="function"&&typeof x.open==="function");
(function testXmlMarkupAndPrivacy(){
 const doc={
  kind:"mental",scope:"all",firstMonth:"2026-10",lastMonth:"2026-11",
  mode:"server-and-device",
  context:{interpretation:"scores on 0–10, PIN is never exported"},
  fields:[{key:"scores.energy",label:"신체 에너지",unit:"0-10"},
   {key:"memo",label:"개인 메모 원문"}],
  months:[
   {month:"2026-10",server:{"2026-10-28":{
     scores:{energy:7,control:0},memo:"기록 & <태그> '큰따옴표\"' \n다음 줄",
     husbandLetter:"편지 🌿",husbandLetterLiked:false,contexts:["work_stress","care_hard"],
     offDutyMinutes:0,husbandLetterOpenedAt:null
    }},device:{"2026-10-28":{
     scores:{control:0,energy:7},memo:"기록 & <태그> '큰따옴표\"' \n다음 줄",
     husbandLetter:"편지 🌿",husbandLetterLiked:false,contexts:["work_stress","care_hard"],
     offDutyMinutes:0,husbandLetterOpenedAt:null
    }},pending:{},conflicts:{}},
   {month:"2026-11",server:{"2026-11-02":{memo:"서버에 있는 본문"}},
    device:{"2026-11-02":{memo:"기기에 임시 보관된 본문"},
      "2026-11-03":{memo:"기기에만 있는 기록"}},
    pending:{"2026-11-02":{entry:{memo:"기기에 임시 보관된 본문"},expectedRevision:"a1",letterOnly:false}},
    conflicts:{"2026-11-02":{serverOriginal:{memo:"서버에 있는 본문"},deviceOriginal:{memo:"기기에 임시 보관된 본문"}}}}
  ]
 };
 const out=x.buildXml(doc);
 assert(out.complete);
 assert.equal(out.failed.length,0);
 assert.equal(out.recordCount,3,"Same-day cloud/device versions are one diary day");
 assert(out.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
 assert(out.xml.includes('<yuhaCareHistory schemaVersion="1.0" category="mental"'));
 assert(out.xml.includes('recordCount="3"'));
 assert(out.xml.includes('reviewVersions="true"'));
 assert(out.xml.includes('reviewVersions="false"'),'Equivalent objects with reordered keys should not count as a conflict');
 assert(out.xml.includes('<serverVersion>'));
 assert(out.xml.includes('<deviceVersion>'));
 assert(out.xml.includes('<pendingChanges>'));
 assert(out.xml.includes('<conflictVersions>'));
 assert(out.xml.includes('&amp; &lt;태그&gt; &apos;큰따옴표&quot;&apos;'));
 assert(out.xml.includes('편지 🌿'));
 assert(!out.xml.includes('<script>'));
 assert(out.xml.includes('<value type="number">0</value>'));
 assert(out.xml.includes('<value type="boolean">false</value>'));
 assert(out.xml.includes('<value nil="true"/>'));
 assert(!out.xml.includes('passphrase'));
 fs.writeFileSync("/tmp/yuha-history-export-fixture.xml",out.xml,"utf8");
 console.log("PASS XML: valid escape, Korean letters, structured scores, both versions, pending/conflicts, privacy");
})();
(function testSleepPartialAndDateValidation(){
 const doc={
  kind:"sleep",scope:"month",firstMonth:"2026-11",lastMonth:"2026-11",
  fields:[{key:"wakeTime",label:"당일 아침 기상"}],
  months:[{month:"2026-11",error:"서버 오프라인",
   device:{"2026-11-01":{wakeTime:"06:30",napStart:"12:30",napEnd:"14:25"},
           "2026-10-30":{wakeTime:"13:00"}},
   pending:{"2026-11-01":{napEnd:{value:"14:25",expectedServerValue:""}}}}]
 };
 const out=x.buildXml({...doc,mode:"partial"});
 assert(!out.complete);assert.equal(out.recordCount,1);
 assert.deepEqual(Array.from(out.failed),["2026-11"]);
 assert(out.xml.includes('category="sleep"'));
 assert(out.xml.includes('scope="month" complete="false"'));
 assert(out.xml.includes('failedMonths="2026-11"'));
 assert(out.xml.includes("napEnd"));
 assert(!out.xml.includes("2026-10-30"));
 assert(out.xml.includes('serverPresent="false" devicePresent="true"'));
 console.log("PASS XML: offline partial exports are visibly incomplete and month-scoped");
})();

(function testSleepObservationsEveryVersion(){
 const date="2026-11-11";
 const sourceRecord={
  bedTime:"20:15",asleepTime:"20:40",wakeTime:"06:10",
  napStart:"12:30",napEnd:"14:00",nap2Start:"",nap2End:"",
  nightWakings:"0",nightAwakeMinutes:"40",napSource:"daycare",
  onsetState:"fussy",specialFlags:"travel,illness",morningCondition:"tired"
 };
 const deviceRecord={...sourceRecord,nightWakings:"2",nightAwakeMinutes:"30",
  napSource:"observed",onsetState:"crying",specialFlags:"unusual",
  morningCondition:"fussy"};
 const doc={kind:"sleep",scope:"month",firstMonth:"2026-11",lastMonth:"2026-11",
  fields:[
   {key:"nightWakings",label:"밤중 각성 횟수"},
   {key:"nightAwakeMinutes",label:"밤중 깨어 있던 총시간"},
   {key:"napSource",label:"낮잠 기록 출처"},
   {key:"onsetState",label:"잠들기 전 상태"},
   {key:"specialFlags",label:"특별한 상황"},
   {key:"morningCondition",label:"아침 컨디션"}
  ],
  months:[{month:"2026-11",
   server:{[date]:sourceRecord},device:{[date]:deviceRecord},
   pending:{[date]:{nightWakings:{value:"3",expectedServerValue:"0"},
    specialFlags:{value:"travel,unusual",expectedServerValue:"travel,illness"}}},
   conflicts:{[date]:{nightAwakeMinutes:{serverValue:"40",deviceValue:"30"}}}
  }]
 };
 const out=x.buildXml(doc);
 assert.equal(out.recordCount,1,"All sources should represent one calendar day");
 for(const sourceName of ["serverVersion","deviceVersion","pendingChanges",
  "conflictServerValue","conflictDeviceValue"])
  assert(out.xml.includes('source="'+sourceName+'"'),"Missing observation source "+sourceName);
 for(const key of ["nightWakings","nightAwakeMinutes","napSource",
  "onsetState","specialFlags","morningCondition"])
  assert(out.xml.includes("<"+key+" label="),"Missing observation "+key);
 for(const snippet of [
  'raw="0">0회','raw="40">40분','raw="30">30분',
  'raw="daycare">어린이집 추정','raw="observed">집에서 직접 관찰',
  'raw="fussy">가벼운 보챔','raw="crying">지속적인 울음',
  'raw="travel,illness">여행, 질병','raw="unusual">특별 일정',
  'raw="tired">피곤해함','raw="fussy">보채거나 예민함',
  'raw="travel,unusual">여행, 특별 일정',
  'dateBasis="morning" recorded="true" unit="count"',
  '<serverVersion>','<deviceVersion>','<pendingChanges>','<conflictVersions>',
  '20:15','20:40','06:10','12:30','14:00'
 ])assert(out.xml.includes(snippet),"Missing sleep XML content: "+snippet);
 // All versions keep the literal original codes as well as human labels.
 assert(out.xml.includes('<value type="string">travel,illness</value>'));
 assert(out.xml.includes('<value type="string">travel,unusual</value>'));
 const zero=x.buildXml({...doc,months:[{month:"2026-11",
  server:{[date]:{nightWakings:"0",nightAwakeMinutes:"0"}},
  device:{[date]:{nightWakings:"",nightAwakeMinutes:""}}}]});
 assert(zero.xml.includes('raw="0">0회'));
 assert(zero.xml.includes('raw="0">0분'));
 assert(!zero.xml.includes('source="deviceVersion"'),"Missing numeric fields must not become observed zero");
 const outside=x.buildXml({...doc,scope:"range",startDate:"2026-11-01",endDate:"2026-11-10"});
 assert(!outside.xml.includes("travel,illness"),"Out-of-range observations must not leak");
 assert.equal(outside.recordCount,0);
 // Save one real sleep XML for the CI parser; retain earlier mental fixture unchanged.
 fs.writeFileSync("/tmp/yuha-sleep-observations.xml",out.xml,"utf8");
 console.log("PASS XML: six sleep observations, labels, 0 vs missing, per-source revisions, time values, exact date filter");
})();

(function testMonthsAndStaticWiring(){
 assert.deepEqual(Array.from(x.monthsBetween("2026-10","2027-02")),
  ["2026-10","2026-11","2026-12","2027-01","2027-02"]);
 assert.throws(()=>x.monthsBetween("2027-02","2026-10"));
 assert.throws(()=>x.monthsBetween("2026-13","2026-14"));
 const page=fs.readFileSync("index.html","utf8");
 const mental=fs.readFileSync("mental.js","utf8");
 const workflow=fs.readFileSync(".github/workflows/pages.yml","utf8");
 assert(page.includes('src="history-export.js?v='));
 assert(page.includes('id="sleepHistoryExport"'));
 assert(mental.includes('id="mentalHistoryExport"'));
 assert(mental.includes('if(!unlocked)return;'));
 assert(mental.includes('authorized:()=>unlocked&&cloudEpoch===epoch&&Boolean(cloudCode)'));
 assert(mental.includes('fetchMonth:k=>mentalFetchExportMonth(k,epoch)'));
 assert(page.includes('fetchMonth:sleepFetchExportMonth'));
 assert(page.includes('localMonth:sleepExportLocalMonth'));
 assert(source.includes('value="all" checked'));
 assert(source.includes('type="month"'));
 assert(source.includes('부분 기록만 다운로드'));
 assert(workflow.includes("node tests/history-export.test.js"));
 assert(workflow.includes("history-export.js public-site/"));
 console.log("PASS XML: all default/month popup, locked mental guard, API/server loading and CI wiring");
})();

(function testPresetsAndExactDayFiltering(){
 const p=x.presetDates;
 assert.deepEqual(JSON.parse(JSON.stringify(p("thisYear","2026-11-11"))),
  {startDate:"2026-01-01",endDate:"2026-11-11",preset:"thisYear"});
 assert.deepEqual(JSON.parse(JSON.stringify(p("last12","2026-11-11"))),
  {startDate:"2025-11-12",endDate:"2026-11-11",preset:"last12"});
 assert.deepEqual(JSON.parse(JSON.stringify(p("last6","2026-11-11"))),
  {startDate:"2026-05-12",endDate:"2026-11-11",preset:"last6"});
 assert.deepEqual(JSON.parse(JSON.stringify(p("last3","2026-11-11"))),
  {startDate:"2026-08-12",endDate:"2026-11-11",preset:"last3"});
 // Month/day clamping around February and leap years.
 assert.equal(p("last12","2024-02-29").startDate,"2023-03-01");
 assert.equal(x.validDate("2026-02-30"),false);
 assert.equal(x.validDate("2024-02-29"),true);
 assert.throws(()=>p("unknown","2026-11-11"));
 const doc={kind:"sleep",scope:"range",firstMonth:"2026-08",lastMonth:"2026-09",
   startDate:"2026-08-15",endDate:"2026-09-02",preset:"custom",
   months:[
    {month:"2026-08",server:{"2026-08-14":{napEnd:"14:00"},"2026-08-15":{napEnd:"14:25"},"2026-08-31":{napEnd:"14:30"}},
     device:{"2026-08-10":{memo:"outside-device-1"},"2026-08-15":{napEnd:"14:25"}},
     pending:{"2026-08-11":{napEnd:{value:"outside-pending-2"}}},
     conflicts:{"2026-08-12":{memo:"outside-conflict-3"}}},
    {month:"2026-09",server:{"2026-09-01":{napEnd:"14:20"},"2026-09-02":{napEnd:"14:10"},"2026-09-03":{napEnd:"14:55"}}}
   ]};
 const result=x.buildXml(doc);
 assert.equal(result.recordCount,4);
 assert(result.xml.includes('startDate="2026-08-15" endDate="2026-09-02"'));
 assert(result.xml.includes('preset="custom"'));
 assert(!result.xml.includes('record date="2026-08-14"'));
 assert(!result.xml.includes('record date="2026-09-03"'));
 assert(!result.xml.includes("outside-device-1"));
 assert(!result.xml.includes("outside-pending-2"));
 assert(!result.xml.includes("outside-conflict-3"));
 assert(result.xml.includes('record date="2026-08-15"'));
 assert(result.xml.includes('record date="2026-09-02"'));
 assert.throws(()=>x.buildXml({...doc,endDate:"2026-02-31"}),/날짜/);
 assert.throws(()=>x.buildXml({...doc,startDate:"2026-09-03",endDate:"2026-09-02"}),/범위/);
 console.log("PASS XML: exact inclusive range, rolling-year/six-/three-month presets and leap-year dates");
})();
