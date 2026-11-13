/* YUHA-CARE · Child illness journal.
 * No medicine/dose/interval is inferred. Timing is informational, only from a
 * caregiver-entered prescription. Offline-first, private secret for cloud sync.
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
let loaded=false,selected="",month=isoMonth(nowIso()),connected=false,secret="",busy=false;
let notice="기기에 저장됩니다 · 서버 연결은 별도 설정",noticeError=false,editMedication="",timer=null,root=null;
function persist(){
 try{
  localStorage.setItem(STORE,JSON.stringify(model.cases));
  localStorage.setItem(QUEUE,JSON.stringify(model.pending));
  localStorage.setItem(CONFLICT,JSON.stringify(model.conflicts));
  localStorage.setItem(SNAPSHOTS,JSON.stringify(model.snapshots.slice(-35)));
  noticeError=false;return true;
 }catch(e){notice="기기 저장 실패 · 이 화면을 닫지 말고 백업을 시도하세요";noticeError=true;return false;}
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
 model.snapshots=model.snapshots.slice(-35);
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
 persist();if(connected)void pushPending();render();
}
function newEpisode(title,onset,symptoms,note){
 const id=newId();
 model.cases[id]=normalize({id,title,onsetAt:onset,symptoms,note});
 model.pending[id]={episode:clone(model.cases[id]),expectedRevision:""};
 selected=id;notice="질병 기록이 기기에 저장됐습니다";persist();render();if(connected)void pushPending();
}
function current(){return model.cases[selected]||null;}
function backup(){
 const data={kind:"yuha-illness-private-backup-v1",exportedAt:nowIso(),
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
 const input=root?.querySelector("#illSecret");
 const value=String(input?.value||"");
 if(value.length<12){notice="비공개 서버 연결 암호(12자 이상)를 입력하세요";noticeError=true;render();return;}
 secret=value;busy=true;notice="비공개 서버 기록을 읽는 중입니다";noticeError=false;render();
 try{
  const res=await rpc("getIllnessCases",[secret]);
  if(!res?.ok||res.schemaVersion!==1)throw Error("서버 질병 기록 API 버전을 확인할 수 없습니다.");
  connected=true;absorbServer(res.cases);
  notice="비공개 서버 연결됨 · 기록을 확인했습니다";noticeError=false;
  busy=false;render();await pushPending();
 }catch(e){connected=false;secret="";busy=false;notice="비공개 서버 연결 실패: "+String(e?.message||e);noticeError=true;render();}
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
    passphrase:secret,episode:job.episode,expectedRevision:job.expectedRevision,
    ...(job.resolution?{resolution:job.resolution}:{})
   }]);
   if(response?.conflict){
    if(response.serverEntry)setConflict(id,response.serverEntry);
    notice="서버·기기 기록 충돌 · 양쪽 원본을 보존했습니다";noticeError=true;continue;
   }
   if(!response?.ok)throw Error("서버가 저장을 승인하지 않았습니다");
   if(job.resolution&&!response.conflictArchived)throw Error("양쪽 원본 보관 미확인");
   const verified=await rpc("getIllnessCases",[secret]);
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
 busy=false;render();
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
 persist();render();if(connected)void pushPending();
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
 return card("1. 질병 발생 기록",'<form data-form="episode" class="ill-fields">'+
  '<label>증상·질병명<input required name="title" maxlength="80" placeholder="예: 발열 및 기침"></label>'+
  '<label>처음 증상 확인 시각<input required name="onset" type="datetime-local" value="'+localInput(nowIso())+'"></label>'+
  '<label>발생 증상<input name="symptoms" maxlength="350" placeholder="기침, 콧물, 구토 등"></label>'+
  '<label>상세 메모<textarea name="note" rows="2" maxlength="1000"></textarea></label>'+
  '<button type="submit" class="ill-primary">질병 기록 시작</button></form>');
}
function recordHeading(c){
 const temps=c.temperatures.filter(t=>Number.isFinite(t.celsius));
 const latest=temps.sort((a,b)=>at(b.at)-at(a.at))[0];
 const delayed=c.medications.filter(m=>guidance(m).state==="overdue").length;
 return card("현재 질병 기록",
  '<div class="ill-summary"><strong>'+E(c.title)+'</strong><span class="ill-tag '+c.status+'">'+(c.status==="closed"?"종료":"진행 중")+'</span></div>'+
  '<p>발생: '+E(displayTime(c.onsetAt))+'</p>'+
  (c.symptoms?'<p>증상: '+E(c.symptoms)+'</p>':'')+
  (c.note?'<p>메모: '+E(c.note)+'</p>':'')+
  '<div class="ill-kpis"><div>병원 방문<strong>'+c.visits.length+'회</strong></div>'+
  '<div>체온 기록<strong>'+temps.length+'회</strong></div>'+
  '<div>최근 체온<strong>'+(latest?latest.celsius.toFixed(1)+'℃':'—')+'</strong></div>'+
  '<div>복약 지연 표시<strong data-ill-overdue>'+delayed+'건</strong></div></div>'+
  (c.status==="closed"?'<p>종료: '+E(displayTime(c.closedAt))+' · '+E(c.closureNote)+'</p>'+
   '<button class="ill-secondary" data-act="reopen">이 질병 기록 다시 열기</button>':
   '<div class="ill-row-actions"><button class="ill-secondary" data-act="edit-episode">발생 기록 수정</button></div>'));
}
function visitForm(c){
 return card("2. 병원 방문 · 진단",'<form data-form="visit" class="ill-fields">'+
 '<label>방문 시각<input required name="at" type="datetime-local" value="'+localInput(nowIso())+'"></label>'+
 '<label>병원명<input required name="hospital" maxlength="120" placeholder="병원 이름"></label>'+
 '<label>진단명 · 의사 설명<input name="diagnosis" maxlength="200" placeholder="진단명 / 소견"></label>'+
 '<label>처방·주의사항<input name="notes" maxlength="500" placeholder="진료 시 들은 복약/관리 지침"></label>'+
 '<button type="submit" class="ill-primary">병원 방문 저장</button></form>'+
 (c.visits.length?'<div class="ill-history">'+[...c.visits].sort((a,b)=>at(b.at)-at(a.at)).map(v=>
 '<div class="ill-history-item"><b>'+E(v.hospital)+'</b> <small>'+E(displayTime(v.at))+'</small>'+
 '<p>'+E(v.diagnosis||"진단 미입력")+'</p>'+(v.notes?'<p>'+E(v.notes)+'</p>':'')+
 '<button data-act="remove-visit" data-id="'+attr(v.id)+'" class="ill-text-danger">기록 삭제</button></div>').join("")+'</div>':''));
}
function medicationForm(c){
 const m=c.medications.find(x=>x.id===editMedication)||null;
 const chooseVisit='<option value="">방문 기록 미연결</option>'+c.visits.map(v=>
  '<option value="'+attr(v.id)+'"'+(m?.visitId===v.id?' selected':'')+'>'+E(v.hospital)+' · '+E(displayTime(v.at))+'</option>').join("");
 return card("3. 처방약 · 복용 간격",'<form data-form="medicine" class="ill-fields">'+
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
 '</form><p class="ill-muted">프리셋은 약 분류만 입력합니다. 복용량·간격은 자동 제안하지 않습니다. 약 이름·용량·간격을 반드시 실제 처방전/약 봉투와 대조하세요.</p>');
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
function feverHeat(c){
 const [y,m]=month.split("-").map(Number);
 const days= new Date(y,m,0).getDate(),first=(new Date(y,m-1,1).getDay()+6)%7;
 const bands=dailyMax(c.temperatures);
 let cells=["월","화","수","목","금","토","일"].map(d=>'<span class="ill-dow">'+d+'</span>').join("");
 for(let i=0;i<first;i++)cells+='<span></span>';
 for(let d=1;d<=days;d++){
  const date=month+"-"+String(d).padStart(2,"0"),v=bands[date];
  cells+='<div class="ill-heat '+heatBand(v)+'" title="'+date+' · '+(v===undefined?"미측정":v.toFixed(1)+"℃")+'">'+d+
   '<strong>'+(v===undefined?"·":v.toFixed(1))+'</strong></div>';
 }
 const rows=[...c.temperatures].sort((a,b)=>at(b.at)-at(a.at));
 return card("5. 체온 기록 · 월간 히트맵",
  '<div class="ill-heat-head"><button data-act="month-prev" aria-label="이전 달">‹</button><strong>'+y+'년 '+m+'월</strong>'+
   '<button data-act="month-next" aria-label="다음 달">›</button></div>'+
  '<div class="ill-heat-grid">'+cells+'</div>'+
  '<p class="ill-muted">각 날짜의 최고 실측 체온 · 회색=기록 없음, 초록=37.5℃ 미만, 노랑=37.5~37.9℃, 주황=38.0~38.9℃, 빨강=39.0℃ 이상. 측정 부위에 따라 해석 기준이 달라지는 시각화용 구간이며 진단값이 아닙니다.</p>'+
  '<form data-form="temp" class="ill-fields"><label>측정 시각<input required type="datetime-local" name="at" value="'+localInput(nowIso())+'"></label>'+
  '<div class="ill-two"><label>체온 (℃)<input required name="celsius" type="number" inputmode="decimal" min="30" max="43" step="0.1" placeholder="예: 38.3"></label>'+
  '<label>측정 부위<select name="site">'+siteOpts()+'</select></label></div>'+
  '<label>측정 메모<input name="note" maxlength="300" placeholder="해열제 전후, 취침 등"></label>'+
  '<button type="submit" class="ill-primary">체온 기록 저장</button></form>'+
  (rows.length?'<details><summary>전체 실측 체온 '+rows.length+'건</summary>'+
  '<div class="ill-history">'+rows.map(t=>'<div class="ill-history-item">'+E(displayTime(t.at))+
   ' · <b>'+E(t.celsius?.toFixed(1))+'℃</b> ('+E(SITES[t.site]) +') '+
   E(t.note)+' <button class="ill-text-danger" data-act="remove-temp" data-id="'+attr(t.id)+'">삭제</button></div>').join("")+
  '</div></details>':''));
}
function closure(c){
 if(c.status==="closed")return "";
 const active=c.medications.filter(m=>m.active);
 return card("6. 질병 종료 처리",
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
 return card("비공개 저장·백업",
   '<p class="ill-muted">기기 기록은 즉시 저장됩니다. 서버 공유는 별도 암호로 연결할 때만 시도합니다. 개인 의료 정보와 처방 자료를 공개 저장소에 넣지 않습니다.</p>'+
   '<p class="'+(noticeError?'ill-alert':'ill-muted')+'" role="status">'+E(notice)+'</p>'+
   '<p class="ill-muted">서버 상태: '+(connected?"연결됨":"미연결")+
    ' · 서버 전송 대기 '+count+'건 · 원본 충돌 '+Object.keys(model.conflicts).length+'건</p>'+
   '<div class="ill-row-actions"><button data-act="backup">기기 원본 JSON 백업</button>'+
    (connected?'<button data-act="disconnect">서버 연결 끊기</button><button data-act="refresh">서버 다시 조회</button>':'')+
    '</div>'+
   (!connected?'<form data-form="connect" class="ill-fields"><label>별도 질병 기록 서버 암호 (12자 이상)<input id="illSecret" type="password" name="secret" autocomplete="off" minlength="12" placeholder="Apps Script YUHA_ILLNESS_ACCESS_KEY"></label>'+
   '<button type="submit" class="ill-secondary">비공개 서버 연결</button></form>':'')+
   '<p class="ill-muted">서버 연결은 기존 Apps Script 배포를 새 버전으로 갱신하고, 스크립트 속성에 YUHA_ILLNESS_ACCESS_KEY를 별도로 설정한 다음 가능합니다. 암호는 기기의 세션 메모리에만 두고 페이지를 새로 열면 다시 입력받습니다.</p>');
}
function conflictsView(){
 const ids=Object.keys(model.conflicts);if(!ids.length)return "";
 return card("서버·기기 원본 차이",'<p class="ill-alert">두 기기에 다른 값이 있습니다. 자동 덮어쓰기를 중단했습니다. 먼저 양쪽 원본을 백업하고 선택하세요.</p>'+
 ids.map(id=>'<div class="ill-history-item"><b>'+E(model.cases[id]?.title||id)+'</b>'+
 '<div class="ill-row-actions"><button data-act="choose-server" data-id="'+attr(id)+'">서버 원본 선택</button>'+
 '<button data-act="choose-local" data-id="'+attr(id)+'">기기 원본 선택 후 서버 보관·갱신</button></div></div>').join(""));
}
function render(){
 hydrate();root=document.getElementById("main");if(!root)return;
 const c=current();
 root.innerHTML='<div class="ill-root"><div class="ill-heading"><h2>유하 질병 기록</h2>'+
  '<p>질병별 시간순 기록 · 병원·처방·복용·체온</p></div>'+
  '<div class="ill-alert">이 앱은 입력한 처방 간격으로 참고 시각만 계산합니다. 실제 투약 판단은 약 봉투·처방 지시가 우선입니다. 앱을 닫으면 지연 경고를 푸시 알림으로 보내지 않습니다.</div>'+
  syncPanel()+
  episodeForm()+
  illnessSelect()+
  (c?recordHeading(c)+visitForm(c)+medicationForm(c)+medicines(c)+feverHeat(c)+closure(c):
   card("기록이 없습니다",'<p class="ill-muted">첫 질병의 발생 시각과 증상을 기록해 시작하세요.</p>'))+
  conflictsView()+'</div>';
 if(!root.dataset.illnessBound){root.dataset.illnessBound="true";
  root.addEventListener("submit",onSubmit);
  root.addEventListener("click",onClick);
 }
 if(!timer)timer=setInterval(()=>{if(root&&root.querySelector(".ill-root"))refreshStatusText();},60000);
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
 const count=root.querySelector("[data-ill-overdue]");
 if(count)count.textContent=missed+"건";
}
function stop(){if(timer){clearInterval(timer);timer=null;}root=null;}
function get(form,key){return String(new FormData(form).get(key)||"").trim();}
function need(condition,message){if(!condition)throw Error(message);}
function onSubmit(e){
 const form=e.target.closest("[data-form]");if(!form)return;
 e.preventDefault();
 try{
  const type=form.dataset.form;
  if(type==="connect"){void connect();return;}
  if(type==="episode"){
   const title=get(form,"title");need(title,"질병 이름을 입력해 주세요");
   newEpisode(title,inputTime(get(form,"onset")),get(form,"symptoms"),get(form,"note"));return;
  }
  const c=current();need(c,"질병 기록을 먼저 선택해 주세요");
  if(c.status==="closed"&&type!=="close")throw Error("종료된 질병입니다. 기록을 다시 열고 수정해 주세요.");
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
 if(action==="disconnect"){connected=false;secret="";notice="서버 연결이 끊겼습니다 · 기기 원본 유지";render();return;}
 if(action==="refresh"){if(connected&&!busy)void (async()=>{try{const r=await rpc("getIllnessCases",[secret]);absorbServer(r.cases);notice="서버 조회 완료";render();await pushPending()}catch(err){notice="조회 실패: "+String(err.message||err);noticeError=true;render();}})();return;}
 if(action==="choose-server"||action==="choose-local"){chooseConflict(id,action==="choose-server"?"server":"local");return;}
 if(action==="month-prev"||action==="month-next"){
  const [y,m]=month.split("-").map(Number),d=new Date(y,m-1+(action==="month-prev"?-1:1),1);
  month=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");render();return;
 }
 if(!c)return;
 if(c.status==="closed"&&action!=="reopen"){
  notice="종료된 질병입니다. 기록을 다시 연 뒤 수정해 주세요.";noticeError=true;render();return;
 }
 if(action==="edit-episode"){
  const title=window.prompt("질병 이름",c.title);if(title===null)return;
  const symptoms=window.prompt("증상",c.symptoms);if(symptoms===null)return;
  const note=window.prompt("상세 메모",c.note);if(note===null)return;
  changeCase(c.id,r=>{r.title=title;r.symptoms=symptoms;r.note=note;});return;
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
window.YuhaIllness={render,stop,model,
 _test:{normalize,guidance,dailyMax,heatBand,sameData,absorbServer}};
})();
