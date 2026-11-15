"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const KEY="yuha_care_last_tab_device_v1";
const initStart=html.indexOf('    const CLIENT_CACHE_KEY = "yuha_shared_checklist_client_cache_v1";');
const initEnd=html.indexOf("    let editing = ",initStart);
const navStart=html.indexOf("    function activateTab(tabKey)");
const navEnd=html.indexOf("    function renderTabs()",navStart);
assert(initStart>=0&&initEnd>initStart&&navStart>initEnd&&navEnd>navStart,
 "Startup and navigation source blocks must remain testable");
const init=html.slice(initStart,initEnd);
const activate=html.slice(navStart,navEnd);
assert(init.includes(KEY),"Device local key must be distinct from shared checklist cache");
assert(!init.includes("google.script")&&!activate.includes("google.script"),
 "Last-tab preference must not be uploaded to shared Google Sheets");

function browser(store,opts={}){
 const calls={renders:0,locks:0,stops:0,writes:0};
 const localStorage={
  getItem(key){if(opts.blocked)throw Error("storage unavailable");return store.get(key)??null;},
  setItem(key,value){if(opts.blocked)throw Error("storage unavailable");calls.writes++;store.set(key,String(value));}
 };
 const sandbox={localStorage,window:{
  YuhaMental:{lock(){calls.locks++;}},
  YuhaIllness:{stop(){calls.stops++;}}
 }};
 const api=vm.runInNewContext(
  'function render(){window.__renders=(window.__renders||0)+1;}\n'+
  init+'\n'+activate+
  '\n({current:()=>currentTab,choose:activateTab,allowed:tabOrder,reads:readLastVisitedTab})',
  sandbox,{filename:"index.html:last-tab"}
 );
 return {api,calls,sandbox};
}
{
 const d1=new Map(),d2=new Map();
 const first=browser(d1);const second=browser(d2);
 assert.equal(first.api.current(),"daycare","First-ever load keeps default daycare tab");
 assert.equal(first.calls.writes,0,"Startup must not overwrite an existing choice");
 assert.equal(first.api.choose("sleep"),true);
 assert.equal(first.api.current(),"sleep");
 assert.equal(d1.get(KEY),"sleep");
 assert.equal(first.sandbox.window.__renders,1);
 assert.equal(second.api.current(),"daycare","Other device must have independent tab");
 assert.equal(second.api.choose("illness"),true);
 assert.equal(d2.get(KEY),"illness");
 assert.equal(browser(d1).api.current(),"sleep","Same device restores last selected tab");
 assert.equal(browser(d2).api.current(),"illness","Other device restores its own tab");
 console.log("PASS last tab persists independently for multiple devices");
}
{
 const m=new Map([[KEY,"mental"]]);
 const b=browser(m);
 assert.equal(b.api.current(),"mental");
 assert.equal(b.api.choose("illness"),true);
 assert.equal(b.calls.locks,1,"Leaving wife recovery must still lock the PIN");
 assert.equal(b.api.choose("sleep"),true);
 assert.equal(b.calls.stops,1,"Leaving illness must still stop its timer");
 assert.equal(b.api.choose("sleep"),false,"Clicking active tab is a no-op");
 assert.equal(b.api.choose("invalid"),false,"Unknown tab may not replace preference");
 assert.equal(m.get(KEY),"sleep");
 const bad=browser(new Map([[KEY,"outdated-tab"]]));
 assert.equal(bad.api.current(),"daycare");
 assert.equal(bad.calls.writes,0,"Invalid stored key must not be overwritten on read");
 const blocked=browser(new Map(),{blocked:true});
 assert.equal(blocked.api.current(),"daycare");
 assert.equal(blocked.api.choose("weekly"),true,"Blocked storage cannot disable navigation");
 console.log("PASS PIN lock, illness lifecycle and invalid/blocked-storage handling");
}
assert(/activateTab\(document\.getElementById\("sectionTabSelect"\)\.value\)/.test(html),
 "Settings Tab View must save last tab using the same navigation path");
assert(/if \(!activateTab\(tabKey\)\) return;/.test(html),
 "Normal tab buttons must use shared persisted navigation");

const match=html.match(/<!-- 데이터 동기화 이전에[^\n]* -->\s*<script>([\s\S]*?)<\/script>/);
assert(match,"Immediate cached bootstrap must be present");
function bootstrap(last,withCache=true){
 const map=new Map();
 if(last!==null)map.set(KEY,last);
 if(withCache)map.set("yuha_shared_checklist_client_cache_v1",JSON.stringify({
  data:{
   daycare:{label:"얼집",title:"얼집 준비물",sections:[{title:"등원",items:[{text:"물통",checked:true}]}]},
   outing:{label:"외출",title:"외출 준비물",sections:[{title:"외출 가방",items:[{text:"기저귀",checked:false}]}]},
   daily:{label:"매일 청소",title:"매일 청소",sections:[]},
   weekly:{label:"주말 청소",title:"주말 청소",sections:[]}
  }
 }));
 const nodes=new Map();
 const getNode=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:"",textContent:"",style:{},dataset:{},attributes:{},
   setAttribute(name,value){this.attributes[name]=value;}});
  return nodes.get(id);
 };
 let hasNoChecklistProgress=false;
 const document={
  querySelector(name){assert.equal(name,"header");return {classList:{toggle(cls,on){
    assert.equal(cls,"no-checklist-progress");hasNoChecklistProgress=on;
  }}};},
  getElementById:getNode
 };
 vm.runInNewContext(match[1],{
  localStorage:{getItem(key){return map.get(key)??null;}},document
 },{filename:"index.html:bootstrap"});
 return {nodes,getNode,hasNoChecklistProgress};
}
{
 const outing=bootstrap("outing");
 assert(outing.getNode("main").innerHTML.includes("외출 준비물"));
 assert(outing.getNode("main").innerHTML.includes("기저귀"));
 assert(!outing.getNode("main").innerHTML.includes("물통"));
 assert(outing.getNode("tabs").innerHTML.includes('class="tab-btn active" disabled>외출'));
 assert.equal(outing.hasNoChecklistProgress,false);
 const mental=bootstrap("mental");
 assert(mental.getNode("main").innerHTML.includes("아내 회복"));
 assert(!mental.getNode("main").innerHTML.includes("물통"),
  "Sensitive tab startup must not flash daycare checklist");
 assert.equal(mental.hasNoChecklistProgress,true);
 const sleep=bootstrap("sleep",false);
 assert(sleep.getNode("main").innerHTML.includes("수면 기록"),
  "No checklist cache must still display correct last-tab splash");
 assert(!sleep.getNode("main").innerHTML.includes("얼집"));
 const invalid=bootstrap("does-not-exist");
 assert(invalid.getNode("main").innerHTML.includes("얼집 준비물"));
 console.log("PASS startup preview matches saved tab and does not flash daycare");
}
console.log("PASS device-local last visited tab regression suite");
