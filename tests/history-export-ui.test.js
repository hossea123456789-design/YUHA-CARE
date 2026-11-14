"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const script=fs.readFileSync("history-export.js","utf8");
function fixture(){
 const elements={};
 function el(){
  const handlers={};
  return {handlers,disabled:false,hidden:false,value:"",
   style:{},classList:{add(){},remove(){},toggle(){}},dataset:{},
   addEventListener(type,fn){handlers[type]=fn;},
   click(){handlers.click?.({target:this});},
   remove(){this.removed=true;},
   setAttribute(name,val){this[name]=val;}
  };
 }
 const all=el(),month=el(),range=el(),monthInput=el(),monthRow=el(),rangePanel=el(),dateStart=el(),dateEnd=el();
 const presets=["thisYear","last12","last6","last3","custom"].map(key=>{
  const b=el();b.dataset.preset=key;return b;
 });
 all.value="all";all.checked=true;month.value="month";month.checked=false;
 range.value="range";range.checked=false;
 monthInput.disabled=true;monthInput.value="2026-11";
 const run=el(),partial=el(),again=el(),status=el(),bar=el(),progress=el(),cancel=el();
 partial.hidden=true;again.hidden=true;
 const els={
  '[data-month]':monthInput,'[data-month-row]':monthRow,
  '[data-range-panel]':rangePanel,'[data-start]':dateStart,'[data-end]':dateEnd,
  '[data-run]':run,'[data-partial]':partial,'[data-again]':again,
  '[data-status]':status,'[data-bar]':bar,'[data-progress]':progress
 };
 const cover=el();
 cover.querySelector=name=>els[name];
 cover.querySelectorAll=name=>name==='input[name="historyScope"]'?[all,month,range]:
  name==='[data-preset]'?presets:name==='[data-close]'?[cancel]:[];
 const a=el();let file=null;
 const downloads=[];
 const doc={
  body:{appendChild(){}},
  createElement(tag){return tag==="div"?cover:a;},
  getElementById(){return null;}
 };
 const sandbox={
  window:{},document:doc,Blob,
  URL:{createObjectURL(blob){file=blob;return "blob:fake"},revokeObjectURL(){}},
  setTimeout(){return 1},clearTimeout(){},
  Date
 };
 a.click=()=>downloads.push({name:a.download,file});
 vm.runInNewContext(script,sandbox,{filename:"history-export.js"});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 return {api:sandbox.window.YuhaHistoryExport,cover,all,month,range,monthInput,monthRow,rangePanel,dateStart,dateEnd,presets,run,partial,again,status,
  downloads,flush};
}
(async()=>{
 const f=fixture(),read=[];
 f.api.open({kind:"sleep",month:"2026-11",fromMonth:"2026-10",
  fields:[{key:"wakeTime",label:"기상"}],context:{childBirthDate:"2025-03-23"},
  localMonthKeys:()=>[],localMonth:()=>({records:{}}),
  fetchMonth:async k=>{read.push(k);return {ok:true,records:{[k+"-01"]:{wakeTime:"06:25"}}}}
 });
 assert.equal(f.all.checked,true,"Default selection is ALL");
 assert.equal(f.monthInput.disabled,true,"Month picker disabled until the monthly option is selected");
 f.run.click();await f.flush();await f.flush();
 assert.deepEqual(read,["2026-10","2026-11"]);
 assert.equal(f.downloads.length,1);
 assert.equal(f.again.hidden,false);
 f.again.click();
 assert.equal(f.downloads.length,2,"Explicit user click should re-download without repeating API calls");
 const xml=await f.downloads[0].file.text();
 assert(xml.includes('scope="all" complete="true"'));
 assert(xml.includes('startMonth="2026-10" endMonth="2026-11"'));
 assert(xml.includes("06:25"));assert(xml.includes("childBirthDate"));
 assert(f.downloads[0].name.endsWith(".xml"));
 console.log("PASS popup: defaults to ALL and downloads all months with XML file");
})();
(async()=>{
 const f=fixture(),read=[];
 f.api.open({kind:"sleep",month:"2026-11",fromMonth:"2025-03",
  localMonthKeys:()=>[],localMonth:()=>({records:{}}),
  fetchMonth:async k=>{read.push(k);return {ok:true,records:{}}}
 });
 f.all.checked=false;f.month.checked=true;f.month.handlers.change();
 assert.equal(f.monthInput.disabled,false);
 f.run.click();await f.flush();await f.flush();
 assert.deepEqual(read,["2026-11"]);
 assert.equal(f.downloads.length,1);
 assert((await f.downloads[0].file.text()).includes('scope="month"'));
 assert(f.downloads[0].name.includes("2026-11"),"Month-specific download filename must contain selected month");
 console.log("PASS popup: monthly option reads only the selected month");
})();
(async()=>{
 const f=fixture(),read=[];
 f.api.open({kind:"mental",month:"2026-11",fromMonth:"2026-11",
  localMonthKeys:()=>[],localMonth:()=>({records:{"2026-11-05":{memo:"기기 기록"}}}),
  authorized:()=>true,
  fetchMonth:async k=>{read.push(k);throw Error("접속 불가")}
 });
 f.run.click();await f.flush();await f.flush();
 assert.equal(f.downloads.length,0,"Failed server reads may not silently download an incomplete file");
 assert.equal(f.partial.hidden,false);
 f.partial.click();
 assert.equal(f.downloads.length,1,"Partial download requires separate explicit confirmation");
 const xml=await f.downloads[0].file.text();
 assert(xml.includes('complete="false"'));
 assert(xml.includes('failedMonths="2026-11"'));
 assert(xml.includes("기기 기록"));
 console.log("PASS popup: failed remote reads require explicit partial download");
})();
(async()=>{
 const f=fixture(),read=[];
 f.api.open({kind:"mental",month:"2026-11",fromMonth:"2026-11",
  authorized:()=>false,
  localMonthKeys:()=>[],localMonth:()=>({records:{}}),
  fetchMonth:async k=>{read.push(k);return {ok:true,records:{}}}
 });
 f.run.click();await f.flush();
 assert.equal(f.downloads.length,0);
 assert.equal(read.length,0);
 assert(f.status.textContent.includes("접근 권한"));
 console.log("PASS popup: locked mental data cannot fetch or download");
})();

(async()=>{
 const f=fixture(),read=[];
 f.api.open({kind:"sleep",month:"2026-11",fromMonth:"2025-03",
  localMonthKeys:()=>[],localMonth:()=>({records:{}}),
  fetchMonth:async k=>{
   read.push(k);
   return {ok:true,records:{
    [k+"-01"]:{wakeTime:"06:10"},
    [k+"-15"]:{wakeTime:"06:30"},
    [k+"-28"]:{wakeTime:"06:50"}
   }};
  }
 });
 f.all.checked=false;f.range.checked=true;f.range.handlers.change();
 assert.equal(f.rangePanel.hidden,false);
 assert.equal(f.monthRow.hidden,true);
 assert.equal(f.dateStart.disabled,false);
 const six=f.presets.find(b=>b.dataset.preset==="last6");
 six.click();
 const today=new Date();
 const todayKey=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
 const expected=f.api.presetDates("last6",todayKey);
 assert.equal(f.dateStart.value,expected.startDate);
 assert.equal(f.dateEnd.value,expected.endDate);
 // User edits the preset dates to a day-level range crossing month boundary.
 f.dateStart.value="2026-08-15";f.dateStart.handlers.change();
 f.dateEnd.value="2026-09-02";f.dateEnd.handlers.change();
 f.run.click();await f.flush();await f.flush();
 assert.deepEqual(read,["2026-08","2026-09"]);
 assert.equal(f.downloads.length,1);
 const xml=await f.downloads[0].file.text();
 assert(xml.includes('scope="range"'));
 assert(xml.includes('startDate="2026-08-15" endDate="2026-09-02"'));
 assert(xml.includes('record date="2026-08-15"'));
 assert(xml.includes('record date="2026-08-28"'));
 assert(xml.includes('record date="2026-09-01"'));
 assert(!xml.includes('record date="2026-08-01"'));
 assert(!xml.includes('record date="2026-09-15"'));
 assert(f.downloads[0].name.includes("2026-08-15_to_2026-09-02"));
 console.log("PASS popup: six-month preset autofills days and custom date range exports exact records");
})();
(async()=>{
 const f=fixture(),reads=[];
 f.api.open({kind:"mental",month:"2026-11",fromMonth:"2025-03",
  authorized:()=>true,localMonthKeys:()=>[],localMonth:()=>({records:{}}),
  fetchMonth:async k=>{reads.push(k);return {ok:true,records:{}};}
 });
 f.all.checked=false;f.range.checked=true;f.range.handlers.change();
 f.presets.find(p=>p.dataset.preset==="thisYear").click();
 const now=new Date();
 assert.equal(f.dateStart.value,now.getFullYear()+"-01-01");
 assert.equal(f.dateEnd.value,[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-"));
 // Invalid or reversed dates must not contact the server.
 f.dateStart.value="2026-11-07";f.dateStart.handlers.change();
 f.dateEnd.value="2026-11-02";f.dateEnd.handlers.change();
 f.run.click();await f.flush();
 assert.equal(f.downloads.length,0);
 assert.equal(reads.length,0);
 assert(f.status.textContent.includes("시작일과 종료일"));
 console.log("PASS popup: year-to-date and invalid custom-date protection");
})();


(async function testIllnessExportFetchesOneFullEpisodeSnapshot(){
 const f=fixture();
 let remoteCalls=0,localCalls=0;
 const episode={
  id:"itest_xml",title:"진료 & 발열",onsetAt:"2026-09-20T07:00:00.000Z",
  temperatures:[{id:"it1",at:"2026-11-02T08:20:00.000Z",celsius:38.5,site:"ear"}],
  medicationGroups:[{id:"ig1",name:"같이 먹는 약",deletedAt:"",
   items:[{id:"ix1",name:"약 1",amount:0.3333,unit:"g"}],
   events:[{id:"ie1",at:"2026-11-02T13:20:00.000Z",
    status:"taken",items:[{id:"ix1",name:"약 1",amount:0.3333,unit:"g"}]}]}],
  medications:[]
 };
 f.api.open({kind:"illness",month:"2026-11",fromMonth:"2025-03",
  localIllness:()=>{localCalls++;return {cases:{itest_xml:episode},pending:{},conflicts:{}};},
  fetchIllness:async()=>{remoteCalls++;return {ok:true,schemaVersion:4,cases:{itest_xml:episode}}}
 });
 assert(f.cover.innerHTML.includes("질병·체온·복약"));
 assert(f.cover.innerHTML.includes("XML 파일 자체는 암호화되지"));
 f.run.click();await f.flush();await f.flush();
 assert.equal(remoteCalls,1,"All history illness must fetch complete server episodes once, not per month");
 assert.equal(localCalls,1);
 assert.equal(f.downloads.length,1);
 assert(f.downloads[0].name.includes("illness"));
 const content=await f.downloads[0].file.text();
 assert(content.includes('category="illness"'));
 assert(content.includes('celsius="38.5"'));
 assert(content.includes('amount="0.3333"'));
 assert(content.includes('source="serverVersion"'));
 assert(content.includes('source="deviceVersion"'));
 console.log("PASS XML popup illness: single server request, all-history XML and measured doses");
})();
(async function testIllnessExportUnverifiedServerRequiresPartialAction(){
 const f=fixture(),episode={
  id:"itest_partial",title:"체온 기록",onsetAt:"2026-11-12T09:00:00.000Z",
  temperatures:[{id:"it1",at:"2026-11-12T12:00:00.000Z",celsius:38.7}]
 };
 f.api.open({kind:"illness",month:"2026-11",fromMonth:"2025-03",
  localIllness:()=>({cases:{itest_partial:episode},pending:{},conflicts:{}}),
  fetchIllness:async()=>{throw Error("Apps Script v4 미배포")}
 });
 f.run.click();await f.flush();await f.flush();
 assert.equal(f.downloads.length,0,"Failed server read cannot be silently a complete export");
 assert.equal(f.partial.hidden,false,"Explicit incomplete export option must appear");
 f.partial.click();
 assert.equal(f.downloads.length,1);
 const content=await f.downloads[0].file.text();
 assert(content.includes('category="illness"'));
 assert(content.includes('complete="false"'));
 assert(content.includes('devicePresent="true"'));
 assert(f.downloads[0].name.includes("partial"));
 console.log("PASS XML popup illness: unverified server requires explicit partial export");
})();
