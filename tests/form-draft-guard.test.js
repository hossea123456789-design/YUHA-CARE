'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('form-draft-guard.js','utf8');
const illness=fs.readFileSync('illness-care.js','utf8');
const mental=fs.readFileSync('mental.js','utf8');
const index=fs.readFileSync('index.html','utf8');
let activeElement=null;
let controls=[],details=[];
const root={
 dataset:{illnessEpisode:'iread_1'},innerHTML:'',handlers:{},
 contains(node){return !!node&&node.inRoot===true;},
 addEventListener(type,handler){(this.handlers[type]??=[]).push(handler);},
 querySelectorAll(selector){
  if(selector==='details')return details;
  if(selector.includes('input'))return controls;
  return [];
 },
 querySelector(){return null;},
 dispatch(type,target){for(const fn of this.handlers[type]||[])fn({target});}
};
const doc={get activeElement(){return activeElement;},getElementById(id){return id==='main'?root:null;},
 addEventListener(){}};
const win={addEventListener(){},confirm(){return true;}};
const store=new Map();
const ctx={
 window:win,document:doc,Date,Math,JSON,Number,Intl,console,
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
 setInterval(){return 1},clearInterval(){},setTimeout(){return 1},clearTimeout(){},
 FormData:class {constructor(f){this.values=f.values||{}}get(k){return this.values[k]||null}getAll(k){return this.values[k]||[]}}
};
vm.runInNewContext(source,ctx,{filename:'form-draft-guard.js'});
const guard=win.YuhaFormGuard;
assert(guard,'the shared editing guard must load');
function field({name,type='text',value='',tagName='INPUT',checked=false,id='',options=[]}){
 return {name,type,value,tagName,id,checked,options,inRoot:true,isConnected:true,
  focus(){activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
  selectionStart:0,selectionEnd:0};
}
(function testMedicineAndTemperaturePickerUninterrupted(){
 const drug=field({name:'groupId',tagName:'SELECT',type:'select-one',value:'group_two',
  options:[{value:'group_one'},{value:'group_two'}]});
 const temp=field({name:'celsius',value:'38.5'});
 const at=field({name:'at',type:'datetime-local',value:'2026-11-18T19:35'});
 controls=[drug,temp,at];
 details=[{open:true}];
 guard.bind(root,'illness');
 activeElement=drug;root.dispatch('focusin',drug);
 assert.equal(guard.isEditing(root,'illness'),true,'medicine selection starts draft protection');
 root.dispatch('change',drug);
 activeElement=at;root.dispatch('focusin',at);
 const snap=guard.capture(root,'illness');
 assert(snap&&snap.fields[0].value==='group_two'&&snap.fields[1].value==='38.5',
  'all medicine/temperature fields survive a rerender snapshot');
 // On iOS a date picker may hide focus while the native time wheel is open.
 activeElement=null;
 assert(guard.isEditing(root,'illness'),
  'native date/time overlay must not permit a background redraw');
 const drug2=field({name:'groupId',tagName:'SELECT',type:'select-one',value:'group_one',
  options:[{value:'group_one'},{value:'group_two'}]});
 const temp2=field({name:'celsius',value:''});
 const at2=field({name:'at',type:'datetime-local',value:'2026-11-18T20:01'});
 controls=[drug2,temp2,at2];details=[{open:false}];
 guard.restore(root,snap);
 assert.equal(drug2.value,'group_two');
 assert.equal(temp2.value,'38.5');
 assert.equal(at2.value,'2026-11-18T19:35');
 assert.equal(details[0].open,true,'expanded editor retains open state');
 root.dispatch('submit',{tagName:'FORM'});
 activeElement=null;
 assert.equal(guard.isEditing(root,'illness'),false,'submitting clears edit session');
 console.log('PASS draft guard: medicine, fever, date picker, focus and expanded editor preserved');
})();
(function testEveryTabUsesSameGuard(){
 for(const tab of ['sleep','mental','settings','daycare','outing','daily','weekly']){
  guard.bind(root,tab);
  assert.equal(guard.isEditing(root,tab),false,'switching tab clears previous editor state');
  const input=field({name:tab+'Note',value:'보관할 임시 입력'});
  activeElement=input;controls=[input];
  root.dispatch('focusin',input);
  assert.equal(guard.isEditing(root,tab),true,'all tabs must protect active drafts: '+tab);
  activeElement=null;guard.finish(root,tab);
 }
 console.log('PASS draft guard: all eight tabs support the same edit protection');
})();
(function testIllnessAsyncRerenderDoesNotTouchEditingDOM(){
 guard.bind(root,'illness');
 activeElement=null;
 controls=[field({name:'celsius',value:'38.5'})];root.dispatch('focusin',controls[0]);
 const tempBody='환자 입력 38.5℃ · 날짜 선택 중';
 root.innerHTML=tempBody;
 vm.runInNewContext(illness,ctx,{filename:'illness-care.js'});
 // The illness module uses a real delegated submit, but an active draft still
 // blocks its background render; no DOM update can close the time picker.
 win.YuhaIllness.render({background:true});
 assert.equal(root.innerHTML,tempBody,'background response must not replace active input DOM');
 activeElement=null;guard.finish(root,'illness');
 win.YuhaIllness.render({background:true});
 assert.notEqual(root.innerHTML,tempBody,'the view may redraw after explicit save/finish');
 assert(index.includes('render({background:true})'),
  'checklist callback must request a draft-safe redraw');
 assert(index.includes('renderSleepTab({background:true})'),
  'sleep callbacks must request a draft-safe redraw');
 assert(mental.includes('render({background:true})'),
  'mental callbacks must request a draft-safe redraw');
 assert(illness.includes('render({background:true})'),
  'illness callbacks must request a draft-safe redraw');
 console.log('PASS background sync: active medicine/temperature DOM is not torn down');
})();
console.log('PASS shared draft protection regression suite');
