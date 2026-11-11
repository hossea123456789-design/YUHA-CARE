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
   style:{},classList:{add(){},remove(){}},dataset:{},
   addEventListener(type,fn){handlers[type]=fn;},
   click(){handlers.click?.({target:this});},
   remove(){this.removed=true;},
   setAttribute(name,val){this[name]=val;}
  };
 }
 const all=el(),month=el(),monthInput=el();
 all.value="all";all.checked=true;month.value="month";month.checked=false;
 monthInput.disabled=true;monthInput.value="2026-11";
 const run=el(),partial=el(),status=el(),bar=el(),progress=el(),cancel=el();
 partial.hidden=true;
 const els={
  '[data-month]':monthInput,'[data-run]':run,'[data-partial]':partial,
  '[data-status]':status,'[data-bar]':bar,'[data-progress]':progress
 };
 const cover=el();
 cover.querySelector=name=>els[name];
 cover.querySelectorAll=name=>name==='input[name="historyScope"]'?[all,month]:
  name==='[data-close]'?[cancel]:[];
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
 return {api:sandbox.window.YuhaHistoryExport,cover,all,month,monthInput,run,partial,status,
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
