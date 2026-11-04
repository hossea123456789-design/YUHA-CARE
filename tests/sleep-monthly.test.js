const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const src=fs.readFileSync("sleep-monthly.js","utf8");
const sandbox={window:{}};
vm.runInNewContext(src,sandbox,{filename:"sleep-monthly.js"});
const lib=sandbox.window.YuhaSleepMonthly;
assert(lib&&typeof lib.buildMonthlySummary==="function");
const make=(q={},records={},today="2026-10-31",recommendationFor=()=>({min:660,max:840}))=>
 lib.buildMonthlySummary({
  year:2026,month:10,today,
  qualityFor:d=>q[d]||{level:"empty",total:null,night:null,nap:null,latency:null},
  recordFor:d=>records[d]||{},
  recommendationFor
 });
(function testMissingDataNeverMeansZero(){
 const result=make();
 assert.equal(result.completeDays,0);
 assert.equal(result.averageTotal,null);
 assert.equal(result.recommendedCount,0);
 assert.equal(result.completeness,0);
 assert.equal(result.insights[0].kind,"limited");
 console.log("PASS monthly: absent data is unobserved, never 0h sleep");
})();
(function testActualCompleteDatesAndCoverage(){
 const q={};
 for(let i=1;i<=8;i++){
  const d="2026-10-"+String(i).padStart(2,"0");
  q[d]={level:"good",total:i===8?630:720,night:600,nap:i===8?30:120,napCount:1,latency:25};
 }
 q["2026-10-09"]={level:"partial",total:null,night:600,nap:null,napCount:0,latency:null};
 const result=make(q,{},"2026-10-10");
 assert.equal(result.eligible,10);
 assert.equal(result.completeDays,8);
 assert.equal(result.completeness,80);
 assert.equal(result.observedDays,9);
 assert.equal(result.nightSamples,9);
 assert.equal(result.napSamples,8);
 assert.equal(result.recommendedCount,8);
 assert.equal(result.withinCount,7);
 assert.equal(result.belowCount,1);
 assert.equal(result.aboveCount,0);
 assert.equal(result.recommendationPct,88);
 assert.equal(result.averageTotal,709);
 assert.equal(result.averageNight,600);
 assert.equal(result.latencyAverage,25);
 assert.equal(result.insights[0].kind,"positive");
 console.log("PASS monthly: correct denominators, daytime data and guideline compliance");
})();
(function testMixedAgeSpecificRecommendedRanges(){
 const q={
  "2026-10-01":{level:"good",total:690,night:600,nap:90},
  "2026-10-02":{level:"good",total:690,night:600,nap:90}
 };
 const result=make(q,{},"2026-10-02",date=>
  ({min:date.endsWith("-01")?720:660,max:840}));
 assert.equal(result.recommendedCount,2);
 assert.equal(result.withinCount,1);
 assert.equal(result.belowCount,1);
 assert.equal(result.completeDays,2);
 assert.equal(result.insights[0].kind,"limited");
 console.log("PASS monthly: uses actual age-specific recommendation per day");
})();
(function testMidnightAndCrossMonthBelongsToWakeDate(){
 const records={
  "2026-09-30":{asleepTime:"23:50"},
  "2026-10-01":{wakeTime:"06:30",asleepTime:"00:10"},
  "2026-10-02":{wakeTime:"06:45"}
 };
 const q={
  "2026-10-01":{level:"good",total:710,night:610,nap:100},
  "2026-10-02":{level:"good",total:690,night:570,nap:120}
 };
 const result=make(q,records,"2026-10-02");
 assert.equal(result.asleepClock.count,2);
 assert.equal(result.asleepClock.clock,"00:00");
 assert.equal(result.wakeClock.count,2);
 assert.equal(result.completeDays,2);
 console.log("PASS monthly: midnight circular averages, month boundary, wake-day attribution");
})();
(function testNeverIncludeFutureDates(){
 const q={"2026-10-01":{level:"good",total:700,night:600,nap:100},
  "2026-10-09":{level:"good",total:700,night:600,nap:100}};
 const result=make(q,{},"2026-10-03");
 assert.equal(result.eligible,3);
 assert.equal(result.completeDays,1);
 assert.equal(result.completeness,33);
 console.log("PASS monthly: partial current month excludes future records from denominator");
})();
(function testThirtyMinuteSuggestedTimeButPreserveActualEnd(){
 assert.equal(lib.suggestedEnd("08:00","","nap"),"08:30");
 assert.equal(lib.suggestedEnd("08:00","08:00","nap"),"08:30");
 assert.equal(lib.suggestedEnd("08:00","07:30","nap"),"08:30");
 assert.equal(lib.suggestedEnd("08:00","08:25","nap"),"08:25");
 assert.equal(lib.suggestedEnd("23:50","","night"),"00:20");
 assert.equal(lib.suggestedEnd("22:00","22:20","night"),"22:20");
 assert.equal(lib.suggestedEnd("23:50","00:30","night"),"00:30");
 assert.equal(lib.suggestedEnd("23:50","21:00","night"),"00:20");
 console.log("PASS monthly: 30-minute defaults while preserving valid actual sleep timing");
})();
(function testEvidenceAndWiring(){
 const html=fs.readFileSync("index.html","utf8");
 const workflow=fs.readFileSync(".github/workflows/pages.yml","utf8");
 assert(html.includes('src="sleep-monthly.js?'));
 assert(html.includes('id="sleepMonthlySummary"'));
 assert(html.includes("drawSleepMonthlySummary();fetchSleepMonth()"));
 assert(html.includes("pmc.ncbi.nlm.nih.gov/articles/PMC4877308/"));
 assert(html.includes("www.who.int/en/news/item/24-04-2019"));
 assert(workflow.includes("sleep-monthly.js"));
 console.log("PASS monthly: linked assets, research sources and live summary renderer");
})();

(function testRealMonthlyDashboardRendersFromCalculatedEvidence(){
 const html=fs.readFileSync("index.html","utf8");
 const begin=html.indexOf("    function drawSleepMonthlySummary() {");
 const end=html.indexOf("    function renderSleepTab() {",begin);
 assert(begin>=0&&end>begin,"Monthly renderer must be declared before main sleep tab");
 const panel={innerHTML:""};
 const q={"2026-10-01":{level:"good",total:720,night:600,nap:120,napCount:1,latency:30}};
 const mock={
  window:{YuhaSleepMonthly:lib},
  document:{getElementById:id=>id==="sleepMonthlySummary"?panel:null},
  sleepViewYear:2026,sleepViewMonth:10,
  localDateKey:()=>"2026-10-03",
  getSleepQuality:date=>q[date]||{level:"empty",total:null,nap:null,night:null},
  getSleepRecord:()=>({}),sleepRecommendation:()=>({min:660,max:840}),
  escapeHtml:value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
 };
 vm.runInNewContext(html.slice(begin,end)+"\ndrawSleepMonthlySummary();",mock,{filename:"monthly-dom-render.js"});
 assert(panel.innerHTML.includes("월별 수면 리포트"));
 assert(panel.innerHTML.includes("12시간 0분"));
 assert(panel.innerHTML.includes("완성 1/3일"));
 assert(panel.innerHTML.includes("소아 수면 의학·발달 연구 기반 종합 검토"));
 assert(panel.innerHTML.includes("표본 부족"));
 assert(!panel.innerHTML.includes("정상 아동으로 진단"));
 console.log("PASS monthly: actual dashboard DOM renders computed sample and cautious assessment");
})();

(function testActualTimePickerStartEndChaining(){
 const html=fs.readFileSync("index.html","utf8");
 const start=html.indexOf("    const SLEEP_FOLLOWUP_MINUTES=30;");
 const end=html.indexOf("    function napIntervals(row)",start);
 assert(start>=0&&end>start,"Smart time-picker functions must exist in the app");
 const ctx={
  window:{},
  sleepMinutes:value=>{
   if(!/^\d{2}:\d{2}$/.test(value||""))return null;
   const parts=value.split(":").map(Number);
   return parts[0]*60+parts[1];
  }
 };
 vm.runInNewContext(html.slice(start,end)+
   "\nwindow.sleepTimeTest={suggestedSleepTime,sleepClockPlus,sleepFollowupValid};",
   ctx,{filename:"actual-sleep-time-input.js"});
 const ui=ctx.window.sleepTimeTest;
 assert.equal(ui.suggestedSleepTime({napStart:"08:00",napEnd:"08:00"},"napEnd").time,"08:30");
 assert.equal(ui.suggestedSleepTime({napStart:"08:00",napEnd:"08:30"},"napEnd").time,"08:30");
 assert.equal(ui.suggestedSleepTime({bedTime:"23:50",asleepTime:""},"asleepTime").time,"00:20");
 assert.equal(ui.suggestedSleepTime({nap2Start:"15:00",nap2End:"15:00"},"nap2End").time,"15:30");
 console.log("PASS actual sleep modal: 30-minute start/end suggestions and midnight bedtime");
})();
