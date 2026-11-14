/* YUHA-CARE · Child illness journal.
 * No medicine/dose/interval is inferred. Timing is informational, only from a
 * caregiver-entered prescription. Offline-first, same shared app DB connection.
 * No background notifications or automated treatment/stop decisions. */
(function(){
"use strict";
const STORE="yuha_illness_records_v1",QUEUE="yuha_illness_pending_v1";
const CONFLICT="yuha_illness_conflicts_v1",SNAPSHOTS="yuha_illness_snapshots_v1";
const SITES={ear:"귀",armpit:"겨드랑이",forehead:"이마",rectal:"직장",oral:"입",other:"기타"};
const CATEGORIES={acetaminophen:"해열·진통(아세트아미노펜 계열)",ibuprofen:"해열·진통(이부프로펜 계열)",antibiotic:"항생제",antihistamine:"항히스타민",cough:"기침·가래약",respiratory:"호흡기·비강 약",gastro:"소화기 약",other:"기타 / 직접 입력"};
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nowIso=()=>new Date().toISOString();
const newId=()=> "i"+(Date.now().toString(36))+"_"+(typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,"").slice(0,12):Math.random().toString(36).slice(2,15));
const isTime=x=>typeof x==="string"&&!Number.isNaN(new Date(x).getTime())&&/^\d{4}-\d{2}-\d{2}T/.test(x);
const at=x=>isTime(x)?new Date(x).getTime():NaN;
const hoursBetween=(a,b)=>(at(b)-at(a))/3600000;
const localInput=x=>{
 const d=isTime(x)?new Date(x):new Date(),p=n=>String(n).padStart(2,"0");
 return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());
};
const inputTime=x=>{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(x||"")))throw Error("날짜와 시각을 선택해 주세요.");
 const d=new Date(x);if(Number.isNaN(d.getTime()))throw Error("날짜·시간 형식이 올바르지 않습니다.");
 return d.toISOString();
};
const displayTime=x=>isTime(x)?new Date(x).toLocaleString("ko-KR",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const fullDate=x=>isTime(x)?new Date(x).toLocaleDateString("ko-KR",{year:"numeric",month:"short",day:"numeric"}):"—";
const dayKey=x=>{
 if(!isTime(x))return "";
 const d=new Date(x),p=n=>String(n).padStart(2,"0");
 return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
};
const isoMonth=x=>dayKey(x).slice(0,7);
const num=(v,defaultValue=null)=>v!==""&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):defaultValue;
// Quick temperature: 385 -> 38.5℃, 38 -> 38.0℃, 38.5 -> 38.5℃.
// Other formats are rejected, never guessed.
function parseTemperature(raw){
 const input=String(raw??"").trim();
 let n;
 if(/^\d{3}$/.test(input))n=Number(input)/10;
 else if(/^\d{2}(?:\.\d)?$/.test(input))n=Number(input);
 else return null;
 return n>=30&&n<=43?n:null;
}
// Show the converted temperature IN the input as soon as 3 digits are entered.
// Keep 2 digits untouched during typing, allowing 385 to be entered naturally.
function formatTemperatureInput(raw,finalize=false){
 const text=String(raw??"");
 const n=parseTemperature(text);
 if(n===null)return text;
 if(/^\d{3}$/.test(text)||(finalize&&/^\d{2}$/.test(text)))return n.toFixed(1);
 return text;
}
const MED_UNITS=["mL","g","포","정","방울"];
const decimalPlaces=value=>String(value??"").split(".")[1]?.length||0;
// Manual amounts support two decimal places. For an exact prescription like
// 0.3333g, preserve four places rather than silently rounding to 0.33g.
function validAmount(value,unit="mL"){
 const n=num(value);
 if(n===null||n<=0||n>100||!MED_UNITS.includes(unit))return false;
 return decimalPlaces(value)<=(unit==="g"?4:2);
}
function doseLabel(v,unit){return String(v)+(MED_UNITS.includes(unit)?unit:"mL")}
const cleanText=(v,n=200)=>String(v??"").slice(0,n);
const parseStore=(key,fallback)=>{try{const obj=JSON.parse(localStorage.getItem(key)||"null");return obj&&typeof obj==="object"?obj:fallback;}catch{return fallback;}};
const clone=x=>JSON.parse(JSON.stringify(x));
const medicineOpts=(selected="other")=>Object.entries(CATEGORIES).map(([v,n])=>'<option value="'+v+'"'+(v===selected?' selected':'')+'>'+E(n)+'</option>').join("");
const siteOpts=(selected="ear")=>Object.entries(SITES).map(([v,n])=>'<option value="'+v+'"'+(v===selected?' selected':'')+'>'+E(n)+'</option>').join("");
const attr=x=>E(x);
function normalize(source){
 const c=source&&typeof source==="object"?source:{};
 return {id:cleanText(c.id,60),title:cleanText(c.title,80),
  onsetAt:isTime(c.onsetAt)?c.onsetAt:nowIso(),
  symptoms:cleanText(c.symptoms,350),note:cleanText(c.note,1000),
  status:c.status==="closed"?"closed":"active",
  closedAt:isTime(c.closedAt)?c.closedAt:"",
  recoveryConfirmed:c.recoveryConfirmed===true,
  noFurtherMedicationConfirmed:c.noFurtherMedicationConfirmed===true,
  closureNote:cleanText(c.closureNote,500),
  visits:Array.isArray(c.visits)?c.visits.map(v=>({
   id:cleanText(v.id,60),at:isTime(v.at)?v.at:nowIso(),hospital:cleanText(v.hospital,120),
   diagnosis:cleanText(v.diagnosis,200),notes:cleanText(v.notes,500)})):[],
  medications:Array.isArray(c.medications)?c.medications.map(m=>({
   id:cleanText(m.id,60),visitId:cleanText(m.visitId,60),
   category:CATEGORIES[m.category]?m.category:"other",name:cleanText(m.name,120),
   ingredient:cleanText(m.ingredient,120),formulation:cleanText(m.formulation,120),
   mode:m.mode==="prn"?"prn":"scheduled",doseMl:num(m.doseMl),
   intervalHours:num(m.intervalHours),endsAt:isTime(m.endsAt)?m.endsAt:"",
   instructions:cleanText(m.instructions,500),active:m.active!==false,
   doses:Array.isArray(m.doses)?m.doses.map(d=>({
    id:cleanText(d.id,60),at:isTime(d.at)?d.at:nowIso(),
    status:d.status==="skipped"?"skipped":"taken",amountMl:num(d.amountMl),
    note:cleanText(d.note,300),scheduledFor:isTime(d.scheduledFor)?d.scheduledFor:""
   })):[]})):[],
  medicationGroups:Array.isArray(c.medicationGroups)?c.medicationGroups.map(g=>({
   id:cleanText(g.id,60),name:cleanText(g.name,80),
   visitId:cleanText(g.visitId,60),
   mode:g.mode==="prn"?"prn":"scheduled",intervalHours:num(g.intervalHours),
   endsAt:isTime(g.endsAt)?g.endsAt:"",active:g.active!==false,
   deletedAt:isTime(g.deletedAt)?g.deletedAt:"",
   timesPerDay:num(g.timesPerDay),days:num(g.days),
   sourceDate:cleanText(g.sourceDate,10),sourceKind:cleanText(g.sourceKind,35),
   items:Array.isArray(g.items)?g.items.map(item=>({
    id:cleanText(item.id,60),name:cleanText(item.name,120),
    amount:num(item.amount),unit:MED_UNITS.includes(item.unit)?item.unit:"mL"
   })):[],
   events:Array.isArray(g.events)?g.events.map(d=>({
    id:cleanText(d.id,60),at:isTime(d.at)?d.at:nowIso(),
    status:d.status==="skipped"?"skipped":"taken",
    note:cleanText(d.note,300),scheduledFor:isTime(d.scheduledFor)?d.scheduledFor:"",
    items:Array.isArray(d.items)?d.items.map(item=>({
     id:cleanText(item.id,60),name:cleanText(item.name,120),
     amount:num(item.amount),unit:MED_UNITS.includes(item.unit)?item.unit:"mL"
    })):[] 
   })):[]
  })):[],
  temperatures:Array.isArray(c.temperatures)?c.temperatures.map(t=>({
   id:cleanText(t.id,60),at:isTime(t.at)?t.at:nowIso(),
   celsius:num(t.celsius),site:SITES[t.site]?t.site:"other",note:cleanText(t.note,300)})):[],
  revision:cleanText(c.revision,90)};
}
function guidance(m,now=new Date()){
 if(!m||!m.active)return {state:"ended",text:"복용 종료 표시",dueAt:null};
 const doses=(m.doses||[]).filter(d=>isTime(d.at)&&at(d.at)<=now.getTime())
  .sort((a,b)=>at(a.at)-at(b.at));
 const last=doses[doses.length-1];
 const interval=num(m.intervalHours);
 if(m.mode==="prn"){
  const taken=[...doses].reverse().find(d=>d.status==="taken");
  if(!taken||!(interval>0))
   return {state:"prn",text:"필요 시 복용 · 미복용 경고 없음",dueAt:null};
  const earliest=new Date(at(taken.at)+interval*3600000).toISOString();
  return {state:"prn",text:"필요 시 복용 · 마지막 실제 복용 후 입력 간격 참고: "+displayTime(earliest)+" 이후 (복용 지시 확인)",dueAt:earliest};
 }
 if(!last)return {state:"not-started",text:"첫 복용이 기록되면 처방 간격으로 다음 시각을 계산합니다.",dueAt:null};
 if(!(interval>0))return {state:"invalid",text:"처방 간격 입력 필요 · 자동 알림 없음",dueAt:null};
 const anchor=last.status==="skipped"&&last.scheduledFor?last.scheduledFor:last.at;
 const dueAt=new Date(at(anchor)+interval*3600000).toISOString();
 if(m.endsAt&&at(dueAt)>at(m.endsAt))
  return {state:"course-end",text:"입력된 처방 기간의 종료 시점 도달 · 처방 종료 여부 확인",dueAt};
 const remaining=at(dueAt)-now.getTime();
 if(remaining<=0){
  const min=Math.floor(-remaining/60000);
  return {state:"overdue",text:"예정 시각 지남 "+Math.floor(min/60)+"시간 "+min%60+"분 · 실제 투약 여부와 처방 지시 확인",dueAt};
 }
 return {state:"upcoming",text:"다음 복용 참고 시각 "+displayTime(dueAt)+" · 약 "+Math.ceil(remaining/60000)+"분 후",dueAt};
}
function dailyMax(temps){
 const days={};for(const t of temps||[]){
  const d=dayKey(t.at);if(!d||!Number.isFinite(t.celsius))continue;
  days[d]=Math.max(days[d]??-Infinity,t.celsius);
 }
 return days;
}
function heatBand(v){
 if(v===undefined)return "missing";
 if(v<37.5)return "normal";
 if(v<38)return "warm";
 if(v<39)return "fever";
 return "high";
}
const model={cases:{},pending:{},conflicts:{},snapshots:[]};
let loaded=false,selected="",month=isoMonth(nowIso()),temperatureDay=dayKey(nowIso()),connected=false,initialFetchStarted=false,busy=false;
let active=false,syncEpoch=0,lastActionFeedback="";
let notice="기기에 즉시 저장 · 서버 자동 동기화 준비 중",noticeError=false,editMedication="",editGroup="",editVisit="",editTemperatureId="",editDoseId="",editDoseGroupId="",editDoseLegacy=false,copyDraft=null,pendingPrescription=null,timer=null,root=null;
function persist(){
 try{
  // Archive before changing primary records. Keep the bounded archive small
  // to avoid exhausting origin storage shared with the sleep/mental modules.
  localStorage.setItem(SNAPSHOTS,JSON.stringify(model.snapshots));
  localStorage.setItem(STORE,JSON.stringify(model.cases));
  localStorage.setItem(QUEUE,JSON.stringify(model.pending));
  localStorage.setItem(CONFLICT,JSON.stringify(model.conflicts));
  noticeError=false;return true;
 }catch(e){notice="기기 저장 실패 · 화면을 닫거나 캐시를 삭제하지 말고 원본 백업을 확인하세요";noticeError=true;return false;}
}
function hydrate(){
 if(loaded)return;
 loaded=true;
 const cases=parseStore(STORE,{});
 for(const [id,c] of Object.entries(cases))if(/^i[a-z0-9_]+$/i.test(id)&&c&&c.id===id)model.cases[id]=normalize(c);
 model.pending=parseStore(QUEUE,{});
 model.conflicts=parseStore(CONFLICT,{});
 const snaps=parseStore(SNAPSHOTS,[]);
 model.snapshots=Array.isArray(snaps)?snaps:[];
 selected=Object.values(model.cases).sort((a,b)=>at(b.onsetAt)-at(a.onsetAt))[0]?.id||"";
}
function recordSnapshot(why,content){
 model.snapshots.push({reason:why,at:nowIso(),content:clone(content)});
 while(model.snapshots.length>12||JSON.stringify(model.snapshots).length>400000)model.snapshots.shift();
}
function changeCase(id,modifier,feedback=""){
 const before=model.cases[id];if(!before)return;
 recordSnapshot("before-edit",before);
 const value=clone(before);modifier(value);
 const next=normalize(value),old=model.pending[id];
 model.cases[id]=next;
 model.pending[id]={episode:clone(next),
  expectedRevision:old?.expectedRevision??before.revision??"",
  ...(old?.resolution?{resolution:old.resolution}:{})};
 const saved=persist();if(saved&&feedback)lastActionFeedback=feedback;
 if(connected&&saved)void pushPending();render();
}
function newEpisode(title,onset,symptoms,note){
 const id=newId();
 model.cases[id]=normalize({id,title,onsetAt:onset,symptoms,note});
 model.pending[id]={episode:clone(model.cases[id]),expectedRevision:""};
 selected=id;lastActionFeedback="";notice="질병 기록이 기기에 저장됐습니다";const saved=persist();render();if(connected&&saved)void pushPending();
}
function current(){return model.cases[selected]||null;}
function exportIllnessHistoryXml(){
 hydrate();
 if(!window.YuhaHistoryExport?.open){
  notice="XML 내보내기 기능이 로드되지 않았습니다. 앱을 새로고침해 주세요.";
  noticeError=true;render();return;
 }
 window.YuhaHistoryExport.open({
  kind:"illness",month:month,fromMonth:"2025-03",
  localMonthKeys:()=>Object.values(model.cases).flatMap(ep=>{
   const events=[ep.onsetAt,ep.closedAt,
    ...(ep.visits||[]).map(v=>v.at),...(ep.temperatures||[]).map(t=>t.at),
    ...(ep.medicationGroups||[]).flatMap(g=>(g.events||[]).map(e=>e.at)),
    ...(ep.medications||[]).flatMap(m=>(m.doses||[]).map(d=>d.at))];
   return events.filter(x=>isTime(x)).map(x=>dayKey(x).slice(0,7));
  }),
  localIllness:()=>({
   cases:clone(model.cases),
   pending:clone(model.pending),
   conflicts:clone(model.conflicts)
  }),
  fetchIllness:()=>rpc("getIllnessCases",[])
 });
}
function backup(){
 const data={kind:"yuha-illness-backup-v1",exportedAt:nowIso(),
  cases:model.cases,pending:model.pending,conflicts:model.conflicts,snapshots:model.snapshots};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="yuha-illness-backup-"+dayKey(nowIso())+".json";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
 notice="민감한 질병 기록 백업 파일이 생성됐습니다. 안전하게 보관하세요";render();
}
function rpc(method,args){
 return new Promise((resolve,reject)=>{
  if(!window.google?.script?.run){reject(Error("Google Apps Script 연결 통로가 없습니다."));return;}
  try{window.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[method](...args);}
  catch(e){reject(e);}
 });
}
function sameData(a,b){
 const left=normalize(a),right=normalize(b);
 left.revision="";right.revision="";
 return JSON.stringify(left)===JSON.stringify(right);
}
function setConflict(id,server){
 const local=clone(model.cases[id]);
 if(!model.conflicts[id]){
  recordSnapshot("cloud-conflict-local",local);
  recordSnapshot("cloud-conflict-server",server);
 }
 model.conflicts[id]={local,server:normalize(server)};
 persist();
}
function absorbServer(incoming){
 for(const [id,raw] of Object.entries(incoming||{})){
  const remote=normalize(raw);if(remote.id!==id)continue;
  const local=model.cases[id],pending=model.pending[id];
  if(!local){model.cases[id]=remote;continue;}
  if(pending){
   if(sameData(pending.episode,remote)){
    model.cases[id]={...normalize(model.cases[id]),revision:remote.revision};
    delete model.pending[id];delete model.conflicts[id];
   }else if(String(pending.expectedRevision||"")!==String(remote.revision||""))setConflict(id,remote);
   continue;
  }
  if(sameData(local,remote)){model.cases[id]=remote;continue;}
  // Existing local originals are never overwritten implicitly by cloud reads.
  setConflict(id,remote);
 }
 persist();
}
async function connect(){
 // Reuse the same shared Apps Script bridge as the other app tabs.
 // No separate password, opt-in step, or server key.
 if(busy)return;
 const epoch=syncEpoch;
 busy=true;notice="기존 앱 서버에서 질병 기록 자동 조회 중";noticeError=false;
 try{
  const res=await rpc("getIllnessCases",[]);
  if(epoch!==syncEpoch)return;
  if(!res?.ok||Number(res.schemaVersion)!==4)throw Error("질병 기록용 Apps Script 최신 버전 배포가 필요합니다.");
  connected=true;
  absorbServer(res.cases);
  notice="서버 기록 조회 완료 · 자동 저장 사용 중";noticeError=false;
 }catch(e){
  if(epoch!==syncEpoch)return;
  connected=false;
  notice="기기 기록 보관 중 · 서버 연결 확인 필요: "+String(e?.message||e);
  noticeError=true;
 }finally{
  if(epoch===syncEpoch){busy=false;if(active)render();}
 }
 if(epoch===syncEpoch&&connected)await pushPending();
}
async function pushPending(){
 if(!connected||busy)return;
 busy=true;
 for(const id of Object.keys(model.pending)){
  if(model.conflicts[id]&&!model.pending[id]?.resolution)continue;
  const job=model.pending[id];if(!job?.episode)continue;
  const frozen=JSON.stringify(job.episode);
  try{
   const response=await rpc("syncIllnessCase",[{
    episode:job.episode,expectedRevision:job.expectedRevision,
    ...(job.resolution?{resolution:job.resolution}:{})
   }]);
   if(response?.conflict){
    if(response.serverEntry)setConflict(id,response.serverEntry);
    notice="서버·기기 기록 충돌 · 양쪽 원본을 보존했습니다";noticeError=true;continue;
   }
   if(!response?.ok)throw Error("서버가 저장을 승인하지 않았습니다");
   if(job.resolution&&!response.conflictArchived)throw Error("양쪽 원본 보관 미확인");
   const verified=await rpc("getIllnessCases",[]);
   const remote=verified?.cases?.[id];
   if(!verified?.ok||!remote||response.revision!==remote.revision||!sameData(job.episode,remote))
    throw Error("저장 후 재조회 검증이 일치하지 않습니다");
   if(model.pending[id]&&JSON.stringify(model.pending[id].episode)===frozen){
    model.cases[id]={...normalize(model.cases[id]),revision:remote.revision};
    delete model.pending[id];delete model.conflicts[id];
   }else if(model.pending[id]){
    model.pending[id].expectedRevision=remote.revision;
    delete model.pending[id].resolution;
   }
   persist();notice="서버 저장 및 재조회 검증 완료";noticeError=false;
  }catch(e){notice="원본 보존 중 · 서버 저장 확인 필요: "+String(e?.message||e);noticeError=true;break;}
 }
 busy=false;if(active)render();
}
function chooseConflict(id,choice){
 const c=model.conflicts[id];if(!c)return;
 if(!window.confirm("서버와 기기의 다른 원본을 확인하고 선택하셨나요? 선택 전 JSON 백업을 권장합니다."))return;
 recordSnapshot("conflict-resolve-local",c.local);
 recordSnapshot("conflict-resolve-server",c.server);
 if(choice==="server"){
  model.cases[id]=normalize(c.server);
  delete model.pending[id];delete model.conflicts[id];
 }else{
  const local=normalize(model.cases[id]);
  model.pending[id]={episode:local,expectedRevision:c.server.revision,
   resolution:{confirmed:true,serverRevision:c.server.revision,localOriginal:c.local}};
 }
 const saved=persist();render();if(connected&&saved)void pushPending();
}
function card(title,body,cls=""){
 return '<section class="ill-card '+cls+'"><h3>'+E(title)+'</h3>'+body+'</section>';
}
function illnessSelect(){
 const options=Object.values(model.cases).sort((a,b)=>at(b.onsetAt)-at(a.onsetAt));
 return '<div class="ill-chips">'+options.map(c=>
  '<button type="button" data-act="select" data-id="'+attr(c.id)+'" class="'+(c.id===selected?'current':'')+'">'+
   E(c.title||"질병")+' <small>'+(c.status==="closed"?"종료":"진행 중")+'</small></button>').join("")+'</div>';
}
function episodeForm(){
 return '<details class="ill-disease-new"'+(!Object.keys(model.cases).length?' open':'')+'>'+
  '<summary>+ 새 질병 등록</summary>'+
  '<form data-form="episode" class="ill-fields">'+
  '<label>증상·질병명<input required name="title" maxlength="80" placeholder="예: 발열 및 기침"></label>'+
  '<label>처음 증상 확인 시각<input required name="onset" type="datetime-local" value="'+localInput(nowIso())+'"></label>'+
  '<label>발생 증상<input name="symptoms" maxlength="350" placeholder="기침, 콧물, 구토 등"></label>'+
  '<label>상세 메모<textarea name="note" rows="2" maxlength="1000"></textarea></label>'+
  '<button type="submit" class="ill-primary">질병 기록 시작</button></form></details>';
}
function recordHeading(c){
 const delayed=c.medicationGroups.filter(g=>!g.deletedAt&&groupGuidance(g).state==="overdue").length+
  c.medications.filter(m=>guidance(m).state==="overdue").length;
 const latest=[...c.temperatures].filter(t=>Number.isFinite(t.celsius))
  .sort((a,b)=>at(b.at)-at(a.at))[0];
 return '<section class="ill-episode-strip"><div><strong>'+E(c.title)+'</strong> '+
  '<small>'+(c.status==="closed"?"완치·종료":"진행 중")+' · '+E(fullDate(c.onsetAt))+'</small></div>'+
  '<div class="ill-episode-facts"><span>최근 '+(latest?latest.celsius.toFixed(1)+'℃':'체온 미기록')+'</span>'+
  '<span class="ill-missed" data-ill-overdue style="'+(delayed?'':'display:none')+'">'+delayed+'건 복약 예정 확인</span></div></section>';
}
function episodeEditDetails(c){
 if(!c||c.status!=="active")return "";
 return '<details class="ill-episode-edit"><summary>질병명·발생 시점 수정</summary>'+
  '<form data-form="edit-episode" class="ill-fields">'+
  '<label>질병명<input required maxlength="80" name="title" value="'+attr(c.title)+'"></label>'+
  '<label>발생 시점<input required name="onset" type="datetime-local" value="'+localInput(c.onsetAt)+'"></label>'+
  '<label>증상<input maxlength="350" name="symptoms" value="'+attr(c.symptoms)+'"></label>'+
  '<label>기록 메모<textarea rows="2" name="note" maxlength="1000">'+E(c.note)+'</textarea></label>'+
  '<button class="ill-secondary" type="submit">수정 저장</button></form></details>';
}
function visitForm(c){
 const editing=c.visits.find(v=>v.id===editVisit);
 const visits=[...c.visits].sort((a,b)=>at(b.at)-at(a.at));
 const form=editing||c.status==="active"?
  '<form data-form="visit" class="ill-fields">'+
   '<input type="hidden" name="editId" value="'+attr(editing?.id||"")+'">'+
   '<label>방문 일시<input required name="at" type="datetime-local" value="'+localInput(editing?.at||nowIso())+'"></label>'+
   '<label>병원 이름<input required name="hospital" maxlength="120" value="'+attr(editing?.hospital||"")+'" placeholder="병원 이름"></label>'+
   '<label>진단·진료 내용<input name="diagnosis" maxlength="200" value="'+attr(editing?.diagnosis||"")+'" placeholder="진료 메모"></label>'+
   '<label>처방·안내사항<input name="notes" maxlength="500" value="'+attr(editing?.notes||"")+'" placeholder="의사 설명"></label>'+
   '<button type="submit" class="ill-primary">'+(editing?"방문 기록 수정 저장":"병원 방문 기록 추가")+'</button>'+
   (editing?'<button type="button" class="ill-secondary" data-act="cancel-edit-visit">취소</button>':'')+
   '</form>':'';
 const visitEntries=visits.length?'<div class="ill-visit-list">'+visits.map(v=>
  '<article class="ill-visit-entry"><div><span class="ill-visit-date">🏥 '+E(displayTime(v.at))+'</span>'+
  '<strong>'+E(v.hospital)+'</strong></div>'+
  (v.diagnosis?'<p>'+E(v.diagnosis)+'</p>':'')+
  (v.notes?'<p class="ill-muted">'+E(v.notes)+'</p>':'')+
  '<div class="ill-record-actions"><button type="button" class="ill-secondary" data-act="edit-visit" data-id="'+attr(v.id)+'">수정</button>'+
  '<button type="button" class="ill-text-danger" data-act="remove-visit" data-id="'+attr(v.id)+'">삭제</button></div></article>').join("")+'</div>':
  '<p class="ill-muted">아직 병원 방문 기록이 없습니다. 진료받은 날짜는 위 히트맵에 🏥로 표시됩니다.</p>';
 return card("진료 · 병원 방문",visitEntries+
  (form?'<details class="ill-visit-editor"'+(editing?' open':'')+'><summary>'+
   (editing?"방문 기록 수정 중":"+ 병원 방문 기록 추가")+'</summary>'+form+'</details>':''));
}
function medicationForm(c){
 const m=c.medications.find(x=>x.id===editMedication)||null;
 const chooseVisit='<option value="">방문 기록 미연결</option>'+c.visits.map(v=>
  '<option value="'+attr(v.id)+'"'+(m?.visitId===v.id?' selected':'')+'>'+E(v.hospital)+' · '+E(displayTime(v.at))+'</option>').join("");
 return card("3. 처방약 · 복용 간격",'<details '+(m?'open':'')+'><summary>'+(m?'처방 수정 중':'처방약 등록')+'</summary><form data-form="medicine" class="ill-fields">'+
 '<input type="hidden" name="editId" value="'+attr(m?.id||"")+'">'+
  '<label>정확한 약 이름<input required maxlength="120" name="name" value="'+attr(m?.name||"")+'" placeholder="약 봉투의 제품명을 그대로 입력"></label>'+
   '<label>연결된 병원 방문<select name="visitId">'+chooseVisit+'</select></label>'+
 '<label>복용 방식<select name="mode"><option value="scheduled"'+(m?.mode!=="prn"?' selected':'')+'>정기 복용 (예정·지연 표시)</option>'+
 '<option value="prn"'+(m?.mode==="prn"?' selected':'')+'>필요시 복용 (지연 경고 없음)</option></select></label>'+
 '<div class="ill-two"><label>1회 처방 용량 (mL)<input required type="number" name="doseMl" min="0.1" max="100" step="0.1" inputmode="decimal" value="'+attr(m?.doseMl??"")+'" placeholder="처방된 mL"></label>'+
 '<label>처방 간격 (시간)<input type="number" name="intervalHours" min="0.5" max="72" step="0.5" inputmode="decimal" value="'+attr(m?.intervalHours??"")+'" placeholder="예: 8"></label></div>'+
 '<label>처방 종료 예정 시각 (선택)<input type="datetime-local" name="endsAt" value="'+(m?.endsAt?localInput(m.endsAt):"")+'"></label>'+
 '<label>처방 약 봉투 지시 · 주의사항<textarea name="instructions" maxlength="500" rows="2">'+E(m?.instructions||"")+'</textarea></label>'+
 '<button type="submit" class="ill-primary">'+(m?"약 정보 수정 저장":"처방약 등록")+'</button>'+
 (m?'<button type="button" data-act="cancel-edit-med" class="ill-secondary">수정 취소</button>':'')+
 '</form></details><p class="ill-muted">프리셋은 약 분류만 입력합니다. 복용량·간격은 자동 제안하지 않습니다. 약 이름·용량·간격을 반드시 실제 처방전/약 봉투와 대조하세요.</p>');
}
function medicines(c){
 if(!c.medications.length)return card("4. 복약 상태 · 시간 가이드",'<p class="ill-muted">등록된 처방약이 없습니다. 병원 방문과 처방약을 먼저 등록하세요.</p>');
 const rows=c.medications.map(m=>{
  const g=guidance(m),doses=[...(m.doses||[])].sort((a,b)=>at(b.at)-at(a.at));
  return '<article class="ill-med '+g.state+'"><div class="ill-summary"><b>'+E(m.name)+'</b><span class="ill-tag">'+(m.mode==="prn"?"필요시":m.active?"정기":"복용 종료")+'</span></div>'+
   '<div class="ill-muted">'+E(CATEGORIES[m.category]||"기타")+(m.ingredient?" · "+E(m.ingredient):"")+'</div>'+
   '<p>처방: '+(m.doseMl===null?"미입력":E(m.doseMl)+"mL")+(m.intervalHours?" / "+E(m.intervalHours)+"시간 간격":"")+'</p>'+
   (m.instructions?'<p>처방 지시: '+E(m.instructions)+'</p>':'')+
   '<p class="ill-guidance" role="status">'+E(g.text)+'</p>'+
   (g.dueAt?'<small>기록 기준 시각: '+E(displayTime(g.dueAt))+'</small>':'')+
   '<div class="ill-row-actions">'+
   '<button type="button" data-act="edit-med" data-id="'+attr(m.id)+'">처방 수정</button>'+
   (m.active?'<button type="button" data-act="end-med" data-id="'+attr(m.id)+'">복용 종료 표시</button>':
     '<button type="button" data-act="resume-med" data-id="'+attr(m.id)+'">복용 재개 표시</button>')+
   '</div>'+
   (doses.length?'<details><summary>복용 이력 '+doses.length+'건</summary><div class="ill-history">'+doses.map(d=>
    '<div class="ill-history-item">'+E(displayTime(d.at))+' · <b>'+(d.status==="skipped"?"미복용 표시":E(d.amountMl)+"mL 복용")+'</b>'+
    (d.note?" · "+E(d.note):"")+
    '<button data-act="remove-dose" data-id="'+attr(d.id)+'" data-med="'+attr(m.id)+'" class="ill-text-danger">삭제</button></div>').join("")+
    '</div></details>':'')+
   '</article>';
 }).join("");
 const medOpts=c.medications.filter(m=>m.active).map(m=>'<option value="'+attr(m.id)+'">'+E(m.name)+'</option>').join("");
 return card("4. 복약 예정 · 실제 기록",rows+
  (medOpts?'<form class="ill-fields" data-form="dose"><h4>실제 복용 / 미복용 기록</h4>'+
   '<label>약 선택<select name="medicationId">'+medOpts+'</select></label>'+
   '<label>일시<input type="datetime-local" name="at" required value="'+localInput(nowIso())+'"></label>'+
   '<label>구분<select name="status"><option value="taken">실제 복용 완료</option><option value="skipped">복용하지 않음 (건너뜀)</option></select></label>'+
   '<label>실제 복용량 mL (복용 완료 시, 미입력하면 등록 용량)<input name="amountMl" type="number" min="0.1" max="100" step="0.1" placeholder="등록된 처방 용량"></label>'+
   '<label>비고<input name="note" maxlength="300" placeholder="구토, 보호자 확인, 건너뛴 사유 등"></label>'+
   '<button type="submit" class="ill-primary">복용 기록 저장</button></form>':
   '<p class="ill-muted">활성 상태의 처방약이 없어 복용 기록을 추가할 수 없습니다.</p>')+
  '<p class="ill-muted">‘지연’은 입력된 정기 복용 간격과 마지막 실제 기록만 비교합니다. 필요시 약에는 지연 경고를 표시하지 않습니다. 누락된 약을 임의로 두 배 복용하거나, 해열제 간 교차 복용을 앱에서 계산하지 않습니다.</p>');
}
// Two-stage prescription import: review before save, never infer q8h/q12h
// from "N times per day" and never silently round exact prescribed amounts.
function parsePrescriptionJson(input){
 if(typeof input!=="string"||input.length>100000)throw Error("JSON은 100KB 이하로 입력해 주세요.");
 let doc;
 try{doc=JSON.parse(input)}catch{throw Error("JSON 형식 오류: 쉼표와 따옴표를 확인하세요.");}
 if(!doc||typeof doc!=="object"||Array.isArray(doc)||doc.schema!=="yuha-prescription-import/v1")
  throw Error('schema는 "yuha-prescription-import/v1"이어야 합니다.');
 if(!Array.isArray(doc.medications)||!doc.medications.length||doc.medications.length>40)
  throw Error("medications에 약 1~40개가 필요합니다.");
 const natural=(v,max,label)=>{
  const n=Number(v);if(!Number.isInteger(n)||n<1||n>max)throw Error(label+"은 1~"+max+" 정수여야 합니다.");
  return n;
 };
 const mlist=doc.medications.map((m,i)=>{
  if(!m||typeof m!=="object"||Array.isArray(m))throw Error((i+1)+"번째 약 입력을 확인하세요.");
  const name=String(m.name??"").trim(),unit=String(m.doseUnit??"");
  if(!name||name.length>120||!MED_UNITS.includes(unit)||!validAmount(m.doseAmount,unit))
   throw Error((i+1)+"번째 약 이름·1회량·단위를 확인하세요.");
  return {name,amount:num(m.doseAmount),unit,
   timesPerDay:natural(m.timesPerDay,12,name+" 1일 횟수"),
   days:natural(m.days,60,name+" 일수")};
 });
 if(new Set(mlist.map(m=>m.name)).size!==mlist.length)throw Error("중복 약 이름을 구별해 주세요.");
 const byName=new Map(mlist.map(m=>[m.name,m]));
 const sourceDate=String(doc.dispensedAt??"");
 if(sourceDate&&!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate))throw Error("조제일은 YYYY-MM-DD 형식입니다.");
 const templates=doc.bundleTemplates;
 if(templates!==undefined&&(!Array.isArray(templates)||templates.length>60))
  throw Error("bundleTemplates는 최대 60개의 배열입니다.");
 const plans=[];
 if(templates?.length){
  const used=new Set();
  templates.forEach((t,i)=>{
   if(!t||!Array.isArray(t.items)||!t.items.length||t.items.length>20)
    throw Error((i+1)+"번째 묶음 items를 확인하세요.");
   const items=t.items.map(v=>{
    const original=byName.get(String(v?.name??""));
    if(!original)throw Error("처방 원본에 없는 약: "+String(v?.name??""));
    if((v.amount!==undefined&&Number(v.amount)!==original.amount)||
       (v.unit!==undefined&&v.unit!==original.unit))
     throw Error(original.name+"의 묶음 1회량이 처방 원본과 일치하지 않습니다.");
    used.add(original.name);return original;
   });
   const first=items[0];
   if(!items.every(m=>m.timesPerDay===first.timesPerDay&&m.days===first.days))
    throw Error("한 묶음에 1일 횟수·처방 일수가 다른 약이 있습니다.");
   plans.push({name:String(t.name??"").trim().slice(0,80)||
    first.timesPerDay+"회/일 · "+first.days+"일",items,
    timesPerDay:first.timesPerDay,days:first.days});
  });
  const remaining=new Map();
  for(const med of mlist)if(!used.has(med.name)){
   const key=med.timesPerDay+"x"+med.days;
   if(!remaining.has(key))remaining.set(key,{name:med.timesPerDay+"회/일 · "+med.days+"일 (추가)",
     items:[],timesPerDay:med.timesPerDay,days:med.days});
   remaining.get(key).items.push(med);
  }
  plans.push(...remaining.values());
 }else{
  const grouped=new Map();
  for(const med of mlist){
   const key=med.timesPerDay+"x"+med.days;
   if(!grouped.has(key))grouped.set(key,{name:med.timesPerDay+"회/일 · "+med.days+"일",
     items:[],timesPerDay:med.timesPerDay,days:med.days});
   grouped.get(key).items.push(med);
  }
  plans.push(...grouped.values());
 }
 const groups=plans.map(g=>({id:newId(),name:g.name,mode:"scheduled",
  intervalHours:null,timesPerDay:g.timesPerDay,days:g.days,sourceDate,
  sourceKind:"prescription-json",visitId:"",endsAt:"",active:true,
  items:g.items.map(i=>({id:newId(),name:i.name,amount:i.amount,unit:i.unit})),events:[]}));
 return {groups,medicationCount:mlist.length,sourceDate,
  hasExtraPrecision:mlist.some(m=>m.unit==="g"&&decimalPlaces(m.amount)>2),
  note:"1일 복용 횟수만으로 복용 간격을 추정하지 않았습니다. 의사·약사에게 확인한 시간 간격을 별도로 입력하세요."};
}
function samePrescriptionGroup(a,b){
 const compact=x=>JSON.stringify({name:x.name,days:x.days??null,
  timesPerDay:x.timesPerDay??null,sourceDate:x.sourceDate||"",
  items:(x.items||[]).map(i=>[i.name,i.amount,i.unit])});
 return compact(a)===compact(b);
}
function groupGuidance(g,now=new Date()){
 if(g.deletedAt)return {state:"ended",text:"삭제 보관된 묶음",dueAt:null};
 if(g.active&&g.mode==="scheduled"&&!g.intervalHours)
  return {state:"invalid",text:"1일 "+(g.timesPerDay||"?")+"회 · 시간 간격 미확인. 처방 지시 확인 후 안내 가능",dueAt:null};
 const anyTaken=g.events?.some(e=>e.status==="taken");
 if(g.active&&g.mode!=="prn"&&!anyTaken)
  return {state:"not-started",text:"첫 묶음 복용을 기록하면 다음 예정 시각을 안내합니다.",dueAt:null};
 return guidance({...g,doses:g.events||[]},now);
}
function groupItemRow(item){
 const values=item||{},unit=MED_UNITS.includes(values.unit)?values.unit:"mL";
 return '<div class="ill-drug-line" data-group-item>'+
  '<input aria-label="약 이름" required name="drugName" maxlength="120" placeholder="약 이름 (예: 챔프)" value="'+attr(values.name||"")+'">'+
  '<input aria-label="1회 투약량" required type="number" inputmode="decimal" min="0.1" max="100" step="any" name="drugAmount" placeholder="1회량" value="'+attr(values.amount??"")+'">'+
  '<select aria-label="투약 단위" name="drugUnit">'+MED_UNITS.map(v=>'<option value="'+v+'"'+(unit===v?" selected":"")+'>'+v+'</option>').join("")+'</select>'+
  '<button type="button" class="ill-minor" data-act="remove-drug-line" aria-label="이 약 입력 줄 삭제">×</button></div>';
}
// A portable transcription contract to paste into another chat with a photo.
// This example is fictitious and contains no real prescription or patient data.
function prescriptionExample(){
 return {schema:"yuha-prescription-import/v1",dispensedAt:"2026-11-14",
  medications:[
   {name:"약 A",doseAmount:2.5,doseUnit:"mL",timesPerDay:2,days:4},
   {name:"약 B",doseAmount:0.25,doseUnit:"정",timesPerDay:3,days:4},
   {name:"약 C",doseAmount:0.3333,doseUnit:"g",timesPerDay:3,days:4}
  ],
  bundleTemplates:[
   {name:"하루 2회 묶음",items:[{name:"약 A",amount:2.5,unit:"mL"}]},
   {name:"하루 3회 묶음",items:[{name:"약 B",amount:0.25,unit:"정"},
     {name:"약 C",amount:0.3333,unit:"g"}]}
  ]};
}
function prescriptionChatRequest(){
 const fence=String.fromCharCode(96).repeat(3);
 return [
  "첨부한 아기 약봉투 또는 복약안내 사진을 읽고 YUHA-CARE 질병 기록 앱에 붙여넣을 JSON으로 변환해 주세요.",
  "",
  "변환 규칙:",
  "1. 사진에서 실제 확인되는 약 이름, 1회량, 단위(mL/g/정/포/방울), 1일 복용 횟수, 처방 일수를 정확하게 적으세요.",
  "2. 판독 불가한 필수 항목은 추측하지 말고, 해당 약은 JSON에 임의로 넣지 말고 JSON 코드 블록 아래 '확인 필요'로 구분하세요.",
  "3. 1일 2회·3회를 12시간·8시간 간격이라고 자동 환산하거나 복용 시각을 지어내지 마세요.",
  "4. 일반 투약량은 소수 둘째 자리까지, 0.3333g처럼 사진에 더 세밀하게 적힌 g 수치는 최대 넷째 자리까지 원문 그대로 보존하세요. 절대로 반올림하지 마세요.",
  "5. schema는 yuha-prescription-import/v1, medications는 필수 배열이며 각 항목의 name,doseAmount,doseUnit,timesPerDay,days를 채우세요.",
  "6. bundleTemplates는 선택사항입니다. 같은 일일 복용 횟수와 처방 일수끼리 묶음을 제안하되, 같은 시간에 함께 먹어야 한다고 확인되지 않으면 단정하지 마세요.",
  "7. 환자명·등록번호 등 불필요한 개인정보는 제외하세요. 먼저 복사 가능한 JSON 코드 블록, 이후 판독 불확실 항목만 간단히 적으세요.",
  "",
  "아래는 구조 참고용 가상 예시입니다. 실제 약 종류·용량으로 사용하지 마세요.",
  fence+"json",JSON.stringify(prescriptionExample(),null,2),fence,
  "",
  "이제 첨부한 실제 처방 사진을 이 형식의 JSON으로 변환하세요."
 ].join("\n");
}
function copyPrescriptionText(value){
 const status=root?.querySelector("[data-prescription-copy-status]");
 const report=(message,failed)=>{
  if(status){status.textContent=message;status.className=failed?"ill-alert":"ill-muted";}
 };
 return (async()=>{
  try{
   if(window.navigator?.clipboard?.writeText)await window.navigator.clipboard.writeText(value);
   else{
    const field=document.createElement("textarea");
    field.value=value;field.setAttribute("readonly","");
    field.style.position="fixed";field.style.left="-9999px";
    document.body.appendChild(field);field.select();
    const copied=document.execCommand?.("copy");
    field.remove();
    if(!copied)throw Error("복사 권한을 확인해 주세요.");
   }
   report("복사 완료. 다른 채팅에 붙여넣고 약봉투 사진을 첨부하세요.",false);
  }catch(e){report("복사 실패: 브라우저의 클립보드 권한을 확인하세요.",true);}
 })();
}
function prescriptionJsonForm(c){
 if(!c||c.status!=="active")return "";
 return '<section class="ill-json-area"><h4>처방 JSON 붙여넣기</h4>'+
  '<p class="ill-muted">약봉투 사진을 다른 채팅에서 JSON으로 변환한 뒤 바로 붙여넣으세요.</p>'+
  '<div class="ill-row-actions ill-copy-actions">'+
  '<button type="button" class="ill-secondary" data-act="copy-prescription-request">다른 채팅용 요청문 복사</button>'+
  '<button type="button" class="ill-secondary" data-act="copy-prescription-example">예시 JSON 복사</button></div>'+
  '<p class="ill-muted" data-prescription-copy-status>요청문과 약봉투 사진을 보내면 앱에서 읽을 수 있는 JSON을 받을 수 있습니다.</p>'+
  '<form data-form="prescription-json" class="ill-fields ill-json-form">'+
  '<label>처방 JSON<textarea name="prescriptionJson" rows="5" maxlength="100000" spellcheck="false" placeholder="여기에 처방 JSON을 붙여넣으세요"></textarea></label>'+
  '<button type="submit" class="ill-primary">JSON 분석 · 약별량 확인</button></form>'+
  '<div id="illPrescriptionPreview" aria-live="polite"></div>'+
  '<p class="ill-muted">자동 등록되지 않습니다. 분석 결과를 확인한 뒤 등록합니다. 1일 횟수만으로 복용 간격은 추정하지 않습니다.</p></section>';
}
function prescriptionPreview(result){
 const groups=result.groups.map(g=>'<div class="ill-import-group"><strong>'+E(g.name)+'</strong>'+
  '<small>1일 '+g.timesPerDay+'회 · '+g.days+'일 · 시간 간격 미확인</small>'+
  '<ul>'+g.items.map(i=>'<li>'+E(i.name)+' <b>'+E(doseLabel(i.amount,i.unit))+'</b></li>').join("")+'</ul></div>').join("");
 return '<div class="ill-import-preview"><h4>저장 전 확인 · '+result.medicationCount+'종 / '+result.groups.length+'묶음</h4>'+
  (result.hasExtraPrecision?'<p class="ill-alert">처방 원문의 0.3333g 등은 반올림하지 않았습니다. 실제 약봉투를 확인하세요.</p>':'')+
  '<p class="ill-alert">'+E(result.note)+'</p>'+groups+
  '<div class="ill-row-actions"><button type="button" class="ill-primary" data-act="confirm-json-import">확인한 약 묶음 등록</button>'+
  '<button type="button" class="ill-secondary" data-act="cancel-json-import">취소</button></div></div>';
}
function medicationGroupForm(c){
 if(c.status==="closed")return "";
 const editing=c.medicationGroups.find(g=>g.id===editGroup);
 const group=editing||copyDraft||{};
 const visitOptions=c.visits.length?'<label>연결 병원 (선택)<select name="visitId"><option value="">연결하지 않음</option>'+
  c.visits.map(v=>'<option value="'+attr(v.id)+'"'+(group.visitId===v.id?' selected':'')+'>'+E(v.hospital)+'</option>').join("")+
  '</select></label>':'';
 return '<div class="ill-group-editor">'+
  '<h4>'+(editing?'등록된 약 묶음 수정':'약 직접 입력 · 묶음 등록')+'</h4>'+
  '<form data-form="group" class="ill-fields">'+
  '<input type="hidden" name="editGroupId" value="'+attr(editing?.id||"")+'">'+
  '<label>묶음 이름 <small>(선택)</small><input name="groupName" maxlength="80" value="'+attr(group.name||"")+'" placeholder="예: 아침·저녁 약"></label>'+
  '<div class="ill-group-item-head"><b>같이 복용하는 약 · 1회량</b><small>mg·농도 정보 입력 불필요</small></div>'+
  '<div class="ill-group-items">'+(group.items?.length?group.items:[{}]).map(groupItemRow).join("")+'</div>'+
  '<button type="button" class="ill-secondary" data-act="add-drug-line">+ 같이 먹는 약 추가</button>'+
  '<div class="ill-two">'+
  '<label>복용 구분<select name="mode"><option value="scheduled"'+(group.mode!=="prn"?' selected':'')+'>정기 복용</option>'+
  '<option value="prn"'+(group.mode==="prn"?' selected':'')+'>필요시 복용</option></select></label>'+
  '<label>처방 간격 (시간)<input name="intervalHours" type="number" min="0.5" max="72" step="0.5" inputmode="decimal" value="'+attr(group.intervalHours??"")+'" placeholder="예: 8"></label></div>'+
  '<details class="ill-advanced"><summary>추가 설정 (선택)</summary>'+
  visitOptions+
  '<label>처방 종료 예정 (선택)<input name="endsAt" type="datetime-local" value="'+(group.endsAt?localInput(group.endsAt):"")+'"></label>'+
  '</details>'+
  '<p class="ill-muted">같은 시각·간격에 함께 복용하도록 처방된 약만 묶으세요. 약 봉투의 1회량을 정확히 입력하고, 묶음 일부만 복용했다면 함께 복용 완료로 기록하지 마세요.</p>'+
  '<button type="submit" class="ill-primary">'+(editing?'묶음 변경 저장':'복용 묶음 저장')+'</button>'+
  (editing?'<button type="button" data-act="cancel-edit-group" class="ill-secondary">수정 취소</button>':'')+
  '</form></div>';
}
function groupPanel(c){
 const all=c.medicationGroups.filter(g=>g.active&&!g.deletedAt);
 const finished=c.medicationGroups.filter(g=>!g.active&&!g.deletedAt);
 const deleted=c.medicationGroups.filter(g=>!!g.deletedAt);
 if(!all.length&&!finished.length&&!deleted.length)return card("약 묶음 관리",
  '<div class="ill-empty"><strong>등록된 약이 없습니다</strong><p>같이 복용하는 약의 이름과 1회량만 등록하세요. 복용 기록은 묶음 단위로 남깁니다.</p>'+
  '<button class="ill-primary" data-act="go-group" type="button">+ 복용 묶음 만들기</button></div>');
 const renderGroup=g=>{
  const info=groupGuidance(g),history=[...g.events].sort((a,b)=>at(b.at)-at(a.at));
  const items=g.items.map(item=>'<li><span>'+E(item.name)+'</span><strong>'+E(doseLabel(item.amount,item.unit))+'</strong></li>').join("");
  return '<article data-ill-group-id="'+attr(g.id)+'" class="ill-group '+info.state+'">'+
   '<div class="ill-summary"><strong>'+E(g.name||"함께 복용하는 약")+'</strong>'+
   '<span class="ill-tag">'+(g.active?(g.mode==="prn"?"필요시 복용":"정기 복용"):"복용 종료")+'</span></div>'+
   '<ul class="ill-drug-list">'+items+'</ul>'+
   (g.timesPerDay?'<p class="ill-muted">1일 '+E(g.timesPerDay)+'회 · '+E(g.days||"?")+'일'+
     (g.intervalHours?' · '+E(g.intervalHours)+'시간 간격':' · 시간 간격 미확인')+'</p>':'')+
   (g.active?'<p class="ill-guidance" role="status">'+E(info.text)+'</p>':'<p class="ill-muted">복용 종료된 묶음</p>')+
   (c.status==="active"?'<div class="ill-group-actions" aria-label="복용 묶음 관리">'+
   '<div class="ill-group-action-row ill-group-edit-actions">'+
   '<button type="button" class="ill-secondary" data-act="edit-group" data-id="'+attr(g.id)+'">약·용량 수정</button>'+
   '<button type="button" class="ill-secondary" data-act="copy-group" data-id="'+attr(g.id)+'">묶음 복사</button>'+
   '</div>'+
   '<div class="ill-group-action-row ill-group-status-actions">'+
   (g.active?'<button type="button" class="ill-secondary" data-act="end-group" data-id="'+attr(g.id)+'">복용 종료</button>':
      '<button type="button" class="ill-secondary" data-act="resume-group" data-id="'+attr(g.id)+'">복용 재개</button>')+
   '<button type="button" class="ill-text-danger" data-act="delete-group" data-id="'+attr(g.id)+'">묶음 삭제</button>'+
   '</div></div>':'')+
   '<p class="ill-muted">복용 이력 '+history.length+'건 · 시간별 기록은 위 복약 서머리에서 확인·수정</p></article>';
 };
 const sections=all.map(renderGroup).join("");
 const past=finished.length?'<details class="ill-group-past"><summary>복용 종료한 묶음 '+finished.length+'개</summary>'+
   finished.map(renderGroup).join("")+'</details>':'';
 const archive=deleted.length?'<details class="ill-group-archive"><summary>삭제한 묶음 '+deleted.length+'개 · 복원 가능</summary>'+
  '<p class="ill-muted">삭제한 묶음과 기존 투약 기록은 보관됩니다. 삭제한 묶음의 이력은 일반 복약 서머리에서 제외합니다.</p>'+
  deleted.map(g=>'<div class="ill-archive-row"><span>'+E(g.name)+' · 복용 이력 '+g.events.length+'건</span>'+
   (c.status==="active"?'<button type="button" class="ill-secondary" data-act="restore-group" data-id="'+attr(g.id)+'">복원</button>':'')+'</div>').join("")+'</details>':'';
 return card("약 묶음 관리",sections+past+archive+
 '<p class="ill-muted">복용 기록은 화면 위쪽 ‘복용 내역’에서 입력합니다. 함께 복용한 약의 범위는 처방 지시를 확인해 기록하세요.</p>');
}
// Always-visible medication timeline across ALL currently retained medicine groups
// and legacy standalone medicines. Actual administered amounts are read only
// from immutable event snapshots; never from today's edited prescription.
function dailyMedicationEvents(c,day,{includeDeleted=false}={}){
 const events=[];
 for(const group of c.medicationGroups||[]){
  if(group.deletedAt&&!includeDeleted)continue;
  for(const event of group.events||[]){
   if(dayKey(event.at)!==day)continue;
   events.push({
    id:event.id,groupId:group.id,at:event.at,
    status:event.status==="skipped"?"skipped":"taken",
    name:group.name||"약 묶음",deleted:!!group.deletedAt,
    items:event.status==="skipped"?[]:clone(event.items||[]),
    note:event.note||"",legacy:false
   });
  }
 }
 for(const med of c.medications||[]){
  for(const dose of med.doses||[]){
   if(dayKey(dose.at)!==day)continue;
   events.push({
    id:dose.id,groupId:med.id,at:dose.at,
    status:dose.status==="skipped"?"skipped":"taken",
    name:med.name||"기존 개별 약",deleted:false,
    items:dose.status==="skipped"?[]:(num(dose.amountMl)!==null?
     [{name:med.name,amount:dose.amountMl,unit:"mL"}]:[]),
    note:dose.note||"",legacy:true
   });
  }
 }
 return events.sort((a,b)=>at(b.at)-at(a.at)||String(a.id).localeCompare(String(b.id)));
}
function groupMedicineLabel(group,short=false){
 const items=(group.items||[]).filter(x=>x.name);
 if(!items.length)return group.name||"약 묶음";
 const list=items.slice(0,short?2:7).map(i=>i.name+" "+doseLabel(i.amount,i.unit));
 const remaining=items.length-list.length;
 return list.join(" · ")+(remaining?" 외 "+remaining+"종":"");
}
function currentPrescriptionPanel(c){
 const groups=c.medicationGroups.filter(g=>!g.deletedAt&&(c.status==="closed"||g.active));
 const singles=c.medications.filter(m=>c.status==="closed"||m.active);
 const allDrugs=groups.flatMap(g=>g.items||[]).map(i=>i.name+" "+doseLabel(i.amount,i.unit))
  .concat(singles.map(m=>m.name+" "+doseLabel(m.doseMl,"mL")));
 const status=c.status==="closed"?"질병 종료 · 처방 보관":groups.length+singles.length+"개 복용 단위 · "+allDrugs.length+"종 약";
 return card(c.status==="closed"?"지난 처방 내역":"현재 처방 한눈에",
  '<div class="ill-current-prescription"><p class="ill-prescription-status">'+E(status)+'</p>'+
  (allDrugs.length?'<ul class="ill-prescription-compact">'+allDrugs.slice(0,8).map(name=>'<li>'+E(name)+'</li>').join("")+
   (allDrugs.length>8?'<li>외 '+(allDrugs.length-8)+'종</li>':'')+'</ul>':
   '<p class="ill-muted">'+(c.status==="closed"?'이 질병에 보관된 처방이 없습니다.':'현재 복용 중인 처방 묶음이 없습니다.')+'</p>')+
  '<div class="ill-row-actions"><button type="button" class="ill-secondary" data-act="manage-prescription">'+
  (c.status==="closed"?'처방 이력 펼치기':'처방 목록·수정 열기')+'</button></div>'+
  '<p class="ill-muted">체온과 복용 기록은 화면 위쪽에서 입력하고 조회합니다.</p></div>');
}
function prescriptionEntryPanel(c){
 if(!c||c.status!=="active")return "";
 return card("처방 등록 · JSON / 직접 입력",
  prescriptionJsonForm(c)+
  '<div class="ill-prescription-manual">'+medicationGroupForm(c)+'</div>',
  "ill-prescription-entry");
}
function registeredMedicinePanel(c){
 const legacy=c.medications?.length?legacyPanel(c):"";
 return '<section class="ill-medicine-list" aria-label="등록한 약 리스트">'+
  '<h3>등록한 약 리스트</h3>'+
  groupPanel(c)+legacy+
  '</section>';
}
function doseEditForm(c,entries){
 const record=entries.find(e=>e.id===editDoseId&&e.groupId===editDoseGroupId&&e.legacy===editDoseLegacy);
 if(!record)return "";
 const group=record.legacy?c.medications.find(m=>m.id===record.groupId):
  c.medicationGroups.find(g=>g.id===record.groupId);
 if(!group)return "";
 const drugs=record.legacy?[]:(record.items.length?record.items:(group.items||[]));
 const values=record.legacy?
  '<label>실제 복용량 (mL)<input type="number" name="actualAmountMl" min="0.01" max="100" step="any" value="'+attr(record.items[0]?.amount??group.doseMl??"")+'"></label>':
  '<div class="ill-edit-drugs"><strong>실제 복용량 · 약별 수정</strong>'+drugs.map(drug=>
   '<label>'+E(drug.name)+' ('+E(drug.unit)+')'+
   '<input type="hidden" name="doseDrugId" value="'+attr(drug.id)+'">'+
   '<input type="hidden" name="doseDrugName" value="'+attr(drug.name)+'">'+
   '<input type="hidden" name="doseDrugUnit" value="'+attr(drug.unit)+'">'+
   '<input type="number" name="doseDrugAmount" min="0.0001" max="100" step="any" value="'+attr(drug.amount??"")+'"></label>').join("")+
   '</div>';
 return '<form data-form="edit-dose" class="ill-edit-record">'+
  '<h4>이전 복용 기록 수정 · '+E(groupMedicineLabel(record.legacy?{items:[{name:group.name,amount:group.doseMl,unit:"mL"}]}:group,true))+'</h4>'+
  '<input type="hidden" name="editId" value="'+attr(record.id)+'">'+
  '<input type="hidden" name="groupId" value="'+attr(record.groupId)+'">'+
  '<input type="hidden" name="legacy" value="'+(record.legacy?'yes':'no')+'">'+
  '<div class="ill-edit-grid">'+
  '<label>실제 복용 시각<input type="datetime-local" name="at" required value="'+localInput(record.at)+'"></label>'+
  '<label>상태<select name="status"><option value="taken"'+(record.status==="taken"?' selected':'')+'>복용 완료</option>'+
  '<option value="skipped"'+(record.status==="skipped"?' selected':'')+'>미복용</option></select></label></div>'+
  values+
  '<label>메모<input name="note" maxlength="300" value="'+attr(record.note)+'"></label>'+
  '<p class="ill-muted">변경한 수량은 당시 실제 먹인 양이어야 합니다. 현재 처방량과 혼동하지 마세요. 미복용으로 바꾸면 실제 복용량은 비워집니다.</p>'+
  '<div class="ill-record-actions"><button type="submit" class="ill-primary">복용 기록 수정 저장</button>'+
  '<button type="button" class="ill-secondary" data-act="cancel-edit-dose">취소</button></div></form>';
}
function medicationTimeline(c){
 const day=temperatureDay||dayKey(nowIso()),entries=dailyMedicationEvents(c,day);
 const totalTaken=entries.filter(e=>e.status==="taken").length;
 const skipped=entries.filter(e=>e.status==="skipped").length;
 const dateTitle=day===dayKey(nowIso())?"오늘 복용 기록":"복용 기록 · "+day;
 const controls='<div class="ill-dose-nav">'+
  '<button type="button" data-act="dose-day-prev" aria-label="전날 복용 기록">‹</button>'+
  '<strong>'+E(dateTitle)+'</strong>'+
  '<button type="button" data-act="dose-day-next" aria-label="다음날 복용 기록">›</button>'+
  (day!==dayKey(nowIso())?'<button type="button" data-act="dose-day-today" class="ill-secondary">오늘</button>':'')+
  '</div>';
 const summary='<div class="ill-dose-stats"><div>복용 완료<strong>'+totalTaken+'회</strong></div>'+
  '<div>미복용 기록<strong>'+skipped+'회</strong></div>'+
  '<div>실제 기록<strong>'+entries.length+'건</strong></div></div>';
 const history=entries.length?
  '<div class="ill-dose-timeline" aria-label="선택한 날짜의 복약 시간별 이력">'+
  entries.map(e=>{
   const time=displayTime(e.at);
   const amount=e.status==="taken"?
    (e.items.length?e.items.map(item=>E(item.name)+' <b>'+E(doseLabel(item.amount,item.unit))+'</b>').join('<span class="ill-dose-item-sep"></span>'):
     '<span class="ill-muted">실제 투약량 미기록</span>'):
    '<span class="ill-muted">복용하지 않음 (실제 투약량 없음)</span>';
   return '<article class="ill-dose-event '+(e.status==="skipped"?"skipped":"taken")+'">'+
    '<time>'+E(time)+'</time><div class="ill-dose-event-body">'+
    '<div class="ill-dose-event-head"><strong>'+E(e.name)+'</strong>'+
    '<span class="ill-tag">'+(e.status==="skipped"?"미복용":"복용 완료")+'</span></div>'+
    '<div class="ill-dose-event-items">'+amount+'</div>'+
    (e.note?'<p>'+E(e.note)+'</p>':'')+
    '<div class="ill-record-actions"><button type="button" class="ill-secondary" data-act="edit-dose" data-id="'+attr(e.id)+'" data-'+(e.legacy?'med':'group')+'="'+attr(e.groupId)+'">수정</button>'+
    '<button type="button" class="ill-text-danger" data-act="'+(e.legacy?'remove-dose':'remove-group-event')+
    '" data-id="'+attr(e.id)+'" data-'+(e.legacy?'med':'group')+'="'+attr(e.groupId)+'">삭제</button></div>'+
    '</div></article>';
  }).join("")+'</div>':
  '<div class="ill-dose-empty">이 날짜에 등록된 복용·미복용 기록이 없습니다.</div>';
 const deletedWithEvents=c.medicationGroups.filter(g=>g.deletedAt&&g.events.some(e=>dayKey(e.at)===day));
 const archivedNotice=deletedWithEvents.length?
  '<p class="ill-muted">삭제 보관된 묶음 '+deletedWithEvents.length+'개의 복약 이력은 아래 ‘삭제한 묶음’에서 복원할 때 다시 표시됩니다.</p>':'';
 return card("복용 내역 · 시간별 서머리",
  controls+summary+history+doseEditForm(c,entries)+archivedNotice,
  "ill-dose-summary");
}
function legacyPanel(c){
 if(!c.medications.length)return "";
 const rows=c.medications.map(m=>
  '<article class="ill-old-med">'+
  '<div class="ill-old-med-head"><strong>'+E(m.name)+'</strong>'+
  '<span class="ill-tag">'+(m.active?"복용 중":"복용 종료")+'</span></div>'+
  '<p class="ill-muted">1회 '+E(doseLabel(m.doseMl,"mL"))+
   (m.intervalHours?' · 처방 간격 '+E(m.intervalHours)+'시간':'')+
   ' · 복용 기록 '+(m.doses||[]).length+'건</p>'+
  (c.status==="active"?'<div class="ill-record-actions">'+
   '<button type="button" class="ill-secondary" data-act="edit-med" data-id="'+attr(m.id)+'">처방 수정</button>'+
   (m.active?'<button type="button" class="ill-secondary" data-act="end-med" data-id="'+attr(m.id)+'">복용 종료</button>':
     '<button type="button" class="ill-secondary" data-act="resume-med" data-id="'+attr(m.id)+'">복용 재개</button>')+
   '</div>':'')+'</article>').join("");
 return '<details class="ill-legacy"'+(editMedication?' open':'')+'>'+
  '<summary>이전 개별 처방 '+c.medications.length+'건 (기록 보존)</summary>'+
  '<p class="ill-muted">실제 복용 입력·수정은 화면 위쪽 ‘바로 기록하기’와 복용 서머리에서 진행합니다.</p>'+
  '<div class="ill-old-list">'+rows+'</div>'+
  (c.status==="active"?medicationForm(c):"")+'</details>';
}
// Keep original readings unchanged. A graph is derived from readings on
// the chosen local calendar day, in actual chronological order.
function dailyTemperatureReadings(temperatures,date){
 return (temperatures||[]).filter(t=>dayKey(t.at)===date&&Number.isFinite(t.celsius))
  .sort((a,b)=>at(a.at)-at(b.at)||String(a.id||"").localeCompare(String(b.id||"")));
}
function quickTemperatureForm(c){
 return '<form data-form="temp" class="ill-temp-quick">'+
  '<label>체온 <span>(℃)</span><input required type="text" inputmode="decimal" autocomplete="off" maxlength="4" name="celsius" placeholder="38.5" aria-describedby="illTempPreview"></label>'+
  '<button type="submit" class="ill-primary">체온 저장</button>'+
  '<small id="illTempPreview" data-temp-preview>385 입력 → 38.5℃로 자동 표시</small>'+
  '<details class="ill-temp-details"><summary>측정 시각·부위·메모 (선택)</summary>'+
  '<label>측정 시각<input required type="datetime-local" name="at" value="'+localInput(nowIso())+'"></label>'+
  '<label>측정 부위<select name="site">'+siteOpts()+'</select></label>'+
  '<label>메모<input name="note" maxlength="300" placeholder="해열제 전후 등"></label></details>'+
  '</form>';
}
function quickEntryPanel(c){
 if(c.status!=="active")return "";
 return card("바로 기록하기",
  '<p class="ill-quick-subtitle">체온과 복용 기록을 화면 위쪽에서 바로 입력합니다. 기록 시각은 필요하면 수정할 수 있습니다.</p>'+
  (lastActionFeedback?'<p class="ill-entry-feedback" role="status">'+E(lastActionFeedback)+'</p>':'')+
  '<div class="ill-quick-grid">'+
  '<div class="ill-quick-unit"><h4>🌡️ 체온 측정</h4>'+quickTemperatureForm(c)+'</div>'+
  '<div class="ill-quick-unit"><h4>💊 약 복용</h4>'+quickMedicineForm(c)+'</div>'+
  '</div>'+
  '<p class="ill-muted ill-quick-foot">복약 지시가 우선입니다. 처방 간격을 입력하지 않은 약에는 지연 시각을 추정하지 않습니다.</p>',
  "ill-quick-card");
}
function quickMedicineForm(c){
 const activeGroups=c.medicationGroups.filter(g=>!g.deletedAt&&g.active);
 const legacyActive=c.medications.filter(m=>m.active);
 if(!activeGroups.length&&!legacyActive.length)
  return '<p class="ill-muted">현재 복용할 약이 없습니다. 처방을 등록한 뒤 이곳에서 복용 기록을 남길 수 있습니다.</p>'+
   '<button type="button" class="ill-secondary" data-act="manage-prescription">처방 등록하기</button>';
 const groupOptions=activeGroups.map(g=>{
  const details=(g.items||[]).map(i=>i.name+" "+doseLabel(i.amount,i.unit)).join(" · ");
  return '<option value="'+attr(g.id)+'" data-drugs="'+attr(details)+'">'+
   E(groupMedicineLabel(g,true))+(g.timesPerDay?' · 하루 '+E(g.timesPerDay)+'회':'')+'</option>';
 }).join("");
 const legacyOptions=legacyActive.map(m=>{
  const details=m.name+" "+doseLabel(m.doseMl,"mL");
  return '<option value="legacy:'+attr(m.id)+'" data-drugs="'+attr(details)+'">'+
   E(details)+' · 기존 개별 처방</option>';
 }).join("");
 const first=activeGroups[0];
 const firstPreview=first?(first.items||[]).map(i=>i.name+" "+doseLabel(i.amount,i.unit)).join(" · "):
  legacyActive[0].name+" "+doseLabel(legacyActive[0].doseMl,"mL");
 return '<form data-form="group-dose" class="ill-dose-quick">'+
  '<label>복용할 약 선택<select name="groupId">'+groupOptions+legacyOptions+'</select></label>'+
  '<p class="ill-dose-selection" data-group-preview aria-live="polite">'+E(firstPreview)+'</p>'+
  '<p class="ill-muted ill-dose-warning">‘복용 완료’는 선택한 약을 모두 실제로 먹인 경우에만 기록하세요.</p>'+
  '<div class="ill-quick-dose-grid">'+
  '<label>실제 복용 시각<span class="ill-time-control"><input type="datetime-local" name="at" required value="'+localInput(nowIso())+'">'+
  '<button type="button" class="ill-secondary" data-act="dose-time-now" aria-label="복용 시각을 현재 시각으로 변경">지금</button></span></label>'+
  '<label>복용 여부<select name="status"><option value="taken">복용 완료</option>'+
  '<option value="skipped">미복용</option></select></label></div>'+
  '<details class="ill-dose-note"><summary>메모 추가 (선택)</summary>'+
  '<label>메모<input name="note" maxlength="300" placeholder="예: 외출 중, 복용 지연"></label></details>'+
  '<button type="submit" class="ill-primary">복용 기록 저장</button></form>';
}
function temperatureEditForm(c){
 const record=c.temperatures.find(t=>t.id===editTemperatureId);
 if(!record)return "";
 return '<form data-form="edit-temp" class="ill-edit-record">'+
  '<h4>체온 기록 수정</h4><input type="hidden" name="editId" value="'+attr(record.id)+'">'+
  '<div class="ill-edit-grid"><label>측정 시각<input required type="datetime-local" name="at" value="'+localInput(record.at)+'"></label>'+
  '<label>측정 체온 (℃)<input required name="celsius" inputmode="decimal" maxlength="4" value="'+attr(record.celsius.toFixed(1))+'"></label>'+
  '<label>측정 부위<select name="site">'+siteOpts(record.site)+'</select></label>'+
  '<label>메모<input name="note" maxlength="300" value="'+attr(record.note)+'"></label></div>'+
  '<div class="ill-record-actions"><button class="ill-primary" type="submit">체온 수정 저장</button>'+
  '<button type="button" class="ill-secondary" data-act="cancel-edit-temp">취소</button></div></form>';
}
function temperatureTrend(c){
 const date=temperatureDay,readings=dailyTemperatureReadings(c.temperatures,date);
 const today=dayKey(nowIso()),selectedToday=date===today;
 const label=(Number(date.slice(5,7))||0)+"월 "+(Number(date.slice(8,10))||0)+"일";
 let chart;
 if(!readings.length){
  chart='<div class="ill-trend-empty">이날 측정한 체온이 없습니다.<small>체온을 기록하면 시각별 변화가 그래프로 연결됩니다.</small></div>';
 }else{
  const left=41,right=339,top=19,bottom=132;
  const minReading=Math.min(...readings.map(t=>t.celsius)),maxReading=Math.max(...readings.map(t=>t.celsius));
  let low=Math.max(30,Math.floor((minReading-.35)*2)/2);
  let high=Math.min(43,Math.ceil((maxReading+.35)*2)/2);
  if(high-low<.5){low=Math.max(30,minReading-1);high=Math.min(43,maxReading+1);}
  if(high<=low)high=low+1;
  const x=t=>{
   const d=new Date(t.at);
   const minute=d.getHours()*60+d.getMinutes()+d.getSeconds()/60;
   return +(left+(right-left)*minute/1440).toFixed(2);
  };
  const y=t=>+(bottom-(t-low)/(high-low)*(bottom-top)).toFixed(2);
  const grid=[low,(low+high)/2,high].map(v=>
   '<line x1="'+left+'" y1="'+y(v)+'" x2="'+right+'" y2="'+y(v)+'" class="ill-trend-grid"/>'+
   '<text x="'+(left-7)+'" y="'+(y(v)+3)+'" text-anchor="end" class="ill-trend-axis">'+v.toFixed(1)+'</text>').join("");
  const ticks=[0,6,12,18,24].map(h=>{
   const xx=left+(right-left)*h/24;
   return '<line x1="'+xx+'" y1="'+top+'" x2="'+xx+'" y2="'+bottom+'" class="ill-trend-grid-x"/>'+
    '<text x="'+xx+'" y="156" text-anchor="middle" class="ill-trend-axis">'+String(h).padStart(2,"0")+'</text>';
  }).join("");
  const line=readings.length>1?'<polyline points="'+readings.map(t=>x(t)+','+y(t.celsius)).join(' ')+
   '" class="ill-trend-line"/>':'';
  const dots=readings.map((t,i)=>{
   const time=new Date(t.at).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false});
   return '<circle cx="'+x(t)+'" cy="'+y(t.celsius)+'" r="'+(i===readings.length-1?5:4)+'" class="ill-trend-dot">'+
    '<title>'+E(time)+' · '+t.celsius.toFixed(1)+'℃</title></circle>';
  }).join("");
  chart='<svg class="ill-trend-svg" viewBox="0 0 356 170" role="img" aria-label="'+label+
   ' 체온 시각별 변화 그래프, 측정 '+readings.length+'회">'+
   grid+ticks+line+dots+'</svg>';
 }
 const first=readings[0],last=readings[readings.length-1],min=readings.length?Math.min(...readings.map(t=>t.celsius)):null,
  max=readings.length?Math.max(...readings.map(t=>t.celsius)):null;
 const stats=readings.length?'<div class="ill-trend-stats"><span>측정 <b>'+readings.length+'회</b></span>'+
  '<span>최저 <b>'+min.toFixed(1)+'℃</b></span><span>최고 <b>'+max.toFixed(1)+'℃</b></span>'+
  (readings.length>1?'<span>첫 '+first.celsius.toFixed(1)+' → 최근 <b>'+last.celsius.toFixed(1)+'℃</b></span>':'')+'</div>':'';
 const recent=[...readings].reverse();
 const history=recent.length?
  '<div class="ill-temp-history"><h4>측정 이력 · '+label+' ('+recent.length+'회)</h4>'+
   recent.map(t=>'<div class="ill-temp-history-row"><time datetime="'+E(t.at)+'">'+
     E(new Date(t.at).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false}))+
    '</time><strong>'+t.celsius.toFixed(1)+'℃</strong><span>'+E(SITES[t.site]||"기타")+'</span>'+
    (t.note?'<small>'+E(t.note)+'</small>':'')+
    '<div class="ill-record-actions"><button type="button" class="ill-secondary" data-act="edit-temp" data-id="'+attr(t.id)+'">수정</button>'+
    '<button type="button" class="ill-text-danger" data-act="remove-temp" data-id="'+attr(t.id)+'">삭제</button></div></div>').join("")+
  '</div>':'';
 return '<section class="ill-day-trend"><div class="ill-day-trend-head"><h4>'+label+
   (selectedToday?' · 오늘':'')+' 체온 변화</h4>'+
   (!selectedToday?'<button type="button" data-act="temp-today" class="ill-secondary">오늘 보기</button>':'')+
  '</div>'+stats+chart+history+temperatureEditForm(c)+
  '<p class="ill-muted">실제로 측정한 시점만 연결했습니다. 측정 사이 시간의 체온은 확인할 수 없습니다.</p></section>';
}
function feverHeat(c){
 const [y,m]=month.split("-").map(Number);
 const days=new Date(y,m,0).getDate(),first=(new Date(y,m-1,1).getDay()+6)%7;
 const bands=dailyMax(c.temperatures);
 const visitDays={};
 for(const v of c.visits||[]){const d=dayKey(v.at);if(d)visitDays[d]=(visitDays[d]||0)+1;}
 let cells=["월","화","수","목","금","토","일"].map(d=>'<span class="ill-dow">'+d+'</span>').join("");
 for(let i=0;i<first;i++)cells+='<span></span>';
 for(let d=1;d<=days;d++){
  const date=month+"-"+String(d).padStart(2,"0"),v=bands[date];
  cells+='<button type="button" data-act="temp-day" data-day="'+date+'" aria-pressed="'+(date===temperatureDay?"true":"false")+
   '" aria-label="'+date+' · '+(v===undefined?"체온 미측정":v.toFixed(1)+"도")+
   (visitDays[date]?' · 병원 방문 '+visitDays[date]+'회':'')+
   '" class="ill-heat '+heatBand(v)+(date===temperatureDay?' selected':'')+
   '" title="'+date+' · '+(v===undefined?"미측정":v.toFixed(1)+"℃")+
   (visitDays[date]?' · 병원 방문 '+visitDays[date]+'회':'')+'">'+d+
   (visitDays[date]?'<span class="ill-hospital-pin" aria-hidden="true">🏥</span>':'')+
   '<strong>'+(v===undefined?"·":v.toFixed(1))+'</strong></button>';
 }
 return card("체온 · 열 히트맵",
  '<div class="ill-heat-head"><button type="button" data-act="month-prev" aria-label="이전 달">‹</button><strong>'+y+'년 '+m+'월</strong>'+
   '<button type="button" data-act="month-next" aria-label="다음 달">›</button></div>'+
  '<div class="ill-heat-grid">'+cells+'</div>'+
  '<div class="ill-temp-legend"><span>미측정</span><span>37.5 미만</span><span>37.5~37.9</span><span>38~38.9</span><span>39 이상</span><span class="ill-hospital-legend">🏥 병원 방문</span></div>'+
  (visitDays[temperatureDay]?'<div class="ill-visit-on-day"><strong>🏥 선택 날짜 진료 '+visitDays[temperatureDay]+'건</strong>'+
    c.visits.filter(v=>dayKey(v.at)===temperatureDay).sort((a,b)=>at(a.at)-at(b.at)).map(v=>
     '<p>'+E(displayTime(v.at))+' · '+E(v.hospital)+(v.diagnosis?' · '+E(v.diagnosis):'')+'</p>').join("")+
   '</div>':'')+
  temperatureTrend(c)+
  '<p class="ill-muted">달력에서 날짜를 누르면 해당 날짜의 체온 그래프와 측정 이력을 볼 수 있습니다. 색상은 그날의 최고 실측 체온입니다.</p>');
}
function closure(c){
 if(c.status==="closed")return "";
 const active=[...c.medications.filter(m=>m.active),...c.medicationGroups.filter(g=>g.active&&!g.deletedAt)];
 return card("질병 종료",
  '<details><summary>증상 회복·처방 종료 확인 후 질병 종료</summary>'+
  '<p class="ill-muted">열·증상이 안정화되고 처방받은 복용 과정이 완료되었는지 확인한 뒤 종료하세요. 체온만으로 처방약을 중단하지 않습니다.</p>'+
  (active.length?'<p class="ill-muted">현재 복용 중으로 표시된 처방 '+active.length+'개는 질병 종료 처리 시 자동으로 ‘복용 종료’ 상태가 됩니다. 지난 복용 기록은 유지됩니다.</p>':'')+
  '<form data-form="close" class="ill-fields">'+
  '<label class="ill-check"><input type="checkbox" name="recovered" required> 현재 증상·체온이 안정화되었다고 확인함</label>'+
  '<label class="ill-check"><input type="checkbox" name="done" required> 필요한 복약 일정이 처방 지시대로 종료되었음을 확인함</label>'+
  '<label>종료 메모<input name="note" maxlength="500" placeholder="상태 호전, 최종 처방 등"></label>'+
  '<button class="ill-primary" type="submit">질병 종료 기록</button></form></details>');
}
function syncPanel(){
 const count=Object.keys(model.pending).length;
 const conflicts=Object.keys(model.conflicts).length;
 const label=connected?"서버 연결됨":"서버 확인 필요";
 return '<details class="ill-utilities"'+(noticeError||conflicts?' open':'')+'>'+
  '<summary><strong>기록 백업·동기화</strong><small>'+E(label)+' · 대기 '+count+'건'+
  (conflicts?' · 충돌 '+conflicts+'건':'')+'</small></summary>'+
  '<div class="ill-utilities-body"><p class="'+(noticeError?'ill-alert':'ill-muted')+'" role="status">'+E(notice)+'</p>'+
  '<p class="ill-muted">기기에 우선 저장하고 기존 Google Sheets와 동기화합니다.</p>'+
  '<div class="ill-row-actions"><button type="button" data-act="backup">기기 JSON 백업</button>'+
  '<button type="button" data-act="export-illness-xml">XML 기록 추출</button>'+
  '<button type="button" data-act="refresh">서버 재조회</button></div></div></details>';
}
function conflictsView(){
 const ids=Object.keys(model.conflicts);if(!ids.length)return "";
 return card("서버·기기 원본 차이",'<p class="ill-alert">두 기기에 다른 값이 있습니다. 자동 덮어쓰기를 중단했습니다. 먼저 양쪽 원본을 백업하고 선택하세요.</p>'+
 ids.map(id=>'<div class="ill-history-item"><b>'+E(model.cases[id]?.title||id)+'</b>'+
 '<div class="ill-row-actions"><button data-act="choose-server" data-id="'+attr(id)+'">서버 원본 선택</button>'+
 '<button data-act="choose-local" data-id="'+attr(id)+'">기기 원본 선택 후 서버 보관·갱신</button></div></div>').join(""));
}
function render(){
 hydrate();active=true;root=document.getElementById("main");if(!root)return;
 const openEpisode=root.dataset.illnessEpisode||"";
 const keepManagerOpen=openEpisode===selected&&root.querySelector?.(".ill-manager")?.open===true;
 const c=current();
 root.innerHTML='<div class="ill-root"><div class="ill-heading"><h2>유하 질병 기록</h2>'+
  '<p>체온과 복약을 기록하고 경과를 확인하세요.</p></div>'+
  illnessSelect()+
  (c?recordHeading(c)+quickEntryPanel(c)+feverHeat(c)+medicationTimeline(c)+currentPrescriptionPanel(c)+visitForm(c)+
    medicationManagement(c,keepManagerOpen)+closure(c):
   card("기록이 없습니다",'<p class="ill-muted">발생 시각과 증상을 기록해 시작하세요.</p>'))+
  episodeForm()+
  syncPanel()+
  conflictsView()+'</div>';
 root.dataset.illnessEpisode=selected||"";
 if(!root.dataset.illnessBound){root.dataset.illnessBound="true";
  root.addEventListener("submit",onSubmit);
  root.addEventListener("click",onClick);
  root.addEventListener("input",onInput);
  root.addEventListener("focusout",onTemperatureBlur);
  root.addEventListener("change",onQuickSelectionChange);
 }
 if(!timer)timer=setInterval(()=>{if(root&&root.querySelector(".ill-root"))refreshStatusText();},60000);
 if(!initialFetchStarted){initialFetchStarted=true;void connect();}
}
function refreshStatusText(){
 const c=current();if(!c)return;
 // Only update due/overdue labels, without rerendering an actively edited form.
 const nodes=root.querySelectorAll(".ill-med");
 let missed=0;
 c.medications.forEach((m,i)=>{
  const g=guidance(m),node=nodes[i];if(!node)return;
  if(g.state==="overdue")missed++;
  node.className="ill-med "+g.state;
  const status=node.querySelector(".ill-guidance");if(status)status.textContent=g.text;
 });
 for(const g of c.medicationGroups.filter(g=>!g.deletedAt)){
  const next=groupGuidance(g),node=root.querySelector('[data-ill-group-id="'+g.id+'"]');
  if(next.state==="overdue")missed++;
  if(!node)continue;
  node.className="ill-group "+next.state;
  const message=node.querySelector(".ill-guidance");if(message)message.textContent=next.text;
 }
 const count=root.querySelector("[data-ill-overdue]");
 if(count){count.textContent=missed+"건 복약 예정 확인";count.style.display=missed?"":"none";}
}
function stop(){if(timer){clearInterval(timer);timer=null;}
 root=null;active=false;initialFetchStarted=false;connected=false;
 syncEpoch++;busy=false;
}
function onInput(e){
 if(e.target?.name!=="celsius")return;
 const input=e.target,formatted=formatTemperatureInput(input.value);
 if(formatted!==input.value){
  input.value=formatted;
  // After inserting the decimal, put the caret after the last digit.
  if(typeof input.setSelectionRange==="function")
   input.setSelectionRange(formatted.length,formatted.length);
 }
 updateTemperaturePreview(input.value);
}
function onQuickSelectionChange(e){
 if(e.target?.name!=="groupId")return;
 const select=e.target;
 const preview=select.closest?.(".ill-quick-unit")?.querySelector?.("[data-group-preview]");
 if(preview)preview.textContent=select.selectedOptions?.[0]?.dataset?.drugs||"";
}
function onTemperatureBlur(e){
 if(e.target?.name!=="celsius")return;
 const input=e.target,formatted=formatTemperatureInput(input.value,true);
 if(formatted!==input.value)input.value=formatted;
 updateTemperaturePreview(input.value);
}
function updateTemperaturePreview(value){
 const p=root?.querySelector("[data-temp-preview]");if(!p)return;
 const n=parseTemperature(value);
 p.textContent=n===null?(String(value).trim()?"체온 값을 확인해 주세요.":"숫자 세 자리 입력 시 소수점을 자동 표시합니다."):n.toFixed(1)+"℃로 저장됩니다";
}
function get(form,key){return String(new FormData(form).get(key)||"").trim();}
function need(condition,message){if(!condition)throw Error(message);}
function onSubmit(e){
 const form=e.target.closest("[data-form]");if(!form)return;
 e.preventDefault();
 try{
  const type=form.dataset.form;
  if(type==="episode"){
   const title=get(form,"title");need(title,"질병 이름을 입력해 주세요");
   newEpisode(title,inputTime(get(form,"onset")),get(form,"symptoms"),get(form,"note"));return;
  }
  const c=current();need(c,"질병 기록을 먼저 선택해 주세요");
  if(c.status==="closed"&&!["close","edit-temp","edit-dose","visit"].includes(type))
   throw Error("종료된 질병입니다. 기록을 다시 연 뒤 새 내용을 입력해 주세요.");
  if(c.status==="closed"&&type==="visit"&&!get(form,"editId"))
   throw Error("종료된 질병에는 새로운 병원 방문을 등록할 수 없습니다.");
  if(type==="edit-episode"){
   const title=get(form,"title");need(title,"질병 이름을 입력해 주세요");
   const onsetAt=inputTime(get(form,"onset"));
   changeCase(c.id,r=>{r.title=title;r.onsetAt=onsetAt;r.symptoms=get(form,"symptoms");r.note=get(form,"note");});
   return;
  }
  if(type==="visit"){
   const hospital=get(form,"hospital");need(hospital,"병원명을 입력해 주세요");
   const editId=get(form,"editId");
   const visit={hospital,at:inputTime(get(form,"at")),diagnosis:get(form,"diagnosis"),notes:get(form,"notes")};
   need(!editId||c.visits.some(v=>v.id===editId),"수정할 병원 기록을 찾을 수 없습니다");
   editVisit="";temperatureDay=dayKey(visit.at);month=temperatureDay.slice(0,7);
   changeCase(c.id,r=>{
    const old=r.visits.find(v=>v.id===editId);
    if(old)Object.assign(old,visit);
    else r.visits.push({id:newId(),...visit});
   });return;
  }
  if(type==="prescription-json"){
   const parsed=parsePrescriptionJson(get(form,"prescriptionJson"));
   pendingPrescription={episodeId:c.id,result:parsed};
   const slot=root?.querySelector("#illPrescriptionPreview");
   if(slot)slot.innerHTML=prescriptionPreview(parsed);
   return;
  }
  if(type==="group"){
   const data=new FormData(form);
   const names=data.getAll("drugName"),amounts=data.getAll("drugAmount"),
    units=data.getAll("drugUnit");
   need(names.length>0&&names.length===amounts.length&&names.length===units.length&&names.length<=20,
    "약 이름과 1회량을 모두 입력해 주세요");
   const editId=get(form,"editGroupId"),old=c.medicationGroups.find(g=>g.id===editId);
   const items=names.map((name,i)=>{
    const amount=num(amounts[i]),unit=String(units[i]||"mL");
    need(String(name||"").trim(),"약 이름을 입력해 주세요");
    need(validAmount(amount,unit),"1회량은 소수 둘째 자리까지 입력해 주세요. g 처방 원문은 넷째 자리까지 보존합니다.");
    need(MED_UNITS.includes(unit),"복용 단위를 선택해 주세요");
    return {id:old?.items[i]?.id||newId(),name:String(name).trim(),amount,unit};
   });
   const mode=get(form,"mode")==="prn"?"prn":"scheduled",interval=num(get(form,"intervalHours"));
   need(mode==="prn"||interval!==null||old?.timesPerDay||copyDraft?.timesPerDay,"정기 복용 묶음은 처방 간격이 필요합니다. 횟수만 있는 가져오기 기록은 미확인으로 보관합니다.");
   need(interval===null||(interval>=.5&&interval<=72),"처방 간격을 확인해 주세요 (0.5~72시간)");
   const ends=get(form,"endsAt"),group={
    name:get(form,"groupName")||"복용 묶음 "+(c.medicationGroups.length+1),
    mode,intervalHours:interval,endsAt:ends?inputTime(ends):"",
    visitId:get(form,"visitId"),items,
    timesPerDay:copyDraft?.timesPerDay??old?.timesPerDay??null,
    days:copyDraft?.days??old?.days??null,
    sourceDate:copyDraft?.sourceDate??old?.sourceDate??"",
    sourceKind:copyDraft?.sourceKind??old?.sourceKind??""
   };
   editGroup="";copyDraft=null;
   changeCase(c.id,r=>{
    const currentGroup=r.medicationGroups.find(g=>g.id===editId);
    if(currentGroup)Object.assign(currentGroup,group);
    else r.medicationGroups.push({id:newId(),...group,active:true,events:[]});
   });
   return;
  }
  if(type==="group-dose"){
   const id=get(form,"groupId"),status=get(form,"status")==="skipped"?"skipped":"taken";
   const time=inputTime(get(form,"at")),note=get(form,"note");
   temperatureDay=dayKey(time);month=temperatureDay.slice(0,7);
   if(id.startsWith("legacy:")){
    const medId=id.slice("legacy:".length);
    const med=c.medications.find(m=>m.id===medId&&m.active);
    need(med,"복용 중인 개별 약을 선택해 주세요");
    if(status==="taken")need(validAmount(med.doseMl,"mL"),"실제 복용량을 확인해 주세요");
    const next=guidance(med,new Date(time));
    const event={id:newId(),at:time,status,
     amountMl:status==="taken"?med.doseMl:null,note,
     scheduledFor:status==="skipped"&&next.dueAt?next.dueAt:""};
    changeCase(c.id,r=>r.medications.find(m=>m.id===medId).doses.push(event),
     "개별 약 복용 기록을 기기에 저장했습니다.");
    return;
   }
   const group=c.medicationGroups.find(g=>g.id===id&&g.active&&!g.deletedAt);
   need(group,"복용 중인 약 묶음을 선택해 주세요");
   need(status!=="skipped"||(group.mode==="scheduled"&&group.events.some(d=>d.status==="taken")),
    "정기 복용의 첫 실제 복용 이후에만 미복용을 기록할 수 있습니다");
   const next=groupGuidance(group,new Date(time));
   const event={id:newId(),at:time,status,note,
    scheduledFor:status==="skipped"&&next.dueAt?next.dueAt:"",
    items:status==="taken"?clone(group.items):[]};
   changeCase(c.id,r=>r.medicationGroups.find(g=>g.id===id).events.push(event),
    status==="skipped"?"미복용 기록을 기기에 저장했습니다.":"약 "+group.items.length+"종의 복용 시각을 기기에 저장했습니다.");
   return;
  }
  if(type==="medicine"){
   const name=get(form,"name"),mode=get(form,"mode")==="prn"?"prn":"scheduled";
   const dose=num(get(form,"doseMl")),interval=num(get(form,"intervalHours"));
   need(name,"정확한 약 이름을 입력해 주세요");
   need(dose!==null&&dose>0&&dose<=100,"1회 처방 용량(mL)을 정확히 입력해 주세요");
   need(mode==="prn"||interval!==null,"정기 복용약은 실제 처방 간격(시간)이 필요합니다");
   need(interval===null||(interval>=.5&&interval<=72),"처방 간격은 0.5~72시간 범위에서 입력해 주세요");
   const id=get(form,"editId"),end=get(form,"endsAt");
   const payload={name,mode,doseMl:dose,intervalHours:interval,
    visitId:get(form,"visitId"),instructions:get(form,"instructions"),endsAt:end?inputTime(end):""};
   changeCase(c.id,r=>{
    const m=r.medications.find(x=>x.id===id);
    if(m)Object.assign(m,payload);
    else r.medications.push({id:newId(),...payload,active:true,doses:[]});
   });editMedication="";return;
  }
  if(type==="dose"){
   const id=get(form,"medicationId"),m=c.medications.find(x=>x.id===id&&x.active);
   need(m,"복용 중인 처방약을 선택해 주세요");
   const status=get(form,"status")==="skipped"?"skipped":"taken";
   const atTime=inputTime(get(form,"at")),dose=num(get(form,"amountMl"),m.doseMl);
   if(status==="taken")need(dose!==null&&dose>0&&dose<=100,"실제 복용 용량(mL)을 확인해 주세요");
   const g=guidance(m,new Date(atTime));
   temperatureDay=dayKey(atTime);month=temperatureDay.slice(0,7);
   const log={id:newId(),at:atTime,status,amountMl:status==="taken"?dose:null,
     note:get(form,"note"),scheduledFor:status==="skipped"&&g.dueAt?g.dueAt:""};
   changeCase(c.id,r=>r.medications.find(x=>x.id===id).doses.push(log));return;
  }
  if(type==="edit-temp"){
   const id=get(form,"editId"),record=c.temperatures.find(t=>t.id===id);
   need(record,"수정할 체온 기록을 찾을 수 없습니다.");
   const celsius=parseTemperature(get(form,"celsius"));
   need(celsius!==null,"체온을 확인해 주세요. 예: 385 → 38.5℃");
   const site=get(form,"site");need(SITES[site],"측정 부위를 선택해 주세요.");
   const time=inputTime(get(form,"at")),note=get(form,"note");
   editTemperatureId="";temperatureDay=dayKey(time);month=temperatureDay.slice(0,7);
   changeCase(c.id,r=>{
    const row=r.temperatures.find(t=>t.id===id);
    Object.assign(row,{at:time,celsius,site,note});
   });return;
  }
  if(type==="edit-dose"){
   const id=get(form,"editId"),groupId=get(form,"groupId"),legacy=get(form,"legacy")==="yes";
   const owner=legacy?c.medications.find(m=>m.id===groupId):
    c.medicationGroups.find(g=>g.id===groupId);
   const currentEvent=legacy?owner?.doses.find(d=>d.id===id):owner?.events.find(d=>d.id===id);
   need(owner&&currentEvent,"수정할 복용 기록을 찾을 수 없습니다.");
   const status=get(form,"status")==="skipped"?"skipped":"taken";
   const time=inputTime(get(form,"at")),note=get(form,"note");
   let amount=null,items=[];
   if(status==="taken"){
    if(legacy){
     amount=num(get(form,"actualAmountMl"));
     need(validAmount(amount,"mL"),"실제 복용량을 소수 둘째 자리까지 입력해 주세요.");
    }else{
     const data=new FormData(form);
     const ids=data.getAll("doseDrugId"),names=data.getAll("doseDrugName"),
      units=data.getAll("doseDrugUnit"),amounts=data.getAll("doseDrugAmount");
     need(ids.length>0&&ids.length===names.length&&ids.length===units.length&&ids.length===amounts.length,
      "복용한 약별 실제량을 모두 확인해 주세요.");
     items=ids.map((value,i)=>{
      const unit=String(units[i]),v=num(amounts[i]);
      need(MED_UNITS.includes(unit)&&validAmount(v,unit),"약별 실제 복용량·단위를 확인하세요.");
      return {id:String(value),name:String(names[i]),unit,amount:v};
     });
    }
   }
   editDoseId="";editDoseGroupId="";editDoseLegacy=false;
   temperatureDay=dayKey(time);month=temperatureDay.slice(0,7);
   changeCase(c.id,r=>{
    const entry=legacy?r.medications.find(m=>m.id===groupId)?.doses.find(d=>d.id===id):
     r.medicationGroups.find(g=>g.id===groupId)?.events.find(d=>d.id===id);
    if(!entry)return;
    Object.assign(entry,{at:time,status,note});
    if(legacy)entry.amountMl=status==="taken"?amount:null;
    else entry.items=status==="taken"?items:[];
    if(status==="taken")entry.scheduledFor="";
   });return;
  }
  if(type==="temp"){
   const n=parseTemperature(get(form,"celsius"));
   need(n!==null,"체온을 확인해 주세요. 예: 385 → 38.5℃, 38 → 38.0℃");
   const row={id:newId(),at:inputTime(get(form,"at")),celsius:n,site:get(form,"site"),note:get(form,"note")};
   // Returning to the recorded date makes backdated measurements visible immediately.
   temperatureDay=dayKey(row.at);
   month=temperatureDay.slice(0,7);
   changeCase(c.id,r=>r.temperatures.push(row),
    "체온 "+n.toFixed(1)+"℃를 기기에 저장했습니다.");return;
  }
  if(type==="close"){
   need(c.status==="active","이미 종료된 질병입니다");
   need(new FormData(form).get("recovered")==="on"&&new FormData(form).get("done")==="on",
    "상태 정상화와 처방 종료를 확인해 주세요");
   if(!window.confirm("필요한 복약 일정이 종료되었다고 직접 확인하셨나요? 기록 종료는 처방약 중단 지시를 대신하지 않습니다."))return;
   changeCase(c.id,r=>{r.status="closed";r.closedAt=nowIso();r.recoveryConfirmed=true;
    r.noFurtherMedicationConfirmed=true;r.closureNote=get(form,"note");
    r.medicationGroups.forEach(g=>{g.active=false;});
    r.medications.forEach(m=>{m.active=false;});
   });return;
  }
 }catch(err){notice=String(err.message||err);noticeError=true;render();}
}
function onClick(e){
 const btn=e.target.closest("[data-act]");if(!btn)return;
 const action=btn.dataset.act,id=btn.dataset.id,c=current();
 if(action==="export-illness-xml"){exportIllnessHistoryXml();return;}
 if(action==="select"){
  selected=id;lastActionFeedback="";editMedication="";editGroup="";editVisit="";editTemperatureId="";editDoseId="";editDoseGroupId="";editDoseLegacy=false;copyDraft=null;pendingPrescription=null;
  const c=current();
  temperatureDay=c?.status==="closed"&&c.temperatures.length?
   dayKey([...c.temperatures].sort((a,b)=>at(b.at)-at(a.at))[0].at):dayKey(nowIso());
  month=temperatureDay.slice(0,7);render();return;
 }
 if(action==="backup"){backup();return;}
 if(action==="copy-prescription-request"){
  void copyPrescriptionText(prescriptionChatRequest());return;
 }
 if(action==="copy-prescription-example"){
  void copyPrescriptionText(JSON.stringify(prescriptionExample(),null,2));return;
 }
 if(action==="cancel-json-import"){
  pendingPrescription=null;
  const slot=root?.querySelector("#illPrescriptionPreview");
  if(slot)slot.innerHTML="";
  return;
 }
 if(action==="confirm-json-import"){
  if(!c||c.status!=="active"||pendingPrescription?.episodeId!==c.id)return;
  const toAdd=pendingPrescription.result.groups.filter(g=>!c.medicationGroups.some(existing=>samePrescriptionGroup(g,existing)));
  if(!toAdd.length){
   pendingPrescription=null;notice="동일한 묶음이 이미 등록되어 중복 저장하지 않았습니다";noticeError=false;
   render();return;
  }
  if(!window.confirm(toAdd.length+"개 묶음을 등록할까요? 약 이름·1회량·횟수를 확인했나요?"))return;
  pendingPrescription=null;
  changeCase(c.id,r=>r.medicationGroups.push(...toAdd));
  notice=toAdd.length+"개 약 묶음을 기기에 기록했습니다";noticeError=false;
  return;
 }
 if(action==="add-drug-line"){
  const list=btn.closest(".ill-group-editor")?.querySelector(".ill-group-items");
  if(list&&list.querySelectorAll("[data-group-item]").length<20)
   list.insertAdjacentHTML("beforeend",groupItemRow());
  return;
 }
 if(action==="remove-drug-line"){
  const line=btn.closest("[data-group-item]"),list=line?.parentElement;
  if(list?.querySelectorAll("[data-group-item]").length>1)line.remove();
  else if(line){
   for(const input of line.querySelectorAll("input"))input.value="";
  }
  return;
 }

 if(action==="refresh"){if(!busy)void connect();return;}
 if(action==="choose-server"||action==="choose-local"){chooseConflict(id,action==="choose-server"?"server":"local");return;}
 if(action==="dose-day-today"){
  temperatureDay=dayKey(nowIso());month=temperatureDay.slice(0,7);render();return;
 }
 if(action==="dose-day-prev"||action==="dose-day-next"){
  const date=new Date((temperatureDay||dayKey(nowIso()))+"T12:00:00");
  date.setDate(date.getDate()+(action==="dose-day-prev"?-1:1));
  temperatureDay=dayKey(date.toISOString());month=temperatureDay.slice(0,7);
  render();return;
 }
 if(action==="temp-day"){
  const day=String(btn.dataset.day||"");
  if(/^\d{4}-\d{2}-\d{2}$/.test(day)){
   temperatureDay=day;month=day.slice(0,7);render();
  }
  return;
 }
 if(action==="temp-today"){
  temperatureDay=dayKey(nowIso());month=temperatureDay.slice(0,7);render();return;
 }
 if(action==="month-prev"||action==="month-next"){
  const [y,m]=month.split("-").map(Number),d=new Date(y,m-1+(action==="month-prev"?-1:1),1);
  month=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  const thisMonth=(current()?.temperatures||[]).filter(t=>dayKey(t.at).startsWith(month))
   .sort((a,b)=>at(b.at)-at(a.at));
  temperatureDay=thisMonth.length?dayKey(thisMonth[0].at):month+"-01";
  render();return;
 }
 if(!c)return;
 if(action==="dose-time-now"){
  const field=btn.closest?.("form")?.querySelector?.('[name="at"]');
  if(field)field.value=localInput(nowIso());
  return;
 }
 if(action==="manage-prescription"){
  const manager=root?.querySelector(".ill-manager");
  if(manager){manager.open=true;manager.scrollIntoView?.({block:"start",behavior:"smooth"});}
  return;
 }
 if(action==="edit-temp"){
  const record=c.temperatures.find(t=>t.id===id);if(!record)return;
  editTemperatureId=id;temperatureDay=dayKey(record.at);month=temperatureDay.slice(0,7);
  render();root?.querySelector('[data-form="edit-temp"]')?.scrollIntoView?.({block:"center",behavior:"smooth"});return;
 }
 if(action==="cancel-edit-temp"){editTemperatureId="";render();return;}
 if(action==="edit-dose"){
  const groupId=String(btn.dataset.group||btn.dataset.med||"");
  const legacy=Boolean(btn.dataset.med);
  const owner=legacy?c.medications.find(m=>m.id===groupId):c.medicationGroups.find(g=>g.id===groupId);
  const event=legacy?owner?.doses.find(d=>d.id===id):owner?.events.find(d=>d.id===id);
  if(!event)return;
  editDoseId=id;editDoseGroupId=groupId;editDoseLegacy=legacy;
  temperatureDay=dayKey(event.at);month=temperatureDay.slice(0,7);
  render();root?.querySelector('[data-form="edit-dose"]')?.scrollIntoView?.({block:"center",behavior:"smooth"});return;
 }
 if(action==="cancel-edit-dose"){
  editDoseId="";editDoseGroupId="";editDoseLegacy=false;render();return;
 }
 if(action==="edit-visit"){
  if(!c.visits.some(v=>v.id===id))return;
  editVisit=id;render();root?.querySelector('[data-form="visit"]')?.scrollIntoView?.({block:"center",behavior:"smooth"});return;
 }
 if(action==="cancel-edit-visit"){editVisit="";render();return;}
 if(c.status==="closed"&&action!=="reopen"){
  notice="종료된 질병입니다. 기록을 다시 연 뒤 수정해 주세요.";noticeError=true;render();return;
 }
 if(action==="go-group"){
  editGroup="";copyDraft=null;render();
  const manager=root?.querySelector(".ill-manager");
  if(manager)manager.open=true;
  const form=root?.querySelector(".ill-group-editor");
  if(form){form.open=true;form.scrollIntoView({block:"start",behavior:"smooth"});}
  return;
 }
 if(action==="edit-group"){
  copyDraft=null;editGroup=id;render();
  const form=root?.querySelector(".ill-group-editor");
  if(form){form.open=true;form.scrollIntoView({block:"start",behavior:"smooth"});}
  return;
 }
 if(action==="cancel-edit-group"){editGroup="";copyDraft=null;render();return;}
 if(action==="copy-group"){
  const g=c.medicationGroups.find(x=>x.id===id);
  if(!g)return;
  editGroup="";
  copyDraft={...clone(g),id:"",name:(g.name||"복용 묶음")+" (복사본)",
   items:g.items.map(item=>({...clone(item),id:newId()})),events:[],active:true};
  render();
  const form=root?.querySelector(".ill-group-editor");
  if(form){form.open=true;form.scrollIntoView({block:"start",behavior:"smooth"});}
  return;
 }
 if(action==="delete-group"){
  const target=c.medicationGroups.find(g=>g.id===id&&!g.deletedAt);
  if(!target)return;
  const message="‘"+target.name+"’ 묶음을 삭제할까요?\n복용 이력 "+target.events.length+
   "건은 원본에 보관되며, 일반 목록과 복약 서머리에서 제외됩니다. 나중에 복원할 수 있습니다.";
  if(!window.confirm(message))return;
  if(editGroup===id){editGroup="";copyDraft=null;}
  changeCase(c.id,r=>{
   const g=r.medicationGroups.find(x=>x.id===id);
   if(g){g.deletedAt=nowIso();g.active=false;}
  });
  return;
 }
 if(action==="restore-group"){
  const group=c.medicationGroups.find(g=>g.id===id&&g.deletedAt);
  if(!group||!window.confirm("‘"+group.name+"’ 묶음을 복원할까요? 복원 후에는 복용 종료 상태로 표시됩니다."))return;
  changeCase(c.id,r=>{
   const g=r.medicationGroups.find(x=>x.id===id);
   if(g){g.deletedAt="";g.active=false;}
  });
  return;
 }
 if(action==="take-group"){
  const group=c.medicationGroups.find(g=>g.id===id&&g.active&&!g.deletedAt);
  if(!group)return;
  temperatureDay=dayKey(nowIso());month=temperatureDay.slice(0,7);
  const evt={id:newId(),at:nowIso(),status:"taken",note:"",
   scheduledFor:"",items:clone(group.items)};
  changeCase(c.id,r=>r.medicationGroups.find(g=>g.id===id).events.push(evt));
  return;
 }
 if(action==="end-group"||action==="resume-group"){
  if(!window.confirm(action==="end-group"?
   "묶음 안 모든 약이 처방대로 완료되었거나 중단 지시를 확인했나요?":
   "이 묶음을 복용 중으로 다시 표시할까요?"))return;
  changeCase(c.id,r=>{
   const group=r.medicationGroups.find(g=>g.id===id);
   if(group)group.active=action==="resume-group";
  });return;
 }
 if(action==="remove-group-event"){
  if(!window.confirm("이 묶음 복용 기록을 삭제할까요? 삭제 전 원본은 스냅샷에 보존됩니다."))return;
  changeCase(c.id,r=>{
   const group=r.medicationGroups.find(g=>g.id===btn.dataset.group);
   if(group)group.events=group.events.filter(v=>v.id!==id);
  });return;
 }

 if(action==="reopen"){
  if(!window.confirm("종료된 질병 기록을 다시 진행 중으로 전환할까요?"))return;
  changeCase(c.id,r=>{r.status="active";r.closedAt="";r.recoveryConfirmed=false;
   r.noFurtherMedicationConfirmed=false;});return;
 }
 if(action==="edit-med"){editMedication=id;render();root?.querySelector('[data-form="medicine"]')?.scrollIntoView({block:"start",behavior:"smooth"});return;}
 if(action==="cancel-edit-med"){editMedication="";render();return;}
 if(action==="end-med"||action==="resume-med"){
  if(!window.confirm(action==="end-med"?
  "처방에 따른 복용이 완료되었거나 더 이상 복용하지 않아도 된다는 지시를 확인했나요?":
  "이 약을 복용 중 상태로 다시 설정할까요?"))return;
  changeCase(c.id,r=>{const m=r.medications.find(x=>x.id===id);if(m)m.active=action==="resume-med";});return;
 }
 const deletes={"remove-visit":"visits","remove-dose":"doses","remove-temp":"temperatures"};
 if(deletes[action]){
  if(!window.confirm("기록을 삭제하시겠습니까? 삭제 전 원본은 기기 이력에 보존됩니다."))return;
  changeCase(c.id,r=>{
   if(action==="remove-dose"){
    const m=r.medications.find(m=>m.id===btn.dataset.med);
    if(m)m.doses=m.doses.filter(x=>x.id!==id);
   }else r[deletes[action]]=r[deletes[action]].filter(x=>x.id!==id);
  });return;
 }
}
window.addEventListener("online",()=>{
 if(active&&!busy)void connect();
});
window.YuhaIllness={render,stop,model,
 _test:{normalize,guidance,groupGuidance,dailyMedicationEvents,medicationTimeline,parsePrescriptionJson,prescriptionExample,prescriptionChatRequest,samePrescriptionGroup,validAmount,parseTemperature,formatTemperatureInput,dailyTemperatureReadings,temperatureTrend,dailyMax,heatBand,sameData,absorbServer,connect,pushPending}};
})();
