/* YUHA-CARE — accessible 12-hour clock, replacing unstyleable native AM/PM.
 * Existing field names/values stay unchanged: YYYY-MM-DDTHH:mm or HH:mm.
 * This is an input adapter only; it never writes to cloud or local records.
 */
(function(root){
"use strict";
const PAD=n=>String(n).padStart(2,"0");
const two=(text,lo,hi)=>{const n=Number(text);return Number.isInteger(n)&&n>=lo&&n<=hi?n:null;};
function parseClock(value,withDate){
 const text=String(value||"");
 const match=withDate?
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(text):
  /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(text);
 if(!match)return null;
 const date=withDate?match[1]:"";
 const hh=two(withDate?match[2]:match[1],0,23);
 const minute=two(withDate?match[3]:match[2],0,59);
 if(hh===null||minute===null)return null;
 return {date,period:hh<12?"am":"pm",hour:hh%12||12,minute};
}
function composeClock(date,period,hour,minute,withDate){
 const hh=two(hour,1,12),mm=two(minute,0,59);
 if((withDate&&!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))||
  !["am","pm"].includes(period)||hh===null||mm===null)return "";
 const h24=hh%12+(period==="pm"?12:0);
 return (withDate?date+"T":"")+PAD(h24)+":"+PAD(mm);
}
function enhance(scope){
 if(!scope||!root.document)return 0;
 const target=scope.matches?.('input[type="datetime-local"],input[type="time"]')?
  [scope]:Array.from(scope.querySelectorAll?.('input[type="datetime-local"],input[type="time"]')||[]);
 let count=0;
 for(const field of target){
  if(field.dataset.yuhaTimeUi==="on")continue;
  if(field.closest?.(".yuha-time-picker"))continue;
  const withDate=field.type==="datetime-local";
  const doc=field.ownerDocument||document;
  const ui=doc.createElement("div");ui.className="yuha-time-picker";
  ui.dataset.timeKind=withDate?"date-time":"time";
  ui.setAttribute("role","group");ui.setAttribute("aria-label",withDate?"날짜와 시간 선택":"시간 선택");
  let dateInput=null;
  if(withDate){
   const dateBox=doc.createElement("div");dateBox.className="yuha-time-datebox";
   const title=doc.createElement("span");title.className="yuha-time-small-label";title.textContent="날짜";
   dateInput=doc.createElement("input");dateInput.type="date";
   dateInput.className="yuha-time-date-input";
   dateInput.required=field.required;
   dateInput.setAttribute("aria-label","기록 날짜");
   dateBox.append(title,dateInput);ui.append(dateBox);
  }
  const periodTitle=doc.createElement("span");periodTitle.className="yuha-time-small-label";
  periodTitle.textContent="오전 · 오후 선택";
  ui.append(periodTitle);
  const row=doc.createElement("div");row.className="yuha-time-period-row";
  row.setAttribute("role","group");row.setAttribute("aria-label","오전 또는 오후");
  const buttons={};
  for(const [period,label] of [["am","오전"],["pm","오후"]]){
   const button=doc.createElement("button");
   button.type="button";button.className="yuha-time-period-btn";
   button.dataset.period=period;button.dataset.yuhaEditable="true";button.setAttribute("aria-pressed","false");
   const name=doc.createElement("strong");name.textContent=label;
   const status=doc.createElement("span");status.className="yuha-time-period-status";
   button.append(name,status);row.append(button);
   buttons[period]={button,status};
  }
  ui.append(row);
  const clock=doc.createElement("div");clock.className="yuha-time-clock";
  const makeSelect=(type,max,caption)=>{
   const wrap=doc.createElement("div");wrap.className="yuha-time-number-wrap";
   const text=doc.createElement("span");text.className="yuha-time-small-label";text.textContent=caption;
   const select=doc.createElement("select");select.className="yuha-time-number-select";
   select.dataset.timePart=type;select.setAttribute("aria-label",caption+" 선택");
   for(let value=type==="hour"?1:0;value<=max;value++){
    const option=doc.createElement("option");
    option.value=PAD(value);option.textContent=PAD(value);
    select.append(option);
   }
   wrap.append(text,select);clock.append(wrap);return select;
  };
  const hour=makeSelect("hour",12,"시");
  const colon=doc.createElement("span");colon.className="yuha-time-colon";colon.textContent=":";
  clock.append(colon);
  const minute=makeSelect("minute",59,"분");
  ui.append(clock);
  const status=doc.createElement("p");status.className="yuha-time-choice";
  status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  ui.append(status);
  const controls={field,withDate,ui,dateInput,buttons,hour,minute,status,period:null};
  field.dataset.yuhaTimeUi="on";
  field.classList.add("yuha-time-source");
  field.required=false;field.tabIndex=-1;field.setAttribute("aria-hidden","true");
  field.hidden=true;
  field.insertAdjacentElement("afterend",ui);
  field._yuhaTimeControls=controls;
  const read=()=>parseClock(field.value,withDate);
  function renderControls(){
   const value=read();
   if(value){
    controls.period=value.period;
    if(dateInput)dateInput.value=value.date;
    hour.value=PAD(value.hour);minute.value=PAD(value.minute);
   }else{
    controls.period=null;
    if(dateInput)dateInput.value="";
    hour.value="09";minute.value="00";
   }
   renderSelection();
  }
  function renderSelection(){
   for(const [period,{button,status:mark}] of Object.entries(buttons)){
    const active=controls.period===period;
    button.dataset.selected=String(active);
    button.setAttribute("aria-pressed",String(active));
    mark.textContent=active?"✓ 선택됨":"선택";
   }
   const saved=read();
   const period=saved?.period||controls.period;
   const preview=period?(period==="am"?"오전":"오후")+
    " "+PAD(Number(hour.value))+":"+minute.value:"";
   status.textContent=saved?
    "✓ 선택한 시각: "+(withDate?saved.date+" · ":"")+preview:
    (period?"날짜와 시간을 확인하고 저장해 주세요":"오전 또는 오후를 선택해 주세요");
   status.dataset.complete=String(!!saved);
  }
  const commit=()=>{
   // Never silently assume AM for an optional date; users explicitly choose
   // the period before a previously empty time value becomes saveable.
   const next=composeClock(dateInput?.value||"",controls.period,hour.value,minute.value,withDate);
   const changed=field.value!==next;
   field.value=next;
   renderSelection();
   if(changed){
    field.dispatchEvent(new Event("input",{bubbles:true}));
    field.dispatchEvent(new Event("change",{bubbles:true}));
   }
  };
  dateInput?.addEventListener("change",commit);
  hour.addEventListener("change",commit);
  minute.addEventListener("change",commit);
  for(const [period,{button}] of Object.entries(buttons)){
   button.addEventListener("click",event=>{
    event.preventDefault();event.stopPropagation();
    controls.period=period;commit();
   });
  }
  renderControls();count++;
 }
 return count;
}
function sync(field){
 if(!field)return false;
 const c=field._yuhaTimeControls;
 if(!c)return false;
 const parsed=parseClock(field.value,c.withDate);
 c.period=parsed?.period||null;
 if(c.dateInput)c.dateInput.value=parsed?.date||"";
 c.hour.value=PAD(parsed?.hour||9);
 c.minute.value=PAD(parsed?.minute||0);
 for(const [period,{button,status}] of Object.entries(c.buttons)){
  const active=c.period===period;
  button.dataset.selected=String(active);
  button.setAttribute("aria-pressed",String(active));
  status.textContent=active?"✓ 선택됨":"선택";
 }
 c.status.textContent=parsed?
  "✓ 선택한 시각: "+(c.withDate?parsed.date+" · ":"")+
   (parsed.period==="am"?"오전":"오후")+" "+PAD(parsed.hour)+":"+PAD(parsed.minute):
  "오전 또는 오후를 선택해 주세요";
 c.status.dataset.complete=String(!!parsed);
 return true;
}
function refresh(scope){
 if(!scope)return;
 for(const field of Array.from(scope.querySelectorAll?.("input.yuha-time-source")||[]))sync(field);
}
root.YuhaTimePicker={enhance,sync,refresh,parseClock,composeClock};
})(window);
