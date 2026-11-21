"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const script=fs.readFileSync("time-picker-ui.js","utf8");
const css=fs.readFileSync("time-picker-ui.css","utf8");
const illness=fs.readFileSync("illness-care.js","utf8");
const index=fs.readFileSync("index.html","utf8");
let globalDocument=null;
class FakeEvent{
 constructor(type,{bubbles=false}={}){this.type=type;this.bubbles=bubbles;}
 preventDefault(){this.prevented=true;}
 stopPropagation(){this.stopped=true;}
}
class Element{
 constructor(tagName,doc){
  this.tagName=tagName.toUpperCase();this.ownerDocument=doc;this.dataset={};
  this.value="";this.type="";this.name="";this.required=false;this.hidden=false;
  this.children=[];this.events={};this.attributes={};this.options=[];
  this.className="";this.classList={add:name=>this.className+=" "+name};
 }
 append(...els){
  for(const el of els){this.children.push(el);el.parentElement=this;
   if(this.tagName==="SELECT"&&el.tagName==="OPTION")this.options.push(el);}
 }
 setAttribute(name,value){this.attributes[name]=String(value);}
 getAttribute(name){return this.attributes[name];}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
 dispatchEvent(event){for(const fn of this.events[event.type]||[])fn(event);return true;}
 closest(){return null;}
 matches(selector){return this.tagName==="INPUT"&&
   ["datetime-local","time"].includes(this.type)&&selector.includes("datetime-local");}
 insertAdjacentElement(where,el){assert.equal(where,"afterend");this.inserted=el;}
}
const doc={createElement:tag=>new Element(tag,doc)};
const win={document:doc};
vm.runInNewContext(script,{window:win,document:doc,Date,JSON,String,Number,Array,Object,Event:FakeEvent});
const picker=win.YuhaTimePicker;
assert(picker);
const simple=v=>JSON.parse(JSON.stringify(v));
assert.deepEqual(simple(picker.parseClock("2026-11-21T00:00",true)),
 {date:"2026-11-21",period:"am",hour:12,minute:0});
assert.deepEqual(simple(picker.parseClock("2026-11-21T12:30",true)),
 {date:"2026-11-21",period:"pm",hour:12,minute:30});
assert.deepEqual(simple(picker.parseClock("23:59",false)),
 {date:"",period:"pm",hour:11,minute:59});
assert.equal(picker.composeClock("2026-11-21","am",12,0,true),"2026-11-21T00:00");
assert.equal(picker.composeClock("2026-11-21","pm",12,0,true),"2026-11-21T12:00");
assert.equal(picker.composeClock("2026-11-21","pm",9,37,true),"2026-11-21T21:37");
assert.equal(picker.composeClock("","pm",9,37,false),"21:37");
assert.equal(picker.composeClock("","am",9,37,true),"","invalid date must not fabricate a date");
assert.equal(picker.parseClock("12:99",false),null,"invalid minutes rejected");
console.log("PASS time: 12 AM midnight, 12 PM noon, 24h roundtrip and validation");
function field(type,name,value,required=true){
 const el=new Element("input",doc);el.type=type;el.name=name;el.value=value;el.required=required;
 return el;
}
function tap(button){button.dispatchEvent(new FakeEvent("click"));}
(function testMedicationAndTemperatureUI(){
 const dose=field("datetime-local","at","2026-11-21T09:25");
 assert.equal(picker.enhance(dose),1);
 assert.equal(picker.enhance(dose),0,"cannot duplicate picker on repeated render");
 assert.equal(dose.name,"at","form submission field name remains unchanged");
 assert.equal(dose.hidden,true);
 const ui=dose._yuhaTimeControls;
 assert.equal(ui.hour.tagName,"INPUT");
 assert.equal(ui.minute.tagName,"INPUT");
 assert.equal(ui.hour.type,"text");
 assert.equal(ui.minute.type,"text");
 assert.equal(ui.hour.inputMode,"numeric");
 assert.equal(ui.minute.inputMode,"numeric");
 const allNodes=(node)=>[node,...(node.children||[]).flatMap(allNodes)];
 assert(!allNodes(ui.ui).some(n=>n.tagName==="SELECT"),
  "Neither hour nor minute may open a fullscreen native mobile dropdown");
 const hourButtons=ui.hour.parentElement.children, minuteButtons=ui.minute.parentElement.children;
 assert.equal(hourButtons[0].dataset.timeStep,"minus");
 assert.equal(hourButtons[2].dataset.timeStep,"plus");
 assert.equal(ui.dateInput.required,true,"native required moves to visible date input");
 assert.equal(ui.buttons.am.button.getAttribute("aria-pressed"),"true");
 assert.equal(ui.buttons.pm.button.getAttribute("aria-pressed"),"false");
 assert(ui.buttons.am.status.textContent.includes("✓ 선택됨"));
 assert(ui.status.textContent.includes("오전 09:25"));
 assert(ui.buttons.am.button.dataset.yuhaEditable==="true",
  "AM/PM tap is an active unsaved draft; cloud refresh must not reset it");
 tap(ui.buttons.pm.button);
 assert.equal(dose.value,"2026-11-21T21:25");
 assert.equal(ui.buttons.pm.button.getAttribute("aria-pressed"),"true");
 assert(ui.buttons.pm.status.textContent.includes("✓ 선택됨"));
 assert(ui.status.textContent.includes("오후 09:25"));
 ui.hour.value="12";ui.minute.value="05";
 ui.hour.dispatchEvent(new FakeEvent("change"));
 assert.equal(dose.value,"2026-11-21T12:05","12 PM is 12:xx not 00:xx");
 tap(ui.buttons.am.button);
 assert.equal(dose.value,"2026-11-21T00:05","12 AM is 00:xx");
 tap(hourButtons[2]);
 assert.equal(dose.value,"2026-11-21T01:05","hour + wraps 12 to 1");
 tap(hourButtons[0]);
 assert.equal(dose.value,"2026-11-21T00:05","hour - wraps 1 to 12");
 ui.minute.value="59";ui.minute.dispatchEvent(new FakeEvent("change"));
 tap(minuteButtons[2]);
 assert.equal(dose.value,"2026-11-21T00:00","minute + wraps 59 to 00");
 tap(minuteButtons[0]);
 assert.equal(dose.value,"2026-11-21T00:59","minute - wraps 00 to 59");
 ui.minute.value="99";ui.minute.dispatchEvent(new FakeEvent("input"));
 assert.equal(dose.value,"","invalid minute cannot silently save prior time");
 assert.equal(ui.minute.getAttribute("aria-invalid"),"true");
 assert(ui.status.textContent.includes("00–59"),"invalid minute has inline feedback");
 ui.minute.value="43";ui.minute.dispatchEvent(new FakeEvent("input"));
 assert.equal(dose.value,"2026-11-21T00:43","valid correction restores form value");
 dose.value="2026-11-21T23:43";
 assert.equal(picker.sync(dose),true);
 assert.equal(ui.buttons.pm.button.getAttribute("aria-pressed"),"true");
 assert.equal(ui.hour.value,"11");assert.equal(ui.minute.value,"43");
 assert(ui.status.textContent.includes("오후 11:43"),"now button changes displayed time");
 console.log("PASS time: selected state, aria-pressed, text checkmark, preview and dose-now sync");
})();
(function testTemperatureAndOptionalEndDate(){
 const temp=field("datetime-local","at","2026-11-21T18:45");
 picker.enhance(temp);
 const ui=temp._yuhaTimeControls;
 assert(ui.status.textContent.includes("오후 06:45"));
 ui.dateInput.value="2026-11-20";
 ui.dateInput.dispatchEvent(new FakeEvent("change"));
 assert.equal(temp.value,"2026-11-20T18:45","date change retains exact hour/minute");
 ui.minute.value="37";ui.minute.dispatchEvent(new FakeEvent("change"));
 assert.equal(temp.value,"2026-11-20T18:37");
 const optional=field("datetime-local","endsAt","",false);
 picker.enhance(optional);
 assert.equal(optional.value,"","optional end date never filled automatically");
 tap(optional._yuhaTimeControls.buttons.pm.button);
 assert.equal(optional.value,"","period alone cannot invent an end date");
 optional._yuhaTimeControls.dateInput.value="2026-11-22";
 optional._yuhaTimeControls.dateInput.dispatchEvent(new FakeEvent("change"));
 assert.equal(optional.value,"2026-11-22T21:00","optional end set only when user supplies a date");
 console.log("PASS time: fever timestamp remains stable; optional time does not save accidentally");
})();
(function testSleepTimeModal(){
 const input=field("time","sleepModalInput","21:08",false);
 picker.enhance(input);
 const ui=input._yuhaTimeControls;
 assert.equal(ui.buttons.pm.button.getAttribute("aria-pressed"),"true");
 assert(ui.status.textContent.includes("오후 09:08"));
 tap(ui.buttons.am.button);
 assert.equal(input.value,"09:08","existing sleep flow still gets HH:mm");
 input.value="07:25";picker.sync(input);
 assert(ui.status.textContent.includes("오전 07:25"));
 assert(index.includes("window.YuhaTimePicker?.enhance(sleepTimeField)"));
 assert(index.includes("window.YuhaTimePicker?.sync(sleepTimeField)"));
 console.log("PASS time: sleep modal syncs 12h selections to existing time-only input");
})();
assert(illness.includes("window.YuhaTimePicker?.enhance(root)"));
assert(illness.includes("window.YuhaTimePicker?.refresh(root)"));
assert(index.includes("time-picker-ui.js?v=")&&index.includes("time-picker-ui.css?v="));
assert(css.includes('.yuha-time-period-btn[data-selected="true"]'));
assert(css.includes('border:2px solid #083c31')&&css.includes("✓ 선택됨")===false,
 "selection has a bold border and a separate JS-generated check mark");
assert(!script.includes('doc.createElement("select")'),
 "time controls must never use fullscreen native hour/minute dropdowns");
assert(css.includes("height:40px")&&css.includes("min-height:37px"),
 "compact mobile stepper and AM/PM buttons must replace tall UI");
assert(script.includes('mark.textContent=active?"✓ 선택됨":"선택"'));
console.log("PASS time picker: integration and unmistakable selected-state styles");
