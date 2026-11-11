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
function isSame(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function buildXml(doc){
 if(!SPEC[doc.kind])throw Error("지원하지 않는 기록 유형입니다.");
 const date=new Date().toISOString();
 const batches=Array.isArray(doc.months)?doc.months:[];
 let results=new Map(),failed=[];
 for(const batch of batches){
  if(batch?.error)failed.push(batch.month);
  for(const [day,server] of Object.entries(batch?.server||{})){
   if(!VALID_DAY.test(day)||!day.startsWith(batch.month))continue;
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
  attr("requestedMonths",batches.length)+'/>\n'+
  '    <source'+attr("mode",doc.mode||"server-and-device")+
  attr("failedMonths",failed.join(","))+attr("recordCount",sorted.length)+'/>\n'+
  '    <interpretation>기록 날짜는 개별 일자의 기준일입니다. serverVersion과 deviceVersion은 같은 날짜의 서로 다른 저장본일 수 있으며, 중복 날짜로 합산하지 마세요. pending은 미동기화 변경, conflict는 비교 필요한 원본입니다. 내보내기 과정은 원본을 수정하지 않습니다.</interpretation>\n'+
  (doc.kind==="sleep"?
   '    <analysisNote>수면 기록의 bedTime/asleepTime은 해당 날짜 밤이며, wakeTime은 해당 날짜 아침입니다. 해당 날짜 총수면은 전날 asleepTime과 당일 wakeTime 및 당일 낮잠 구간을 이용해 계산하세요. XML에는 계산으로 만든 추정값을 실측 시각으로 넣지 않았습니다.</analysisNote>\n':
   '    <analysisNote>점수는 사용자의 주관적인 0~10 자기평가이며 의학적 진단이 아닙니다. memo와 husbandLetter는 원문으로 보존합니다. PIN이나 서버 접속 정보는 포함하지 않습니다.</analysisNote>\n')+
  '  </metadata>\n';
 const defs=Array.isArray(doc.fields)?doc.fields:[];
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
 return {xml,recordCount:sorted.length,failed,complete};
}
function download(kind,scope,out){
 const filename="yuha-"+SPEC[kind].filename+"-history-"+scope+"-"+new Date().toISOString().slice(0,10)+".xml";
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
 const today=new Date(),nowMonth=today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0");
 const initial=VALID_MONTH.test(options.month||"")?options.month:nowMonth;
 const kind=options.kind,info=SPEC[kind];
 let cancelled=false,busy=false,lastBatches=null,lastRange=null;
 const cover=document.createElement("div");
 cover.id="yuhaHistoryExportModal";cover.className="history-export-backdrop";
 cover.innerHTML='<div class="history-export-dialog" role="dialog" aria-modal="true" aria-labelledby="historyExportTitle">'+
 '<div class="history-export-head"><h3 id="historyExportTitle">'+info.label+' 히스토리 XML 추출</h3><button type="button" data-close aria-label="닫기">×</button></div>'+
 '<p class="history-export-desc">추출할 기록 범위를 선택하세요. 전체가 기본입니다. XML은 날짜·필드·서버/기기 원본을 구분하여 분석하기 쉽게 저장합니다.</p>'+
 '<label class="history-export-option"><input type="radio" name="historyScope" value="all" checked> 전체 히스토리</label>'+
 '<label class="history-export-option"><input type="radio" name="historyScope" value="month"> 특정 월</label>'+
 '<label class="history-export-month"><span>추출 월</span><input type="month" data-month min="2020-01" max="'+nowMonth+'" value="'+initial+'" disabled></label>'+
 '<p class="history-export-sensitive">'+(kind==="mental"?
  "메모·점수·편지 원문이 포함된 민감정보 파일입니다. PIN과 서버 비밀번호는 포함하지 않지만 XML 파일 자체는 암호화되지 않습니다.":
  "수면 시간 전체 기록이 포함된 XML 파일입니다. 파일 자체는 암호화되지 않습니다.")+'</p>'+
 '<div class="history-export-status" role="status" aria-live="polite" data-status>준비됨 · 서버 기록까지 확인해 추출합니다.</div>'+
 '<div class="history-export-progress" role="progressbar" aria-label="조회 월 진행 상태" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-progress><div data-bar></div></div>'+
 '<div class="history-export-actions"><button type="button" data-partial hidden>부분 기록만 다운로드</button><button type="button" data-close>취소</button>'+
 '<button type="button" class="history-export-primary" data-run>XML 추출</button></div></div>';
 document.body.appendChild(cover);
 const monthInput=cover.querySelector("[data-month]");
 const go=cover.querySelector("[data-run]"),partial=cover.querySelector("[data-partial]");
 const status=cover.querySelector("[data-status]"),bar=cover.querySelector("[data-bar]");
 const progress=cover.querySelector("[data-progress]");
 const radios=[...cover.querySelectorAll('input[name="historyScope"]')];
 radios.forEach(r=>r.addEventListener("change",()=>{monthInput.disabled=radios.find(x=>x.checked)?.value!=="month";}));
 const close=()=>{cancelled=true;cover.remove();};
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
 function setBusy(v){busy=v;go.disabled=v;monthInput.disabled=v||radios.find(x=>x.checked)?.value!=="month";radios.forEach(x=>x.disabled=v);partial.disabled=v;}
 function getRange(){
  const scope=radios.find(x=>x.checked)?.value||"all";
  const selected=monthInput.value;
  if(scope==="month"&&(!VALID_MONTH.test(selected)||selected>nowMonth))throw Error("유효한 조회 월을 선택해 주세요.");
  let first=scope==="month"?selected:String(options.fromMonth||"2025-03");
  const local=typeof options.localMonthKeys==="function"?options.localMonthKeys():[];
  if(scope==="all")for(const v of local||[])if(VALID_MONTH.test(v)&&v<first)first=v;
  const months=monthsBetween(first,scope==="month"?selected:nowMonth);
  return {scope,months,first,last:months[months.length-1]};
 }
 async function start(onlyDevice=false){
  if(busy)return;
  partial.hidden=true;
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
    months:out,fields:options.fields||[],mode:onlyDevice?"device":"server-and-device"});
   if(firstError&&!onlyDevice){
    partial.hidden=false;
    setProgress(out.length,out.length,"서버 조회 실패("+result.failed.length+"개월): "+firstError+
      " · 전체 파일로 표시하지 않습니다. 재시도하거나 부분 기록을 선택하세요.");
   }else{
    const name=download(kind,range.scope,result);
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
    months:lastBatches,fields:options.fields||[],mode:"partial"});
   const name=download(kind,lastRange.scope+"-partial",result);
   status.textContent=name+" · "+result.recordCount+"일치 추출 · 서버 미확인 월 "+result.failed.length+"개";
  }catch(err){status.textContent="부분 추출 실패: "+String(err?.message||err);}
 });
 go.addEventListener("click",()=>{void start();});
 return {close};
}
root.YuhaHistoryExport=Object.freeze({open,buildXml,monthsBetween,safeXml});
})(window);
