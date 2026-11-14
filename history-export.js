/* YUHA CARE private-history XML export.
   No histories, PINs, credentials or personal content are embedded in this file.
   All records are fetched after explicit user action and kept in memory until download. */
(function(root){
"use strict";
const SPEC={sleep:{label:"유하 수면",filename:"sleep"},mental:{label:"아내 회복",filename:"mental"},illness:{label:"유하 질병·체온·복약",filename:"illness"}};
const VALID_MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const VALID_DAY=/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
function safeXml(value){
 const clean=Array.from(String(value??""),ch=>{
  const c=ch.codePointAt(0);
  return c===9||c===10||c===13||
   (c>=32&&c<=55295)||(c>=57344&&c<=65533)||(c>=65536&&c<=1114111)?ch:"�";
 }).join("");
 return clean.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
}
const attr=(name,v)=>" "+name+'="'+safeXml(v)+'"';
function monthsBetween(first,last){
 if(!VALID_MONTH.test(first)||!VALID_MONTH.test(last)||first>last)throw Error("조회 기간이 올바르지 않습니다.");
 const out=[];
 let [y,m]=first.split("-").map(Number);
 const [endY,endM]=last.split("-").map(Number);
 while(y<endY||(y===endY&&m<=endM)){
  out.push(y+"-"+String(m).padStart(2,"0"));
  if(out.length>1200)throw Error("조회 기간이 너무 깁니다.");
  m++;if(m===13){y++;m=1;}
 }
 return out;
}
function validDate(v){
 if(!VALID_DAY.test(String(v||"")))return false;
 const d=new Date(v+"T00:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function localDate(date){
 return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}
function addDaysISO(day,count){
 const [y,m,d]=day.split("-").map(Number);
 return new Date(Date.UTC(y,m-1,d+count)).toISOString().slice(0,10);
}
function shiftMonthsClamped(day,count){
 const [y,m,d]=day.split("-").map(Number);
 const first=new Date(Date.UTC(y,m-1+count,1));
 const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,lastDay))).toISOString().slice(0,10);
}
function presetDates(preset,today){
 if(!validDate(today))throw Error("기준 날짜가 올바르지 않습니다.");
 let start;
 if(preset==="thisYear")start=today.slice(0,4)+"-01-01";
 else if(preset==="last12")start=addDaysISO(shiftMonthsClamped(today,-12),1);
 else if(preset==="last6")start=addDaysISO(shiftMonthsClamped(today,-6),1);
 else if(preset==="last3")start=addDaysISO(shiftMonthsClamped(today,-3),1);
 else throw Error("지원하지 않는 기간 프리셋입니다.");
 return {startDate:start,endDate:today,preset};
}
function node(name,value,indent){
 const pad=" ".repeat(indent);
 if(value===null||value===undefined)return pad+"<"+name+' nil="true"/>\n';
 if(Array.isArray(value)){
  return pad+"<"+name+' count="'+value.length+'">\n'+
   value.map(v=>node("item",v,indent+2)).join("")+
   pad+"</"+name+">\n";
 }
 if(typeof value==="object"){
  const fields=Object.keys(value).sort().filter(k=>k!=="__proto__");
  return pad+"<"+name+">\n"+fields.map(key=>
   pad+'  <field'+attr("name",key)+attr("type",Array.isArray(value[key])?"array":value[key]===null?"null":typeof value[key])+'>\n'+
    node("value",value[key],indent+4)+pad+"  </field>\n").join("")+
   pad+"</"+name+">\n";
 }
 return pad+"<"+name+attr("type",typeof value)+">"+safeXml(value)+"</"+name+">\n";
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==="object")
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
function isSame(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
// A readable, provenance-aware view of the six sleep observation fields.
// The unmodified server/device/pending/conflict records are still exported below.
const SLEEP_QUALITY_FIELDS=Object.freeze([
 {key:"nightWakings",label:"밤중 각성 횟수",unit:"count",dateBasis:"morning"},
 {key:"nightAwakeMinutes",label:"밤중 깨어 있던 시간",unit:"minutes",dateBasis:"morning"},
 {key:"morningCondition",label:"아침 컨디션",dateBasis:"morning"},
 {key:"napSource",label:"낮잠 기록 출처",dateBasis:"nap"},
 {key:"onsetState",label:"잠들기 전 상태",dateBasis:"bedtime"},
 {key:"specialFlags",label:"그날의 특별한 상황",dateBasis:"day"}
]);
const SLEEP_QUALITY_LABELS=Object.freeze({
 morningCondition:{bright:"개운하고 활기참",ordinary:"평소와 같음",tired:"피곤해함",fussy:"보채거나 예민함"},
 napSource:{observed:"집에서 직접 관찰",daycare:"어린이집 추정",caregiver:"보호자 전달"},
 onsetState:{calm:"편안하게 잠듦",fussy:"가벼운 보챔",crying:"지속적인 울음"},
 specialFlags:{none:"평소",travel:"여행",illness:"질병",unusual:"특별 일정"}
});
function sleepObservationDisplay(key,raw){
 const choices=SLEEP_QUALITY_LABELS[key];
 if(key==="nightWakings")return raw+"회";
 if(key==="nightAwakeMinutes")return raw+"분";
 if(key==="specialFlags")return raw.split(",").map(code=>choices[code]||code).join(", ");
 return choices?.[raw]||raw;
}
function sleepObservationVersionXml(record,source){
 if(!record||typeof record!=="object"||Array.isArray(record))return "";
 if(!SLEEP_QUALITY_FIELDS.some(f=>record[f.key]!==null&&record[f.key]!==undefined&&String(record[f.key])!==""))return "";
 let xml='        <version'+attr("source",source)+'>\n';
 for(const field of SLEEP_QUALITY_FIELDS){
  const raw=record[field.key],recorded=raw!==null&&raw!==undefined&&String(raw)!=="";
  xml+='          <'+field.key+attr("label",field.label)+
   attr("dateBasis",field.dateBasis)+attr("recorded",recorded?"true":"false")+
   (field.unit?attr("unit",field.unit):"");
  if(recorded)xml+=attr("raw",String(raw))+">"+safeXml(sleepObservationDisplay(field.key,String(raw)))+
   "</"+field.key+">\n";
  else xml+="/>\n";
 }
 return xml+'        </version>\n';
}
function sleepObservationPendingRecord(pending){
 const result={};
 for(const field of SLEEP_QUALITY_FIELDS){
  const item=pending?.[field.key];
  if(item&&typeof item==="object"&&Object.prototype.hasOwnProperty.call(item,"value"))
   result[field.key]=item.value;
 }
 return result;
}
function sleepObservationConflictRecord(conflicts,side){
 const result={};
 for(const field of SLEEP_QUALITY_FIELDS){
  const item=conflicts?.[field.key];
  if(item&&typeof item==="object"&&Object.prototype.hasOwnProperty.call(item,side))
   result[field.key]=item[side];
 }
 return result;
}
function sleepObservationsXml(record){
 const versions=[
  sleepObservationVersionXml(record.server,"serverVersion"),
  sleepObservationVersionXml(record.device,"deviceVersion"),
  sleepObservationVersionXml(sleepObservationPendingRecord(record.pending),"pendingChanges"),
  sleepObservationVersionXml(sleepObservationConflictRecord(record.conflict,"serverValue"),"conflictServerValue"),
  sleepObservationVersionXml(sleepObservationConflictRecord(record.conflict,"deviceValue"),"conflictDeviceValue")
 ].filter(Boolean);
 if(!versions.length)return "";
 return '      <sleepObservations note="날짜별 수면 관찰 지표. 읽기 편한 한글 표기이며 원본 값은 raw 속성과 각 원본 버전에 유지됩니다. 미입력과 명시적 0은 구분합니다.">\n'+
  versions.join("")+'      </sleepObservations>\n';
}
// The illness backend stores complete episodes rather than month-keyed rows.
// Select by the timestamp of each observation/administration, not by onsetAt.
// Versions are exported separately: server, local, pending, and conflicts must
// never be silently merged or added together as independent administrations.
function illnessEventDay(timestamp){
 if(typeof timestamp!=="string")return "";
 const t=new Date(timestamp);
 return Number.isFinite(t.getTime())?localDate(t):"";
}
function illnessInRange(timestamp,start,end){
 const day=illnessEventDay(timestamp);
 return validDate(day)&&day>=start&&day<=end;
}
function illnessScopedVersion(episode,start,end){
 if(!episode||typeof episode!=="object"||Array.isArray(episode))return null;
 const visit=Array.isArray(episode.visits)?episode.visits.filter(x=>illnessInRange(x.at,start,end)):[];
 const temperatures=Array.isArray(episode.temperatures)?
  episode.temperatures.filter(x=>illnessInRange(x.at,start,end)):[];
 const groups=Array.isArray(episode.medicationGroups)?episode.medicationGroups.map(g=>({
  ...g,events:Array.isArray(g.events)?g.events.filter(x=>illnessInRange(x.at,start,end)):[]
 })).filter(g=>g.events.length):[];
 const meds=Array.isArray(episode.medications)?episode.medications.map(m=>({
  ...m,doses:Array.isArray(m.doses)?m.doses.filter(x=>illnessInRange(x.at,start,end)):[]
 })).filter(m=>m.doses.length):[];
 const episodeRelevant=illnessInRange(episode.onsetAt,start,end)||
  illnessInRange(episode.closedAt,start,end);
 if(!episodeRelevant&&!visit.length&&!temperatures.length&&!groups.length&&!meds.length)return null;
 // If the episode itself begins in the range, retain its prescriptions,
 // even when no dose has yet been entered. Otherwise only relevant dated logs.
 return {
  episode,visit,temperatures,
  groups:episodeRelevant&&Array.isArray(episode.medicationGroups)?
   episode.medicationGroups.map(g=>({...g,events:Array.isArray(g.events)?
    g.events.filter(x=>illnessInRange(x.at,start,end)):[]})):groups,
  meds:episodeRelevant&&Array.isArray(episode.medications)?
   episode.medications.map(m=>({...m,doses:Array.isArray(m.doses)?
    m.doses.filter(x=>illnessInRange(x.at,start,end)):[]})):meds
 };
}
function illnessXmlText(name,value,spaces){
 return " ".repeat(spaces)+"<"+name+">"+safeXml(value??"")+"</"+name+">\n";
}
function illnessDoseItemXml(item,spaces){
 const pad=" ".repeat(spaces);
 return pad+"<drug"+attr("id",item?.id||"")+
  attr("name",item?.name||"")+attr("amount",item?.amount??"")+
  attr("unit",item?.unit||"")+ "/>\n";
}
function illnessVersionXml(src,source,start,end,additional={}){
 const scoped=illnessScopedVersion(src,start,end);
 if(!scoped)return "";
 const ep=scoped.episode;
 let xml="      <version"+attr("source",source)+
  attr("revision",ep.revision||"")+
  (additional.expectedRevision!==undefined?attr("expectedRevision",additional.expectedRevision):"")+">\n";
 xml+="        <episodeDetails"+attr("id",ep.id||"")+
  attr("title",ep.title||"")+attr("onsetAt",ep.onsetAt||"")+
  attr("status",ep.status||"")+attr("closedAt",ep.closedAt||"")+
  attr("recoveryConfirmed",ep.recoveryConfirmed===true)+
  attr("noFurtherMedicationConfirmed",ep.noFurtherMedicationConfirmed===true)+"/>\n";
 for(const k of ["symptoms","note","closureNote"])
  if(ep[k]!==undefined&&ep[k]!==null)xml+=illnessXmlText(k,ep[k],8);
 const visits=[...scoped.visit].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
 xml+="        <hospitalVisits"+attr("count",visits.length)+">\n";
 for(const v of visits){
  xml+="          <visit"+attr("id",v.id||"")+attr("at",v.at||"")+
   attr("date",illnessEventDay(v.at))+attr("hospital",v.hospital||"")+
   attr("diagnosis",v.diagnosis||"")+">\n";
  xml+=illnessXmlText("notes",v.notes||"",12);
  xml+="          </visit>\n";
 }
 xml+="        </hospitalVisits>\n";
 const temp=[...scoped.temperatures].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
 xml+="        <temperatureHistory"+attr("count",temp.length)+">\n";
 for(const r of temp){
  xml+="          <reading"+attr("id",r.id||"")+attr("at",r.at||"")+
   attr("date",illnessEventDay(r.at))+attr("celsius",r.celsius??"")+
   attr("unit","℃")+attr("site",r.site||"")+">\n";
  xml+=illnessXmlText("note",r.note||"",12);
  xml+="          </reading>\n";
 }
 xml+="        </temperatureHistory>\n";
 // Derived heatmap values are not measurements. Keep every raw reading above.
 const daily=new Map();
 for(const r of temp){
  const v=Number(r.celsius),day=illnessEventDay(r.at);
  if(!Number.isFinite(v)||!validDate(day))continue;
  const d=daily.get(day)||{day,count:0,min:v,max:v};
  d.count++;d.min=Math.min(d.min,v);d.max=Math.max(d.max,v);
  daily.set(day,d);
 }
 xml+="        <dailyTemperatureSummary"+attr("count",daily.size)+
  attr("source","calculated-from-observed-readings")+
  attr("isClinicalDiagnosis","false")+">\n";
 for(const d of [...daily.values()].sort((a,b)=>a.day.localeCompare(b.day))){
  const band=d.max>=39?"high":d.max>=38?"fever":d.max>=37.5?"borderline":"normal";
  xml+="          <day"+attr("date",d.day)+attr("measuredCount",d.count)+
   attr("minCelsius",d.min)+attr("maxCelsius",d.max)+
   attr("heatBand",band)+"/>\n";
 }
 xml+="        </dailyTemperatureSummary>\n";
 xml+="        <medicationGroups"+attr("count",scoped.groups.length)+">\n";
 for(const g of scoped.groups){
  xml+="          <group"+attr("id",g.id||"")+attr("name",g.name||"")+
   attr("active",g.active!==false)+attr("deletedAt",g.deletedAt||"")+
   attr("mode",g.mode||"")+attr("timesPerDay",g.timesPerDay??"")+
   attr("days",g.days??"")+attr("intervalHours",g.intervalHours??"")+
   attr("endsAt",g.endsAt||"")+attr("sourceDate",g.sourceDate||"")+
   attr("sourceKind",g.sourceKind||"")+attr("visitId",g.visitId||"")+">\n";
  const items=Array.isArray(g.items)?g.items:[];
  xml+="            <prescribedDrugs"+attr("count",items.length)+">\n";
  for(const item of items)xml+=illnessDoseItemXml(item,14);
  xml+="            </prescribedDrugs>\n";
  const entries=[...(g.events||[])].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  xml+="            <administrations"+attr("count",entries.length)+">\n";
  for(const ev of entries){
   xml+="              <administration"+attr("id",ev.id||"")+
    attr("at",ev.at||"")+attr("date",illnessEventDay(ev.at))+
    attr("status",ev.status||"")+attr("scheduledFor",ev.scheduledFor||"")+">\n";
   xml+=illnessXmlText("note",ev.note||"",16);
   // Actual snapshots preserve historical doses after prescriptions change.
   const administered=ev.status==="skipped"?[]:Array.isArray(ev.items)?ev.items:[];
   xml+="                <administeredDrugs"+attr("count",administered.length)+">\n";
   for(const item of administered)xml+=illnessDoseItemXml(item,18);
   xml+="                </administeredDrugs>\n";
   xml+="              </administration>\n";
  }
  xml+="            </administrations>\n";
  xml+="          </group>\n";
 }
 xml+="        </medicationGroups>\n";
 xml+="        <legacyMedications"+attr("count",scoped.meds.length)+">\n";
 for(const m of scoped.meds){
  xml+="          <medication"+attr("id",m.id||"")+attr("name",m.name||"")+
   attr("active",m.active!==false)+attr("doseMl",m.doseMl??"")+
   attr("doseUnit","mL")+attr("mode",m.mode||"")+
   attr("intervalHours",m.intervalHours??"")+attr("endsAt",m.endsAt||"")+
   attr("visitId",m.visitId||"")+">\n";
  const doses=[...(m.doses||[])].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  xml+="            <administrations"+attr("count",doses.length)+">\n";
  for(const d of doses){
   xml+="              <administration"+attr("id",d.id||"")+
    attr("at",d.at||"")+attr("date",illnessEventDay(d.at))+
    attr("status",d.status||"")+attr("actualAmount",d.status==="skipped"?"":d.amountMl??"")+
    attr("unit","mL")+attr("scheduledFor",d.scheduledFor||"")+">\n";
   xml+=illnessXmlText("note",d.note||"",16);
   xml+="              </administration>\n";
  }
  xml+="            </administrations>\n";
  xml+="          </medication>\n";
 }
 xml+="        </legacyMedications>\n";
 return xml+"      </version>\n";
}
function buildIllnessXml(doc){
 const [lastYear,lastNumber]=String(doc.lastMonth||"").split("-").map(Number);
 if(!VALID_MONTH.test(doc.firstMonth)||!VALID_MONTH.test(doc.lastMonth)||
    doc.firstMonth>doc.lastMonth)throw Error("질병 XML 기간 오류");
 const endCalendarDate=new Date(Date.UTC(lastYear,lastNumber,0)).toISOString().slice(0,10);
 const start=doc.startDate||doc.firstMonth+"-01",end=doc.endDate||endCalendarDate;
 if(!validDate(start)||!validDate(end)||start>end)throw Error("질병 XML 날짜 범위 오류");
 const batch=(doc.months||[])[0]||{};
 const failed=batch.error?[batch.month||doc.firstMonth]:[];
 const complete=failed.length===0&&doc.mode!=="device"&&doc.mode!=="partial";
 const server=batch.server||{},device=batch.device||{},pending=batch.pending||{},conflicts=batch.conflicts||{};
 const ids=new Set([...Object.keys(server),...Object.keys(device),...Object.keys(pending),...Object.keys(conflicts)]);
 let result="",count=0;
 for(const id of [...ids].sort()){
  const p=pending[id]||{},conflict=conflicts[id]||{};
  const variants=[
   illnessVersionXml(server[id],"serverVersion",start,end),
   illnessVersionXml(device[id],"deviceVersion",start,end),
   illnessVersionXml(p.episode,"pendingChanges",start,end,{expectedRevision:p.expectedRevision||""}),
   illnessVersionXml(conflict.local,"conflictDeviceVersion",start,end),
   illnessVersionXml(conflict.server,"conflictServerVersion",start,end)
  ].filter(Boolean);
  if(!variants.length)continue;
  const differing=Boolean(server[id]&&device[id]&&!isSame(server[id],device[id]));
  result+="    <record"+attr("episodeId",id)+
   attr("serverPresent",variants.some(x=>x.includes('source="serverVersion"')))+
   attr("devicePresent",variants.some(x=>x.includes('source="deviceVersion"')))+
   attr("unsynced",variants.some(x=>x.includes('source="pendingChanges"')))+
   attr("reviewVersions",differing||Boolean(conflicts[id]))+">\n"+
   variants.join("")+"    </record>\n";
  count++;
 }
 let xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<yuhaCareHistory'+attr("schemaVersion","1.1")+
  attr("category","illness")+attr("categoryName",SPEC.illness.label)+
  attr("scope",doc.scope)+attr("complete",complete)+'>\n'+
  '  <metadata>\n'+
  illnessXmlText("exportedAt",new Date().toISOString(),4)+
  '    <period'+attr("startMonth",doc.firstMonth)+attr("endMonth",doc.lastMonth)+
  attr("startDate",start)+attr("endDate",end)+attr("preset",doc.preset||"none")+'/>\n'+
  '    <source'+attr("mode",doc.mode||"server-and-device")+
  attr("failedMonths",failed.join(","))+attr("recordCount",count)+'/>\n'+
  '    <analysisNote>날짜 범위는 실제 측정·투약·병원 방문 시각의 브라우저 현지 날짜로 필터링합니다. 질병 발생일이 이전 달이어도 기간 내 복약 기록이 있으면 포함됩니다. 복용 수량은 처방 기준과 투약 당시 실제 수량을 구분합니다. 1일 횟수를 임의의 시간 간격으로 환산하지 않습니다. 삭제된 묶음의 이력도 deletedAt과 함께 유지됩니다. dailyTemperatureSummary는 실제 체온 기록으로 계산한 날짜별 최저/최고와 화면용 구간으로 진단이 아닙니다. serverVersion, deviceVersion, pendingChanges, conflictVersions는 서로 다른 원본으로 같은 투약 사실이 중복될 수 있으므로 합산하지 마세요. complete는 서버 조회 성공 여부만 뜻합니다. 원본은 변경하지 않았습니다.</analysisNote>\n'+
  '  </metadata>\n'+
  '  <fieldDefinitions>\n'+
  '    <field key="temperatureHistory.reading.celsius" label="실측 체온" unit="℃"/>\n'+
  '    <field key="dailyTemperatureSummary.day.maxCelsius" label="해당 날짜의 최고 실측 체온" unit="℃"/>\n'+
  '    <field key="medicationGroups.group.administrations.administration" label="묶음 복용·미복용 기록"/>\n'+
  '    <field key="administeredDrugs.drug.amount" label="실제 약별 복용량" unit="drug.unit"/>\n'+
  '    <field key="legacyMedications.medication.administrations" label="구형 개별 약 복용 기록"/>\n'+
  '    <field key="medicationGroups.group.deletedAt" label="삭제 보관된 묶음 시각"/>\n'+
  '  </fieldDefinitions>\n'+
  '  <records'+attr("count",count)+'>\n'+result+'  </records>\n</yuhaCareHistory>\n';
 return {xml,recordCount:count,failed,complete,scope:doc.scope,
  firstMonth:doc.firstMonth,lastMonth:doc.lastMonth,startDate:start,endDate:end,preset:doc.preset||"none"};
}
function buildXml(doc){
 if(doc.kind==="illness")return buildIllnessXml(doc);
 if(!SPEC[doc.kind])throw Error("지원하지 않는 기록 유형입니다.");
 const date=new Date().toISOString();
 const batches=Array.isArray(doc.months)?doc.months:[];
 if(!VALID_MONTH.test(doc.firstMonth)||!VALID_MONTH.test(doc.lastMonth))throw Error("XML의 조회 연월이 잘못되었습니다.");
 const [lastYear,lastNumber]=doc.lastMonth.split("-").map(Number);
 const lastCalendarDate=new Date(Date.UTC(lastYear,lastNumber,0)).toISOString().slice(0,10);
 const startDay=doc.startDate||doc.firstMonth+"-01";
 const endDay=doc.endDate||lastCalendarDate;
 if(!validDate(startDay)||!validDate(endDay)||startDay>endDay)
  throw Error("XML의 기록 날짜 범위가 올바르지 않습니다.");
 const withinRange=day=>day>=startDay&&day<=endDay;
 let results=new Map(),failed=[];
 for(const batch of batches){
  if(batch?.error)failed.push(batch.month);
  for(const [day,server] of Object.entries(batch?.server||{})){
   if(!validDate(day)||!day.startsWith(batch.month)||!withinRange(day))continue;
   const item=results.get(day)||{date:day};
   item.server=server;results.set(day,item);
  }
  for(const [day,local] of Object.entries(batch?.device||{})){
   if(!validDate(day)||!day.startsWith(batch.month)||!withinRange(day))continue;
   const item=results.get(day)||{date:day};
   item.device=local;results.set(day,item);
  }
  for(const [day,pending] of Object.entries(batch?.pending||{})){
   if(!validDate(day)||!day.startsWith(batch.month)||!withinRange(day))continue;
   const item=results.get(day)||{date:day};
   item.pending=pending;results.set(day,item);
  }
  for(const [day,conflict] of Object.entries(batch?.conflicts||{})){
   if(!validDate(day)||!day.startsWith(batch.month)||!withinRange(day))continue;
   const item=results.get(day)||{date:day};
   item.conflict=conflict;results.set(day,item);
  }
 }
 const sorted=[...results.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const complete=failed.length===0&&doc.mode!=="device";
 let xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<yuhaCareHistory'+attr("schemaVersion","1.0")+attr("category",doc.kind)+
  attr("categoryName",SPEC[doc.kind].label)+attr("scope",doc.scope)+
  attr("complete",complete?"true":"false")+'>\n';
 xml+='  <metadata>\n'+
  '    <exportedAt>'+date+'</exportedAt>\n'+
  '    <period'+attr("startMonth",doc.firstMonth)+attr("endMonth",doc.lastMonth)+
  attr("startDate",startDay)+attr("endDate",endDay)+attr("preset",doc.preset||"none")+
  attr("requestedMonths",batches.length)+'/>\n'+
  '    <source'+attr("mode",doc.mode||"server-and-device")+
  attr("failedMonths",failed.join(","))+attr("recordCount",sorted.length)+'/>\n'+
  '    <interpretation>기록 날짜는 개별 일자의 기준일입니다. serverVersion과 deviceVersion은 같은 날짜의 서로 다른 저장본일 수 있으며, 중복 날짜로 합산하지 마세요. pending은 미동기화 변경, conflict는 비교 필요한 원본입니다. complete 속성은 요청한 월의 서버 조회 성공 여부만 뜻하며 미동기화 기록이 없다는 의미는 아닙니다. 내보내기 과정은 원본을 수정하지 않습니다.</interpretation>\n'+
  (doc.kind==="sleep"?
   '    <analysisNote>수면 기록의 bedTime/asleepTime은 해당 날짜 밤이며, wakeTime은 해당 날짜 아침입니다. 해당 날짜 총수면은 전날 asleepTime과 당일 wakeTime 및 당일 낮잠 구간을 이용하고 해당 날짜 nightAwakeMinutes가 기록된 경우 그만큼 차감해 계산하세요. nightWakings와 nightAwakeMinutes는 당일 아침 기준, onsetState는 그날 밤 기준, napSource는 그날 낮잠 기준입니다. sleepObservations는 원본별 한글 해설이며 원래 값(raw)과 각 원본 버전을 함께 남깁니다. XML에는 계산으로 만든 추정값을 실측 시각으로 넣지 않았습니다.</analysisNote>\n':
   '    <analysisNote>점수는 사용자의 주관적인 0~10 자기평가이며 의학적 진단이 아닙니다. memo와 husbandLetter는 원문으로 보존합니다. PIN이나 서버 접속 정보는 포함하지 않습니다.</analysisNote>\n')+
  '  </metadata>\n';
 const defs=Array.isArray(doc.fields)?doc.fields:[];
 if(doc.context&&typeof doc.context==='object')xml+=node('context',doc.context,2);
 xml+='  <fieldDefinitions>\n'+defs.map(f=>
  '    <field'+attr("key",f.key)+attr("label",f.label)+
  (f.unit?attr("unit",f.unit):"")+'/>\n').join("")+'  </fieldDefinitions>\n';
 xml+='  <records'+attr("count",sorted.length)+'>\n';
 for(const r of sorted){
  const disagreement=r.server!==undefined&&r.device!==undefined&&!isSame(r.server,r.device);
  const hasPending=Boolean(r.pending&&Object.keys(r.pending).length);
  const review=Boolean(disagreement||r.conflict);
  xml+='    <record'+attr("date",r.date)+attr("serverPresent",r.server!==undefined)+
    attr("devicePresent",r.device!==undefined)+
    attr("unsynced",hasPending)+attr("reviewVersions",review)+'>\n';
  // Every version is explicit: never pretend the device and cloud were identical.
  if(r.server!==undefined)xml+=node("serverVersion",r.server,6);
  if(r.device!==undefined)xml+=node("deviceVersion",r.device,6);
  if(hasPending)xml+=node("pendingChanges",r.pending,6);
  if(r.conflict!==undefined)xml+=node("conflictVersions",r.conflict,6);
  if(doc.kind==="sleep")xml+=sleepObservationsXml(r);
  xml+="    </record>\n";
 }
 xml+="  </records>\n</yuhaCareHistory>\n";
 return {xml,recordCount:sorted.length,failed,complete,scope:doc.scope,firstMonth:doc.firstMonth,lastMonth:doc.lastMonth,startDate:startDay,endDate:endDay,preset:doc.preset||"none"};
}
function download(kind,scope,out){
 const suffix=scope.includes("partial")?"-partial":"";
 const rangeLabel=out.scope==="month"?out.firstMonth+suffix:
  out.scope==="range"?out.startDate+"_to_"+out.endDate+suffix:scope;
 const filename="yuha-"+SPEC[kind].filename+"-history-"+rangeLabel+"-"+new Date().toISOString().slice(0,10)+".xml";
 const blob=new Blob([out.xml],{type:"application/xml;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const link=document.createElement("a");link.href=url;link.download=filename;
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),12000);
 return filename;
}
function open(options){
 if(!options||!SPEC[options.kind]||
  (options.kind==="illness"?
   typeof options.fetchIllness!=="function"||typeof options.localIllness!=="function":
   typeof options.fetchMonth!=="function"||typeof options.localMonth!=="function"))
  throw Error("내보내기 설정이 없습니다.");
 if(document.getElementById("yuhaHistoryExportModal"))return;
 const today=new Date(),todayDay=localDate(today),nowMonth=todayDay.slice(0,7);
 const initial=VALID_MONTH.test(options.month||"")?options.month:nowMonth;
 const kind=options.kind,info=SPEC[kind];
 let cancelled=false,busy=false,lastBatches=null,lastRange=null,lastDownload=null,lastDownloadScope="",activePreset="thisYear";
 const cover=document.createElement("div");
 cover.id="yuhaHistoryExportModal";cover.className="history-export-backdrop";
 cover.innerHTML='<div class="history-export-dialog" role="dialog" aria-modal="true" aria-labelledby="historyExportTitle">'+
 '<div class="history-export-head"><h3 id="historyExportTitle">'+info.label+' 히스토리 XML 추출</h3><button type="button" data-close aria-label="닫기">×</button></div>'+
 '<p class="history-export-desc">추출할 기록 범위를 선택하세요. 전체가 기본입니다. XML은 날짜·필드·서버/기기 원본을 구분하여 분석하기 쉽게 저장합니다.</p>'+
 '<label class="history-export-option"><input type="radio" name="historyScope" value="all" checked> 전체 히스토리</label>'+
 '<label class="history-export-option"><input type="radio" name="historyScope" value="month"> 특정 월</label>'+
 '<label class="history-export-option"><input type="radio" name="historyScope" value="range"> 기간 지정 · 프리셋</label>'+
 '<label class="history-export-month" data-month-row><span>추출 월</span><input type="month" data-month min="2020-01" max="'+nowMonth+'" value="'+initial+'" disabled></label>'+
 '<div class="history-export-range" data-range-panel hidden>'+
  '<div class="history-export-presets" role="group" aria-label="기간 프리셋">'+
   '<button type="button" data-preset="thisYear" class="active">이번 년도만</button>'+
   '<button type="button" data-preset="last12">최근 1년</button>'+
   '<button type="button" data-preset="last6">최근 6개월</button>'+
   '<button type="button" data-preset="last3">최근 3개월</button>'+
   '<button type="button" data-preset="custom">직접 지정</button>'+
  '</div>'+
  '<div class="history-export-dates">'+
   '<label>시작일<input type="date" data-start min="2020-01-01" max="'+todayDay+'"></label>'+
   '<label>종료일<input type="date" data-end min="2020-01-01" max="'+todayDay+'"></label>'+
  '</div>'+
  '<p class="history-export-range-hint">선택한 시작일과 종료일을 모두 포함합니다. 프리셋을 누른 뒤 날짜를 직접 수정할 수도 있습니다.</p>'+
 '</div>'+
 '<p class="history-export-sensitive">'+(kind==="mental"?
  "메모·점수·편지 원문이 포함된 민감정보 파일입니다. PIN과 서버 비밀번호는 포함하지 않지만 XML 파일 자체는 암호화되지 않습니다.":
  kind==="illness"?
  "질병명·체온·진료·실제 복용 시각과 약별 투약량이 포함됩니다. 삭제 보관된 묶음의 복약 이력도 추출됩니다. XML 파일 자체는 암호화되지 않습니다.":
  "수면 시간 전체 기록이 포함된 XML 파일입니다. 파일 자체는 암호화되지 않습니다.")+'</p>'+
 '<div class="history-export-status" role="status" aria-live="polite" data-status>준비됨 · 서버 기록까지 확인해 추출합니다.</div>'+
 '<div class="history-export-progress" role="progressbar" aria-label="조회 월 진행 상태" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-progress><div data-bar></div></div>'+
 '<div class="history-export-actions"><button type="button" data-partial hidden>부분 기록만 다운로드</button><button type="button" data-again hidden>파일 다시 받기</button><button type="button" data-close>취소</button>'+
 '<button type="button" class="history-export-primary" data-run>XML 추출</button></div></div>';
 document.body.appendChild(cover);
 const monthInput=cover.querySelector("[data-month]");
 const monthRow=cover.querySelector("[data-month-row]");
 const rangePanel=cover.querySelector("[data-range-panel]");
 const startInput=cover.querySelector("[data-start]"),endInput=cover.querySelector("[data-end]");
 const presetButtons=[...cover.querySelectorAll("[data-preset]")];
 const go=cover.querySelector("[data-run]"),partial=cover.querySelector("[data-partial]"),again=cover.querySelector("[data-again]");
 const status=cover.querySelector("[data-status]"),bar=cover.querySelector("[data-bar]");
 const progress=cover.querySelector("[data-progress]");
 const radios=[...cover.querySelectorAll('input[name="historyScope"]')];
 function clearResults(){
  partial.hidden=true;again.hidden=true;lastBatches=null;lastRange=null;lastDownload=null;
 }
 function markPreset(key){
  activePreset=key;
  presetButtons.forEach(b=>b.classList.toggle("active",b.dataset.preset===key));
 }
 function setPreset(key){
  if(key!=="custom"){
   const dates=presetDates(key,todayDay);
   startInput.value=dates.startDate;endInput.value=dates.endDate;
  }
  markPreset(key);clearResults();
 }
 function currentScope(){return radios.find(x=>x.checked)?.value||"all";}
 function updateInputs(){
  const mode=currentScope();
  monthRow.hidden=mode!=="month";
  rangePanel.hidden=mode!=="range";
  monthInput.disabled=busy||mode!=="month";
  startInput.disabled=busy||mode!=="range";
  endInput.disabled=busy||mode!=="range";
  presetButtons.forEach(b=>{b.disabled=busy||mode!=="range";});
 }
 radios.forEach(r=>r.addEventListener("change",()=>{clearResults();updateInputs();}));
 monthInput.addEventListener("change",clearResults);
 presetButtons.forEach(b=>b.addEventListener("click",()=>setPreset(b.dataset.preset)));
 for(const input of [startInput,endInput])
  input.addEventListener("change",()=>{markPreset("custom");clearResults();});
 setPreset("thisYear");updateInputs();
 const close=()=>{cancelled=true;lastDownload=null;cover.remove();};
 cover.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",close));
 cover.addEventListener("click",e=>{if(e.target===cover&&!busy)close();});
 cover.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();close();}});
 function check(){
  if(cancelled||!(options.authorized?.()??true))throw Error("추출이 취소되었거나 현재 접근 권한이 없습니다.");
 }
 function setProgress(n,max,msg){
  if(cancelled)return;
  const pct=max?Math.round(n/max*100):0;
  bar.style.width=pct+"%";progress.setAttribute("aria-valuenow",String(pct));
  status.textContent=msg;
 }
 function setBusy(v){busy=v;go.disabled=v;radios.forEach(x=>x.disabled=v);partial.disabled=v;again.disabled=v;updateInputs();}
 function getRange(){
  const scope=currentScope(),selected=monthInput.value;
  let startDate,endDate,preset="none";
  if(scope==="month"){
   if(!VALID_MONTH.test(selected)||selected>nowMonth)throw Error("유효한 조회 월을 선택해 주세요.");
   startDate=selected+"-01";
   endDate=selected===nowMonth?todayDay:
    new Date(Date.UTC(Number(selected.slice(0,4)),Number(selected.slice(5,7)),0)).toISOString().slice(0,10);
  }else if(scope==="range"){
   startDate=startInput.value;endDate=endInput.value;
   if(!validDate(startDate)||!validDate(endDate)||startDate<"2020-01-01"||
      endDate>todayDay||startDate>endDate)
    throw Error("시작일과 종료일을 올바르게 선택해 주세요. 종료일은 오늘을 넘길 수 없습니다.");
   preset=activePreset;
  }else{
   let first=String(options.fromMonth||"2025-03");
   const local=typeof options.localMonthKeys==="function"?options.localMonthKeys():[];
   for(const v of local||[])if(VALID_MONTH.test(v)&&v<first)first=v;
   startDate=first+"-01";endDate=todayDay;
  }
  const first=startDate.slice(0,7),last=endDate.slice(0,7);
  return {scope,months:monthsBetween(first,last),first,last,startDate,endDate,preset};
 }
 async function start(onlyDevice=false){
  if(busy)return;
  partial.hidden=true;again.hidden=true;lastDownload=null;
  setBusy(true);
  let range=null;
  try{
   check();range=getRange();
   // Illness API returns complete episodes in a single call. Do NOT fetch
   // the same full JSON again for every requested calendar month.
   const requestMonths=kind==="illness"?[range.first]:range.months;
   const out=new Array(requestMonths.length);
   let next=0,completed=0,firstError=null;
   const concurrent=onlyDevice?1:Math.min(3,range.months.length);
   async function worker(){
    while(next<requestMonths.length){
     check();
     const index=next++,month=requestMonths[index],
      device=kind==="illness"?options.localIllness():options.localMonth(month);
     const snapshot={month,device:kind==="illness"?device.cases||{}:device.records||{},
       pending:device.pending||{},conflicts:device.conflicts||{},server:{}};
     if(!onlyDevice){
      try{
       const result=kind==="illness"?await options.fetchIllness():await options.fetchMonth(month);
       check();
       if(!result?.ok)throw Error("서버 응답 오류");
       if(kind==="illness"&&Number(result.schemaVersion)!==4)
        throw Error("질병 기록 Apps Script v4가 배포되지 않았습니다. 서버 기록은 미확인 상태입니다.");
       snapshot.server=kind==="illness"?result.cases||{}:result.records||{};
      }catch(err){
       if(cancelled)throw err;
       snapshot.error=String(err?.message||err).slice(0,140);
       firstError=firstError||month+" · "+snapshot.error;
      }
     }else snapshot.error="서버 조회 생략 · 기기 기록만 포함";
     out[index]=snapshot;completed++;
     setProgress(completed,out.length,completed+"/"+out.length+"개월 확인 · "+month);
    }
   }
   await Promise.all(Array.from({length:concurrent},()=>worker()));
   check();lastBatches=out;lastRange=range;
   const result=buildXml({kind,scope:range.scope,firstMonth:range.first,lastMonth:range.last,
    startDate:range.startDate,endDate:range.endDate,preset:range.preset,months:out,fields:options.fields||[],context:options.context||{},mode:onlyDevice?"device":"server-and-device"});
   if(firstError&&!onlyDevice){
    partial.hidden=false;
    setProgress(out.length,out.length,"서버 조회 실패("+result.failed.length+"개월): "+firstError+
      " · 전체 파일로 표시하지 않습니다. 재시도하거나 부분 기록을 선택하세요.");
   }else{
    const name=download(kind,range.scope,result);
    lastDownload=result;lastDownloadScope=range.scope;again.hidden=false;
    setProgress(out.length,out.length,name+" · "+result.recordCount+(kind==="illness"?"개 질병":"일")+" XML 추출 완료"+
       (result.complete?"":" (기기 기록만 포함 · 불완전)"));
   }
  }catch(err){
   if(!cancelled)status.textContent="추출 실패: "+String(err?.message||err);
  }finally{if(!cancelled)setBusy(false);}
 }
 partial.addEventListener("click",()=>{
  if(!lastBatches||!lastRange||busy)return;
  try{
   check();
   const result=buildXml({kind,scope:lastRange.scope,firstMonth:lastRange.first,lastMonth:lastRange.last,
    startDate:lastRange.startDate,endDate:lastRange.endDate,preset:lastRange.preset,months:lastBatches,fields:options.fields||[],context:options.context||{},mode:"partial"});
   const name=download(kind,lastRange.scope+"-partial",result);
   lastDownload=result;lastDownloadScope=lastRange.scope+"-partial";again.hidden=false;
   status.textContent=name+" · "+result.recordCount+(kind==="illness"?"개 질병":"일")+" 추출 · 서버 미확인 "+result.failed.length+"건";
  }catch(err){status.textContent="부분 추출 실패: "+String(err?.message||err);}
 });
 again.addEventListener("click",()=>{
  try{check();if(!lastDownload)return;const filename=download(kind,lastDownloadScope,lastDownload);
   status.textContent=filename+" · XML 파일을 다시 다운로드했습니다.";
  }catch(err){status.textContent="재다운로드 실패: "+String(err?.message||err);}
 });
 go.addEventListener("click",()=>{void start();});
 return {close};
}
root.YuhaHistoryExport=Object.freeze({open,buildXml,monthsBetween,presetDates,validDate,safeXml});
})(window);
