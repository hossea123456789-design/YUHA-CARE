/* Shared checklist conflict reconciliation.
 * The revision timestamp is not an editor identity. A stale revision alone
 * must never trigger a "different device" dialog.
 */
(function(root){
"use strict";
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function signature(value){
 if(value===undefined)return "undefined";
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(signature).join(",")+"]";
 return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+signature(value[k])).join(",")+"}";
}
const same=(a,b)=>signature(a)===signature(b);
function newerLocal(localEditAt,serverRevision){
 const local=Date.parse(String(localEditAt||""));
 const server=Date.parse(String(serverRevision||"").slice(0,24));
 // Legacy device caches had no explicit edit clock. Keep their unsent
 // checked-state input rather than silently throwing it away.
 if(!Number.isFinite(local))return true;
 if(!Number.isFinite(server))return true;
 return local>=server;
}
function reconcile(base,local,remote,options={}){
 const preferLocal=newerLocal(options.localEditAt,options.serverRevision);
 const confirmedTime=Date.parse(String(options.serverRevision||"").slice(0,24));
 const checkedEdits=options.checkedEdits||{};
 let duplicateCollisions=0,independentChanges=0;
 const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
 function resolve(previous,ours,theirs,path=""){
  if(same(ours,theirs))return copy(ours);
  // A deliberate tap can return a checkbox to its original value. A plain
  // three-way diff cannot distinguish that from an untouched stale field,
  // so honor the exact item's recorded tap timestamp before base comparison.
  if(path.endsWith("/checked")&&typeof ours==="boolean"&&typeof theirs==="boolean"){
   const id=path.split("/").at(-2);
   const stamp=Number(checkedEdits[id]||0);
   if(stamp&&Number.isFinite(confirmedTime)){
    const remoteChanged=previous===undefined||!same(theirs,previous);
    if(remoteChanged)return copy(stamp>=confirmedTime?ours:theirs);
   }
  }
  // With no common ancestor these are independent additions, not deletes.
  // Always retain an item that exists on only one side.
  if(previous===undefined){
   if(ours===undefined)return copy(theirs);
   if(theirs===undefined)return copy(ours);
  }
  if(previous!==undefined){
   // With a tracked checkbox click, do not short-circuit an entire parent
   // section just because its final JSON happens to match the old version.
   // Recurse until we reach the exact /<itemId>/checked field and resolve
   // its input clock against the server's timestamp.
   const canDescend=(object(ours)&&object(theirs))||
    (Array.isArray(ours)&&Array.isArray(theirs));
   if(same(ours,previous)&&!(canDescend&&Object.keys(checkedEdits).length))
    return copy(theirs);
   if(same(theirs,previous))return copy(ours);
  }
  // Stable record IDs preserve independent checkbox toggles, additions
  // and structural edits in different sections.
  if(Array.isArray(ours)&&Array.isArray(theirs) &&
   (!previous||Array.isArray(previous))&&
   [...(previous||[]),...ours,...theirs].every(x=>object(x)&&typeof x.id==="string"&&x.id)){
   const before=new Map((previous||[]).map(x=>[x.id,x]));
   const left=new Map(ours.map(x=>[x.id,x]));
   const right=new Map(theirs.map(x=>[x.id,x]));
   if(before.size!==(previous||[]).length||left.size!==ours.length||right.size!==theirs.length)
    throw Error("중복된 체크리스트 항목 ID");
   const order=[...new Set([...theirs.map(x=>x.id),...ours.map(x=>x.id),...before.keys()])];
   return order.map(id=>{
    const old=before.get(id),l=left.get(id),r=right.get(id);
    if(!same(l,r)&&(!old||same(old,l)||same(old,r)))independentChanges++;
    return resolve(old,l,r,path+"/"+id);
   }).filter(x=>x!==undefined);
  }
  if(object(ours)&&object(theirs)&&(!previous||object(previous))){
   const out={};
   for(const key of new Set([...Object.keys(previous||{}),...Object.keys(theirs),...Object.keys(ours)])){
    const resolved=resolve(previous?.[key],ours[key],theirs[key],path+"/"+key);
    if(resolved!==undefined)out[key]=resolved;
   }
   return out;
  }
  // A newer edit to this exact checkbox takes precedence. A previous
  // auto-save can advance the cloud revision without changing this item.
  // A global "last interaction" timestamp is not sufficient to distinguish
  // an unedited stale checkbox from a recently toggled one.
  if(path.endsWith("/checked")&&typeof ours==="boolean"&&typeof theirs==="boolean"){
   const id=path.split("/").at(-2);
   const stamp=Number(checkedEdits[id]||0);
   if(stamp&&Number.isFinite(confirmedTime)){
    duplicateCollisions++;
    return copy(stamp>=confirmedTime?ours:theirs);
   }
   if(previous===undefined){
    // Migrating a legacy dirty cache with no per-item edit clock: retain
    // checked progress on either side. Once we have a baseline, unchecks
    // are tracked precisely just like checks.
    duplicateCollisions++;
    return Boolean(ours||theirs);
   }
  }
  // A delete versus a concurrent edit to the same ID is also a collision.
  duplicateCollisions++;
  return copy(preferLocal?ours:theirs);
 }
 const data=resolve(base===null?undefined:base,local,remote);
 return {data,changedLocal:!same(data,local),changedServer:!same(data,remote),
  duplicateCollisions,independentChanges,preferred:preferLocal?"local":"server"};
}
root.YuhaChecklistReconcile={reconcile,same,signature,newerLocal};
})(window);
