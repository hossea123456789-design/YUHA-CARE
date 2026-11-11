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
 assert(out.xml.includes('category="sleep" scope="month" complete="false"'));
 assert(out.xml.includes('failedMonths="2026-11"'));
 assert(out.xml.includes("napEnd"));
 assert(!out.xml.includes("2026-10-30"));
 assert(out.xml.includes('serverPresent="false" devicePresent="true"'));
 console.log("PASS XML: offline partial exports are visibly incomplete and month-scoped");
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
