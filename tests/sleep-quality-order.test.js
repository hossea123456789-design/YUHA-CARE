"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8");
const css=fs.readFileSync("design.css","utf8");
const begin=html.indexOf("    function drawSleepObservation(){");
const end=html.indexOf("    function renderSleepTab() {",begin);
assert(begin>=0&&end>begin,"Observation renderer must be present");
const date="2026-11-11";
const stored={
 nightWakings:"2",nightAwakeMinutes:"40",
 morningCondition:"tired",napSource:"daycare",
 onsetState:"crying",specialFlags:"travel"
};
const panel={innerHTML:"",querySelectorAll:()=>[]};
const constants={
 SLEEP_SITUATIONS:{travel:"여행",illness:"질병",unusual:"특별 일정"},
 SLEEP_NAP_SOURCES:{observed:"집에서 직접 관찰",daycare:"어린이집 추정",caregiver:"보호자 전달"},
 SLEEP_ONSET_STATES:{calm:"편안하게 잠듦",fussy:"가벼운 보챔",crying:"지속적인 울음"},
 SLEEP_MORNING_STATES:{bright:"개운하고 활기참",ordinary:"평소와 같음",tired:"피곤해함",fussy:"보채거나 예민함"}
};
const sandbox={
 ...constants,
 document:{getElementById:id=>id==="sleepObservationCard"?panel:null},
 sleepSelectedDate:date,getSleepRecord:d=>d===date?stored:{},
 sleepServerMetaReady:false,sleepSessionOnline:true,
 escapeAttr:v=>String(v).replaceAll("&","&amp;").replaceAll('"',"&quot;"),
 updateSleepField(){throw Error("UI rendering must never save data");},
 alert(){throw Error("Should not show alert during rendering")},
 nightDurationGross:()=>600
};
vm.runInNewContext(html.slice(begin,end)+"\ndrawSleepObservation();",sandbox,
 {filename:"chronological-quality-render.js"});
const markup=panel.innerHTML;
assert(markup.includes("수면 퀄리티 체크"));
assert(markup.includes(date+" · 하루 수면 체크"));
assert(!markup.includes("수면 질·맥락 기록"));
const periods=[...markup.matchAll(/data-sleep-period="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(periods,["overnight","morning","nap","evening"]);
const fields=[...markup.matchAll(/data-sleep-observe="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(fields,["nightWakings","nightAwakeMinutes","morningCondition","napSource","onsetState"]);
assert(markup.indexOf("data-sleep-period=\"overnight\"")<
 markup.indexOf("data-sleep-period=\"morning\""));
assert(markup.indexOf("data-sleep-period=\"morning\"")<
 markup.indexOf("data-sleep-period=\"nap\""));
assert(markup.indexOf("data-sleep-period=\"nap\"")<
 markup.indexOf("data-sleep-period=\"evening\""));
assert(markup.indexOf("data-sleep-special=\"travel\"")>
 markup.indexOf("data-sleep-period=\"evening\""),"Day context belongs after the timeline");
assert(markup.includes("전날 밤 잠든 뒤부터 "+date+" 아침에 일어나기 전까지"));
assert(markup.includes(date+" 기상 직후 컨디션"));
assert(markup.includes(date+" 밤에 잠드는 과정 (다음 날 아침이 아님)"));
assert(markup.includes("내일 아침 밤잠 평가"));
assert(markup.includes('data-sleep-observe="nightWakings"'));
assert(markup.includes('value="2"'));
assert(markup.includes('value="40"'));
assert(markup.includes('<option value="daycare" selected>어린이집 추정</option>'));
assert(markup.includes('<option value="crying" selected>지속적인 울음</option>'));
assert(markup.includes('<option value="tired" selected>피곤해함</option>'));
assert(markup.includes('data-sleep-special="travel" checked'));
assert(markup.includes('Apps Script Code.gs(v3)'),"Existing local-protection message must remain");
console.log("PASS UI: explicit date, overnight → morning → nap → evening → day context");
console.log("PASS UI: selected user-recorded values and local protection notice preserved");
const renderBegin=html.indexOf("    function renderSleepTab() {");
const renderEnd=html.indexOf("    function changeSleepWeek(",renderBegin);
assert(renderBegin>=0&&renderEnd>renderBegin);
const fragment=html.slice(renderBegin,renderEnd);
const t=fragment.indexOf('id="sleepTableWrap"');
const quality=fragment.indexOf('id="sleepObservationCard"');
const monthly=fragment.indexOf('id="sleepMonthlySummary"');
assert(t>=0&&quality>t&&monthly>quality);
assert(fragment.includes('drawSleepObservation();drawSleepMonthlySummary();fetchSleepMonth()'));
assert(css.includes(".sleep-observation-timeline"));
assert(css.includes(".sleep-observation-stage-head"));
console.log("PASS UI: enter sleep times first, chronological quality check second, monthly review third");
