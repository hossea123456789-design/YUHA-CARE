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
const MED_UNITS=["mL","포","정","방울"];
function validAmount(v){const n=num(v);return n!==null&&n>0&&n<=100&&Math.round(n*10)===n*10}
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
let loaded=false,selected="",month=isoMonth(nowIso()),connected=false,initialFetchStarted=false,busy=false;
let active=false,syncEpoch=0;
let notice="기기에 즉시 저장 · 서버 자동 동기화 준비 중",noticeError=false,editMedication="",editGroup="",timer=null,root=null;
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
function changeCase(id,modifier){
 const before=model.cases[id];if(!before)return;
 recordSnapshot("before-edit",before);
 const value=clone(before);modifier(value);
 const next=normalize(value),old=model.pending[id];
 model.cases[id]=next;
 model.pending[id]={episode:clone(next),
  expectedRevision:old?.expectedRevision??before.revision??"",
  ...(old?.resolution?{resolution:old.resolution}:{})};
 const saved=persist();if(connected&&saved)void pushPending();render();
}
function newEpisode(title,onset,symptoms,note){
 const id=newId();
 model.cases[id]=normalize({id,title,onsetAt:onset,symptoms,note});
 model.pending[id]={episode:clone(model.cases[id]),expectedRevision:""};
 selected=id;notice="질병 기록이 기기에 저장됐습니다";const saved=persist();render();if(connected&&saved)void pushPending();
}
function current(){return model.cases[selected]||null;}
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
  if(!res?.ok||res.schemaVersion!==1)throw Error("질병 기록용 Apps Script 최신 버전 배포가 필요합니다.");
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
 return card("새 질병 시작",(Object.keys(model.cases).length?'<details><summary>다른 질병 기록 추가</summary>':'')+
 '<form data-form="episode" class="ill-fields">'+
  '<label>증상·질병명<input required name="title" maxlength="80" placeholder="예: 발열 및 기침"></label>'+
  '<label>처음 증상 확인 시각<input required name="onset" type="datetime-local" value="'+localInput(nowIso())+'"></label>'+
  '<label>발생 증상<input name="symptoms" maxlength="350" placeholder="기침, 콧물, 구토 등"></label>'+
  '<label>상세 메모<textarea name="note" rows="2" maxlength="1000"></textarea></label>'+
  '<button type="submit" class="ill-primary">질병 기록 시작</button></form>'+
 (Object.keys(model.cases).length?'</details>':''));
}
function recordHeading(c){
 const delayed=c.medicationGroups.filter(g=>groupGuidance(g).state==="overdue").length+
  c.medications.filter(m=>guidance(m).state==="overdue").length;
 const latest=[...c.temperatures].filter(t=>Number.isFinite(t.celsius))
  .sort((a,b)=>at(b.at)-at(a.at))[0];
 return '<section class="ill-episode-strip"><div><strong>'+E(c.title)+'</strong> '+
  '<small>'+(c.status==="closed"?"종료":"진행 중")+' · '+E(fullDate(c.onsetAt))+'</small></div>'+
  '<div class="ill-episode-facts"><span>최근 '+(latest?latest.celsius.toFixed(1)+'℃':'체온 미기록')+'</span>'+
  (delayed?'<span class="ill-missed">복약 예정 확인 '+delayed+'건</span>':'')+'</div>'+
  (c.status==="closed"?'<button class="ill-secondary" data-act="reopen">질병 기록 다시 열기</button>':
  '<details><summary>질병 발생 시각·증상 수정</summary><form data-form="edit-episode" class="ill-fields">'+
  '<label>질병명<input required maxlength="80" name="title" value="'+attr(c.title)+'"></label>'+
  '<label>발생 시점<input required name="onset" type="datetime-local" value="'+localInput(c.onsetAt)+'"></label>'+
  '<label>증상<input maxlength="350" name="symptoms" value="'+attr(c.symptoms)+'"></label>'+
  '<label>기록 메모<textarea rows="2" name="note" maxlength="1000">'+E(c.note)+'</textarea></label>'+
  '<button class="ill-secondary" type="submit">수정 저장</button></form></details>')+
  '</section>';
}
function visitForm(c){
 return card("2. 병원 방문 · 진단",'<details><summary>병원 방문 추가</summary><form data-form="visit" class="ill-fields">'+
 '<label>방문 시각<input required name="at" type="datetime-local" value="'+localInput(nowIso())+'"></label>'+
 '<label>병원명<input required name="hospital" maxlength="120" placeholder="병원 이름"></label>'+
 '<label>진단명 · 의사 설명<input name="diagnosis" maxlength="200" placeholder="진단명 / 소견"></label>'+
 '<label>처방·주의사항<input name="notes" maxlength="500" placeholder="진료 시 들은 복약/관리 지침"></label>'+
 '<button type="submit" class="ill-primary">병원 방문 저장</button></form></details>'+
 (c.visits.length?'<div class="ill-history">'+[...c.visits].sort((a,b)=>at(b.at)-at(a.at)).map(v=>
 '<div class="ill-history-item"><b>'+E(v.hospital)+'</b> <small>'+E(displayTime(v.at))+'</small>'+
 '<p>'+E(v.diagnosis||"진단 미입력")+'</p>'+(v.notes?'<p>'+E(v.notes)+'</p>':'')+
 '<button data-act="remove-visit" data-id="'+attr(v.id)+'" class="ill-text-danger">기록 삭제</button></div>').join("")+'</div>':''));
}
function medicationForm(c){
 const m=c.medications.find(x=>x.id===editMedication)||null;
 const chooseVisit='<option value="">방문 기록 미연결</option>'+c.visits.map(v=>
  '<option value="'+attr(v.id)+'"'+(m?.visitId===v.id?' selected':'')+'>'+E(v.hospital)+' · '+E(displayTime(v.at))+'</option>').join("");
 return card("3. 처방약 · 복용 간격",'<details '+(m?'open':'')+'><summary>'+(m?'처방 수정 중':'처방약 등록')+'</summary><form data-form="medicine" class="ill-fields">'+
 '<input type="hidden" name="editId" value="'+attr(m?.id||"")+'">'+
 '<label>약 종류 프리셋<select name="category">'+medicineOpts(m?.category||"other")+'</select></label>'+
 '<label>정확한 약 이름<input required maxlength="120" name="name" value="'+attr(m?.name||"")+'" placeholder="약 봉투의 제품명을 그대로 입력"></label>'+
 '<label>주성분 · 함량/농도 (선택)<input name="ingredient" maxlength="120" value="'+attr(m?.ingredient||"")+'" placeholder="예: 성분명과 mg/5mL"></label>'+
 '<label>제형 · 농도 표기 (선택)<input name="formulation" maxlength="120" value="'+attr(m?.formulation||"")+'" placeholder="시럽, 현탁액, 포 등"></label>'+
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
function groupGuidance(g,now=new Date()){
 const anyTaken=g.events?.some(e=>e.status==="taken");
 if(g.active&&g.mode!=="prn"&&!anyTaken)
  return {state:"not-started",text:"첫 묶음 복용을 기록하면 다음 예정 시각을 안내합니다.",dueAt:null};
 return guidance({...g,doses:g.events||[]},now);
}
function groupItemRow(item){
 const values=item||{},unit=MED_UNITS.includes(values.unit)?values.unit:"mL";
 return '<div class="ill-drug-line" data-group-item>'+
  '<input aria-label="약 이름" required name="drugName" maxlength="120" placeholder="약 이름 (예: 챔프)" value="'+attr(values.name||"")+'">'+
  '<input aria-label="1회 투약량" required type="number" inputmode="decimal" min="0.1" max="100" step="0.1" name="drugAmount" placeholder="1회량" value="'+attr(values.amount??"")+'">'+
  '<select aria-label="투약 단위" name="drugUnit">'+MED_UNITS.map(v=>'<option value="'+v+'"'+(unit===v?" selected":"")+'>'+v+'</option>').join("")+'</select>'+
  '<button type="button" class="ill-minor" data-act="remove-drug-line" aria-label="이 약 입력 줄 삭제">×</button></div>';
}
function medicationGroupForm(c){
 if(c.status==="closed")return "";
 const editing=c.medicationGroups.find(g=>g.id===editGroup);
 const group=editing||{};
 const visitOptions=c.visits.length?'<label>연결 병원 (선택)<select name="visitId"><option value="">연결하지 않음</option>'+
  c.visits.map(v=>'<option value="'+attr(v.id)+'"'+(group.visitId===v.id?' selected':'')+'>'+E(v.hospital)+'</option>').join("")+
  '</select></label>':'';
 return card("약 묶음 추가",'<details class="ill-group-editor" '+(editing||!c.medicationGroups.length?'open':'')+'><summary>'+
  (editing?'복용 묶음 수정':'함께 복용하는 약 등록')+'</summary>'+
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
  '<p class="ill-muted">1회 투약량은 실제 약 봉투의 숫자로 입력하세요. 약 이름·용량을 자동 추정하지 않습니다. 묶음에 있는 약은 모두 함께 투약할 때 한 번에 기록됩니다.</p>'+
  '<button type="submit" class="ill-primary">'+(editing?'묶음 변경 저장':'복용 묶음 저장')+'</button>'+
  (editing?'<button type="button" data-act="cancel-edit-group" class="ill-secondary">수정 취소</button>':'')+
  '</form></details>');
}
function groupPanel(c){
 const all=[...c.medicationGroups].sort((a,b)=>(b.active?1:0)-(a.active?1:0));
 if(!all.length)return card("현재 복용 중인 약 · 묶음",
  '<div class="ill-empty"><strong>등록된 약이 없습니다</strong><p>같이 복용하는 약의 이름과 1회량만 등록하세요.</p>'+
  '<button class="ill-primary" data-act="go-group" type="button">+ 복용 묶음 만들기</button></div>');
 const sections=all.map(g=>{
  const info=groupGuidance(g),history=[...g.events].sort((a,b)=>at(b.at)-at(a.at));
  const items=g.items.map(item=>'<li><span>'+E(item.name)+'</span><strong>'+E(doseLabel(item.amount,item.unit))+'</strong></li>').join("");
  return '<article data-ill-group-id="'+attr(g.id)+'" class="ill-group '+info.state+'">'+
   '<div class="ill-summary"><strong>'+E(g.name||"함께 복용하는 약")+'</strong>'+
   '<span class="ill-tag">'+(g.active?(g.mode==="prn"?"필요시 복용":"정기 복용"):"복용 종료")+'</span></div>'+
   '<ul class="ill-drug-list">'+items+'</ul>'+
   (g.active?'<p class="ill-guidance" role="status">'+E(info.text)+'</p>':'<p class="ill-muted">복용 종료된 묶음</p>')+
   '<div class="ill-group-actions">'+
   (g.active?'<button type="button" class="ill-primary" data-act="take-group" data-id="'+attr(g.id)+'">묶음 전체 복용 완료</button>':'')+
   '<button type="button" class="ill-secondary" data-act="edit-group" data-id="'+attr(g.id)+'">약·용량 수정</button>'+
   (g.active?'<button type="button" class="ill-secondary" data-act="end-group" data-id="'+attr(g.id)+'">복용 종료</button>':
      '<button type="button" class="ill-secondary" data-act="resume-group" data-id="'+attr(g.id)+'">복용 재개</button>')+
   '</div>'+
   '<details><summary>시간 수정·미복용 기록 / 이력 '+history.length+'건</summary>'+
   (g.active?'<form data-form="group-dose" class="ill-fields ill-dose-edit">'+
    '<input type="hidden" name="groupId" value="'+attr(g.id)+'">'+
    '<label>기록 시각<input required type="datetime-local" name="at" value="'+localInput(nowIso())+'"></label>'+
    '<label>기록 종류<select name="status"><option value="taken">전체 복용 완료</option>'+
    '<option value="skipped">정기 복용 건너뜀</option></select></label>'+
    '<label>메모 (선택)<input name="note" maxlength="300" placeholder="관찰 내용"></label>'+
    '<button class="ill-secondary" type="submit">해당 시간으로 기록</button></form>':'')+
   (history.length?'<div class="ill-history">'+history.map(d=>
    '<div class="ill-history-item">'+E(displayTime(d.at))+' · '+
    (d.status==="skipped"?"미복용":'<strong>'+E(d.items.map(item=>item.name+" "+doseLabel(item.amount,item.unit)).join(", "))+'</strong>')+
    (d.note?' · '+E(d.note):'')+
    '<button type="button" data-act="remove-group-event" data-id="'+attr(d.id)+'" data-group="'+attr(g.id)+'" class="ill-text-danger">삭제</button></div>').join("")+'</div>':'')+
   '</details></article>';
 }).join("");
 return card("현재 복용 중인 약 · 묶음",sections+
 '<p class="ill-muted">‘묶음 전체 복용 완료’는 표시된 약을 모두 실제 복용한 경우에만 누르세요. 일부만 먹었다면 묶음을 나눠서 기록하세요.</p>');
}
function legacyPanel(c){
 if(!c.medications.length)return "";
 return '<details class="ill-legacy"><summary>기존 개별 약 기록 '+c.medications.length+'건 (보존)</summary>'+
  medicines(c)+medicationForm(c)+'</details>';
}
function feverHeat(c){
 const [y,m]=month.split("-").map(Number);
 const days=new Date(y,m,0).getDate(),first=(new Date(y,m-1,1).getDay()+6)%7;
 const bands=dailyMax(c.temperatures);
 let cells=["월","화","수","목","금","토","일"].map(d=>'<span class="ill-dow">'+d+'</span>').join("");
 for(let i=0;i<first;i++)cells+='<span></span>';
 for(let d=1;d<=days;d++){
  const date=month+"-"+String(d).padStart(2,"0"),v=bands[date];
  cells+='<div class="ill-heat '+heatBand(v)+'" title="'+date+' · '+(v===undefined?"미측정":v.toFixed(1)+"℃")+'">'+d+
   '<strong>'+(v===undefined?"·":v.toFixed(1))+'</strong></div>';
 }
 const rows=[...c.temperatures].sort((a,b)=>at(b.at)-at(a.at));
 return card("체온 · 열 히트맵",
  '<div class="ill-heat-head"><button type="button" data-act="month-prev" aria-label="이전 달">‹</button><strong>'+y+'년 '+m+'월</strong>'+
   '<button type="button" data-act="month-next" aria-label="다음 달">›</button></div>'+
  '<div class="ill-heat-grid">'+cells+'</div>'+
  '<div class="ill-temp-legend"><span>미측정</span><span>37.5 미만</span><span>37.5~37.9</span><span>38~38.9</span><span>39 이상</span></div>'+
  (c.status==="active"?'<form data-form="temp" class="ill-temp-quick">'+
   '<label>체온 <span>(℃)</span><input required type="text" inputmode="numeric" autocomplete="off" maxlength="4" name="celsius" placeholder="385" aria-describedby="illTempPreview"></label>'+
   '<button type="submit" class="ill-primary">체온 저장</button>'+
   '<small id="illTempPreview" data-temp-preview>385 입력 → 38.5℃</small>'+
   '<details class="ill-temp-details"><summary>측정 시각·부위 수정</summary>'+
   '<label>측정 시각<input required type="datetime-local" name="at" value="'+localInput(nowIso())+'"></label>'+
   '<label>측정 부위<select name="site">'+siteOpts()+'</select></label>'+
   '<label>메모<input name="note" maxlength="300" placeholder="해열제 전후 등"></label></details>'+
   '</form>':'')+
  (rows.length?'<details><summary>체온 측정 이력 '+rows.length+'건</summary>'+
  '<div class="ill-history">'+rows.map(t=>'<div class="ill-history-item">'+E(displayTime(t.at))+
   ' · <b>'+E(t.celsius?.toFixed(1))+'℃</b> ('+E(SITES[t.site]) +') '+
   E(t.note)+' <button type="button" class="ill-text-danger" data-act="remove-temp" data-id="'+attr(t.id)+'">삭제</button></div>').join("")+
   '</div></details>':'')+
  '<p class="ill-muted">색상은 날짜별 최고 실측값 기준입니다. 측정 부위에 따라 해석이 달라질 수 있습니다.</p>');
}
function closure(c){
 if(c.status==="closed")return "";
 const active=c.medications.filter(m=>m.active);
 return card("질병 종료",
  '<p class="ill-muted">열·증상이 정상화되었는지 직접 확인하고, 처방된 복용 과정이 끝났거나 더 이상 복용하지 않아도 된다는 의료진 지시를 확인한 뒤 종료하세요. 체온 하나만 보고 처방약을 중단하지 않습니다.</p>'+
  (active.length?'<p class="ill-alert">아직 복용 중으로 표시된 약 '+active.length+'개가 있습니다. 처방 완료·중단 지시 확인 후 각 약에서 ‘복용 종료 표시’를 진행하세요.</p>':'')+
  '<form data-form="close" class="ill-fields">'+
  '<label class="ill-check"><input type="checkbox" name="recovered" required> 현재 증상·체온이 안정화되었다고 확인함</label>'+
  '<label class="ill-check"><input type="checkbox" name="done" required> 필요한 복약 일정이 처방 지시대로 종료되었음을 확인함</label>'+
  '<label>종료 메모<input name="note" maxlength="500" placeholder="상태 호전, 최종 처방 등"></label>'+
  '<button class="ill-primary" type="submit" '+(active.length?'disabled':'')+'>질병 종료 기록</button></form>');
}
function syncPanel(){
 const count=Object.keys(model.pending).length;
 return card("저장 상태 · 백업",
   '<p class="'+(noticeError?'ill-alert':'ill-muted')+'" role="status">'+E(notice)+'</p>'+
   '<p class="ill-muted">기록은 먼저 기기에 저장하고 기존 Google Sheets로 자동 동기화합니다. 서버: '+
    (connected?"연결됨":"확인 필요")+' · 전송 대기 '+count+'건 · 원본 충돌 '+Object.keys(model.conflicts).length+'건</p>'+
   '<div class="ill-row-actions"><button type="button" data-act="backup">기기 원본 JSON 백업</button>'+
   '<button type="button" data-act="refresh">서버 기록 다시 조회</button></div>');
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
 const c=current();
 root.innerHTML='<div class="ill-root"><div class="ill-heading"><h2>유하 질병 기록</h2>'+
  '<p>질병별 시간순 기록 · 병원·처방·복용·체온</p></div>'+
  '<div class="ill-alert">이 앱은 입력한 처방 간격으로 참고 시각만 계산합니다. 실제 투약 판단은 약 봉투·처방 지시가 우선입니다. 앱을 닫으면 지연 경고를 푸시 알림으로 보내지 않습니다.</div>'+
  illnessSelect()+
  (c?recordHeading(c)+feverHeat(c)+groupPanel(c)+medicationGroupForm(c)+
    legacyPanel(c)+visitForm(c)+closure(c):
   card("기록이 없습니다",'<p class="ill-muted">발생 시각과 증상을 기록해 시작하세요.</p>'))+
  episodeForm()+
  syncPanel()+
  conflictsView()+'</div>';
 if(!root.dataset.illnessBound){root.dataset.illnessBound="true";
  root.addEventListener("submit",onSubmit);
  root.addEventListener("click",onClick);
  root.addEventListener("input",onInput);
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
 for(const g of c.medicationGroups){
  const next=groupGuidance(g),node=root.querySelector('[data-ill-group-id="'+g.id+'"]');
  if(next.state==="overdue")missed++;
  if(!node)continue;
  node.className="ill-group "+next.state;
  const message=node.querySelector(".ill-guidance");if(message)message.textContent=next.text;
 }
 const count=root.querySelector("[data-ill-overdue]");
 if(count)count.textContent=missed+"건";
}
function stop(){if(timer){clearInterval(timer);timer=null;}
 root=null;active=false;initialFetchStarted=false;connected=false;
 syncEpoch++;busy=false;
}
function onInput(e){
 if(e.target?.name!=="celsius")return;
 const p=root?.querySelector("[data-temp-preview]");if(!p)return;
 const n=parseTemperature(e.target.value);
 p.textContent=n===null?"체온 숫자 세 자리 입력 (예: 385)":n.toFixed(1)+"℃로 저장됩니다";
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
  if(c.status==="closed"&&type!=="close")throw Error("종료된 질병입니다. 기록을 다시 열고 수정해 주세요.");
  if(type==="edit-episode"){
   const title=get(form,"title");need(title,"질병 이름을 입력해 주세요");
   const onsetAt=inputTime(get(form,"onset"));
   changeCase(c.id,r=>{r.title=title;r.onsetAt=onsetAt;r.symptoms=get(form,"symptoms");r.note=get(form,"note");});
   return;
  }
  if(type==="visit"){
   const hospital=get(form,"hospital");need(hospital,"병원명을 입력해 주세요");
   const visit={id:newId(),hospital,at:inputTime(get(form,"at")),diagnosis:get(form,"diagnosis"),notes:get(form,"notes")};
   changeCase(c.id,r=>r.visits.push(visit));return;
  }
  if(type==="medicine"){
   const category=get(form,"category"),name=get(form,"name"),mode=get(form,"mode")==="prn"?"prn":"scheduled";
   const dose=num(get(form,"doseMl")),interval=num(get(form,"intervalHours"));
   need(name,"정확한 약 이름을 입력해 주세요");
   need(dose!==null&&dose>0&&dose<=100,"1회 처방 용량(mL)을 정확히 입력해 주세요");
   need(mode==="prn"||interval!==null,"정기 복용약은 실제 처방 간격(시간)이 필요합니다");
   need(interval===null||(interval>=.5&&interval<=72),"처방 간격은 0.5~72시간 범위에서 입력해 주세요");
   const id=get(form,"editId"),end=get(form,"endsAt");
   const payload={category,name,mode,doseMl:dose,intervalHours:interval,
    ingredient:get(form,"ingredient"),formulation:get(form,"formulation"),visitId:get(form,"visitId"),
    instructions:get(form,"instructions"),endsAt:end?inputTime(end):""};
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
   const log={id:newId(),at:atTime,status,amountMl:status==="taken"?dose:null,
     note:get(form,"note"),scheduledFor:status==="skipped"&&g.dueAt?g.dueAt:""};
   changeCase(c.id,r=>r.medications.find(x=>x.id===id).doses.push(log));return;
  }
  if(type==="temp"){
   const n=num(get(form,"celsius"));need(n!==null&&n>=30&&n<=43,"체온은 30~43℃ 사이 숫자로 입력해 주세요");
   const row={id:newId(),at:inputTime(get(form,"at")),celsius:n,site:get(form,"site"),note:get(form,"note")};
   changeCase(c.id,r=>r.temperatures.push(row));return;
  }
  if(type==="close"){
   need(c.status==="active","이미 종료된 질병입니다");
   need(!c.medications.some(m=>m.active),"아직 복용 중으로 표시된 약이 있습니다");
   need(new FormData(form).get("recovered")==="on"&&new FormData(form).get("done")==="on",
    "상태 정상화와 처방 종료를 확인해 주세요");
   if(!window.confirm("필요한 복약 일정이 종료되었다고 직접 확인하셨나요? 기록 종료는 처방약 중단 지시를 대신하지 않습니다."))return;
   changeCase(c.id,r=>{r.status="closed";r.closedAt=nowIso();r.recoveryConfirmed=true;
    r.noFurtherMedicationConfirmed=true;r.closureNote=get(form,"note");});return;
  }
 }catch(err){notice=String(err.message||err);noticeError=true;render();}
}
function onClick(e){
 const btn=e.target.closest("[data-act]");if(!btn)return;
 const action=btn.dataset.act,id=btn.dataset.id,c=current();
 if(action==="select"){selected=id;editMedication="";month=isoMonth(current()?.onsetAt||nowIso());render();return;}
 if(action==="backup"){backup();return;}
 if(action==="refresh"){if(!busy)void connect();return;}
 if(action==="choose-server"||action==="choose-local"){chooseConflict(id,action==="choose-server"?"server":"local");return;}
 if(action==="month-prev"||action==="month-next"){
  const [y,m]=month.split("-").map(Number),d=new Date(y,m-1+(action==="month-prev"?-1:1),1);
  month=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");render();return;
 }
 if(!c)return;
 if(c.status==="closed"&&action!=="reopen"){
  notice="종료된 질병입니다. 기록을 다시 연 뒤 수정해 주세요.";noticeError=true;render();return;
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
 _test:{normalize,guidance,dailyMax,heatBand,sameData,absorbServer,connect,pushPending}};
})();
