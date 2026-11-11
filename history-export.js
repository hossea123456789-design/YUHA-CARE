/* YUHA CARE private-history XML export.
   No histories, PINs, credentials or personal content are embedded in this file.
   All records are fetched after explicit user action and kept in memory until download. */
(function(root){
"use strict";
const SPEC={sleep:{label:"유하 수면",filename:"sleep"},mental:{label:"아내 회복",filename:"mental"}};
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
function buildXml(doc){
 if(!SPEC[doc.kind])throw Error("지원하지 않는 기록 유형입니다.");
 const date=new Date().toISOString();
 const batches=Array.isArray(doc.months)?doc.months:[];
 const startDay=doc.startDate||doc.firstMonth+"-01";
 const endDay=doc.endDate||doc.lastMonth+"-31";
 if(!validDate(startDay)||(!validDate(endDay)&&!/^20\d{2}-(?:0[1-9]|1[0-2])-31$/.test(endDay))||startDay>endDay)
  throw Error("XML의 기록 날짜 범위가 올바르지 않습니다.");
 const withinRange=day=>day>=startDay&&day<=endDay;
 let results=new Map(),failed=[];
 for(const batch of batches){
  if(batch?.error)failed.push(batch.month);
  for(const [day,server] of Object.entries(batch?.server||{})){
   if(!VALID_DAY.test(day)||!day.startsWith(batch.month)||!withinRange(day))continue;
   const item=results.get(day)||{date:day};
   item.server=server;results.set(day,item);
  }
  for(const [day,local] of Object.entries(batch?.device||{})){
   if(!VALID_DAY.test(day)||!day.startsWith(batch.month))continue;
   const item=results.get(day)||{date:day};
   item.device=local;results.set(day,item);
  }
  for(const [day,pending] of Object.entries(batch?.pending||{})){
   if(!VALID_DAY.test(day)||!day.startsWith(batch.month))continue;
   const item=results.get(day)||{date:day};
   item.pending=pending;results.set(day,item);
  }
  for(const [day,conflict] of Object.entries(batch?.conflicts||{})){
   if(!VALID_DAY.test(day)||!day.startsWith(batch.month))continue;
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
   '    <analysisNote>수면 기록의 bedTime/asleepTime은 해당 날짜 밤이며, wakeTime은 해당 날짜 아침입니다. 해당 날짜 총수면은 전날 asleepTime과 당일 wakeTime 및 당일 낮잠 구간을 이용해 계산하세요. XML에는 계산으로 만든 추정값을 실측 시각으로 넣지 않았습니다.</analysisNote>\n':
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
 if(!options||!SPEC[options.kind]||typeof options.fetchMonth!=="function"||typeof options.localMonth!=="function")throw Error("내보내기 설정이 없습니다.");
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
   const out=new Array(range.months.length);
   let next=0,completed=0,firstError=null;
   const concurrent=onlyDevice?1:Math.min(3,range.months.length);
   async function worker(){
    while(next<range.months.length){
     check();
     const index=next++,month=range.months[index],device=options.localMonth(month);
     const snapshot={month,device:device.records||{},pending:device.pending||{},conflicts:device.conflicts||{},server:{}};
     if(!onlyDevice){
      try{
       const result=await options.fetchMonth(month);
       check();
       if(!result?.ok)throw Error("서버 응답 오류");
       snapshot.server=result.records||{};
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
    setProgress(out.length,out.length,name+" · "+result.recordCount+"일치 XML 추출 완료"+
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
   status.textContent=name+" · "+result.recordCount+"일치 추출 · 서버 미확인 월 "+result.failed.length+"개";
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
