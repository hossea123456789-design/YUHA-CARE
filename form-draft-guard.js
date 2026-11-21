/* YUHA CARE — shared unsaved-form protection.
 * Server callbacks must not rebuild an active input/date-time picker.
 * Capture/restore live controls only for user-initiated rerenders; never
 * use temporary input drafts as confirmed cloud data.
 */
(function(){
"use strict";
let activeTab="",rootNode=null,editing=false,installed=false;
const EDITABLE="input:not([type=hidden]), textarea, select";
function editable(node){
 if(!node||!node.tagName)return false;
 // Explicit AM/PM buttons also start an unsaved form session.
 if(node.dataset?.yuhaEditable==="true")return true;
 const tag=String(node.tagName).toUpperCase();
 if(tag==="TEXTAREA"||tag==="SELECT")return !node.disabled;
 if(tag==="INPUT")return !node.disabled&&!["hidden","submit","button","reset","file"].includes(String(node.type).toLowerCase());
 return false;
}
function contains(root,node){return !!root&&!!node&&!!root.contains?.(node);}
function bind(root,tab){
 if(!root)return;
 if(rootNode!==root){rootNode=root;installed=false;editing=false;}
 if(activeTab!==tab){activeTab=tab;editing=false;}
 if(installed)return;
 installed=true;
 const mark=event=>{
  if(editable(event.target)&&contains(root,event.target))editing=true;
 };
 root.addEventListener("focusin",mark,true);
 root.addEventListener("pointerdown",mark,true);
 root.addEventListener("input",mark,true);
 root.addEventListener("change",mark,true);
 root.addEventListener("submit",()=>{editing=false;},true);
}
function isEditing(root,tab){
 if(!root||tab!==activeTab)return false;
 return editing||(contains(root,document.activeElement)&&editable(document.activeElement));
}
function finish(root,tab){
 if(root===rootNode&&tab===activeTab)editing=false;
}
function capture(root,tab){
 if(!root||!isEditing(root,tab)||!root.querySelectorAll)return null;
 const controls=Array.from(root.querySelectorAll(EDITABLE));
 const details=Array.from(root.querySelectorAll("details"));
 const active=document.activeElement,focusIndex=controls.indexOf(active);
 return {
  tab,episode:root.dataset?.illnessEpisode||"",
  fields:controls.map(el=>({
   name:el.name||"",id:el.id||"",type:el.type||"",
   value:el.value,checked:!!el.checked,
   selected:el.multiple?Array.from(el.options||[]).filter(o=>o.selected).map(o=>o.value):null
  })),
  details:details.map(el=>!!el.open),
  focusIndex,
  selectionStart:focusIndex>=0?getSelection(active,"selectionStart"):null,
  selectionEnd:focusIndex>=0?getSelection(active,"selectionEnd"):null
 };
}
function getSelection(el,key){try{return Number.isInteger(el[key])?el[key]:null;}catch{return null;}}
function restore(root,snapshot){
 if(!root||!snapshot||snapshot.tab!==activeTab||!root.querySelectorAll)return;
 if(snapshot.episode&&root.dataset?.illnessEpisode&&snapshot.episode!==root.dataset.illnessEpisode)return;
 const controls=Array.from(root.querySelectorAll(EDITABLE));
 if(controls.length===snapshot.fields.length){
  controls.forEach((el,index)=>{
   const original=snapshot.fields[index];
   if(el.name!==original.name||el.id!==original.id||String(el.type||"")!==String(original.type||""))return;
   if(["checkbox","radio"].includes(String(el.type).toLowerCase()))el.checked=original.checked;
   else if(el.multiple&&original.selected){
    for(const option of el.options||[])option.selected=original.selected.includes(option.value);
   }else if(el.value!==original.value&&
     (el.tagName==="SELECT"||el.tagName==="TEXTAREA"||el.tagName==="INPUT")){
    // Do not restore a no-longer-available option in changed server lists.
    if(el.tagName==="SELECT"&&!Array.from(el.options||[]).some(o=>o.value===original.value))return;
    el.value=original.value;
   }
  });
  const details=Array.from(root.querySelectorAll("details"));
  if(details.length===snapshot.details.length){
   details.forEach((el,i)=>{el.open=snapshot.details[i];});
  }
  const focus=controls[snapshot.focusIndex];
  if(focus&&focus.isConnected){
   try{focus.focus({preventScroll:true});}catch(_){try{focus.focus();}catch(_){}}
   try{
    if(snapshot.selectionStart!==null&&snapshot.selectionEnd!==null)
      focus.setSelectionRange(snapshot.selectionStart,snapshot.selectionEnd);
   }catch(_){}
  }
 }
}
window.YuhaFormGuard={bind,isEditing,finish,capture,restore};
})();
