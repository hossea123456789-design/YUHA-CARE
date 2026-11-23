/* YUHA-CARE — accessible 12-hour clock, replacing unstyleable native AM/PM.
 * Existing field names/values stay unchanged: YYYY-MM-DDTHH:mm or HH:mm.
 * This is an input adapter only; it never writes to cloud or local records.
 */
(function(root){
"use strict";
const PAD=n=>String(n).padStart(2,"0");
const MINUTE_STEP_KEY="yuha_time_minute_step_device_v1";
const MINUTE_STEPS=[1,2,3,5,10,15,20,30];
const DEFAULT_MINUTE_STEP=5;
let minuteStepMemory=null;
function getMinuteStep(){
 if(minuteStepMemory!==null)return minuteStepMemory;
 try{
  const raw=root.localStorage?.getItem(MINUTE_STEP_KEY);
  const value=raw===null||raw===undefined?DEFAULT_MINUTE_STEP:Number(raw);
  minuteStepMemory=MINUTE_STEPS.includes(value)?value:DEFAULT_MINUTE_STEP;
 }catch(_){minuteStepMemory=DEFAULT_MINUTE_STEP;}
 return minuteStepMemory;
}
function setMinuteStep(value){
 const step=Number(value);
 if(!MINUTE_STEPS.includes(step))return false;
 minuteStepMemory=step;
 try{root.localStorage?.setItem(MINUTE_STEP_KEY,String(step));}catch(_){}
 return true;
}
const wrapRange=(value,delta,modulus)=>((value+delta)%modulus+modulus)%modulus;
// The visible hour is 12-hour, but typing 00 or 13–23 intentionally
// converts an explicit 24-hour entry to the matching AM/PM state.
function interpretHour(text,period){
 const raw=String(text??"").trim();
 if(!/^\d{1,2}$/.test(raw))return null;
 const number=Number(raw);
 if(number===0)return {hour:12,period:"am",converted:true};
 if(number>=13&&number<=23)
  return {hour:number-12,period:"pm",converted:true};
 if(number>=1&&number<=12)
  return {hour:number,period,converted:false};
 return null;
}
const two=(text,lo,hi)=>{
 const raw=String(text??"").trim();
 if(!/^\d{1,2}$/.test(raw))return null;
 const n=Number(raw);
 return Number.isInteger(n)&&n>=lo&&n<=hi?n:null;
};
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
  const makeNumber=(part,caption,min,max)=>{
   const wrap=doc.createElement("div");wrap.className="yuha-time-number-wrap";
   const title=doc.createElement("span");title.className="yuha-time-small-label";
   title.textContent=caption;
   const stepper=doc.createElement("div");stepper.className="yuha-time-stepper";
   const decrement=doc.createElement("button");decrement.type="button";
   decrement.className="yuha-time-step";decrement.textContent="−";
   decrement.dataset.timeStep="minus";decrement.dataset.yuhaEditable="true";
   decrement.setAttribute("aria-label",caption+(part==="hour"?" 1시간 감소":" 설정한 분 단위만큼 감소 (길게 누르면 연속 감소)"));
   const number=doc.createElement("input");number.type="text";
   number.className="yuha-time-number-input";
   number.inputMode="numeric";number.maxLength=2;number.autocomplete="off";
   number.setAttribute("inputmode","numeric");
   number.setAttribute("pattern","[0-9]*");
   number.setAttribute("aria-label",caption+" 직접 입력");
   const increment=doc.createElement("button");increment.type="button";
   increment.className="yuha-time-step";increment.textContent="+";
   increment.dataset.timeStep="plus";increment.dataset.yuhaEditable="true";
   increment.setAttribute("aria-label",caption+(part==="hour"?" 1시간 증가":" 설정한 분 단위만큼 증가 (길게 누르면 연속 증가)"));
   stepper.append(decrement,number,increment);
   wrap.append(title,stepper);clock.append(wrap);
   const selectEntireValue=()=>{
    // Selecting after both focus and pointer/click preserves replacement
    // behavior on Android/iOS, where focus may reset the caret position.
    try{number.select?.();number.setSelectionRange?.(0,String(number.value).length);}
    catch(_){}
   };
   for(const eventName of ["focus","click","pointerup"])
    number.addEventListener(eventName,selectEntireValue);
   const normalizeTypedHour=()=>{
    if(part!=="hour")return;
    const entry=interpretHour(number.value,controls.period);
    if(!entry)return;
    if(entry.converted){
     controls.period=entry.period;
     number.value=PAD(entry.hour);
    }
   };
   const move=(direction)=>{
    if(part==="hour"){
     const parsed=interpretHour(number.value,controls.period);
     const current=parsed?.hour??9;
     const period=parsed?.period||controls.period;
     const hour24=wrapRange(current%12+(period==="pm"?12:0),direction,24);
     number.value=PAD(hour24%12||12);
     if(period)controls.period=hour24<12?"am":"pm";
    }else{
     const current=two(number.value,0,59)??0;
     number.value=PAD(wrapRange(current,direction*getMinuteStep(),60));
    }
    commit();
   };
   const bindStepper=(button,direction)=>{
    let timer=null,holdStarted=0,held=false,ignoreClick=false,releaseTimer=null;
    const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
    const stop=()=>{
     clearTimer();
     if(held){
      ignoreClick=true;
      if(releaseTimer!==null)clearTimeout(releaseTimer);
      releaseTimer=setTimeout(()=>{ignoreClick=false;releaseTimer=null;},0);
     }
     held=false;
    };
    const repeat=()=>{
     held=true;move(direction);
     const elapsed=Date.now()-holdStarted;
     const delay=elapsed>=2800?45:elapsed>=1200?80:140;
     timer=setTimeout(repeat,delay);
    };
    button.addEventListener("pointerdown",event=>{
     if(event.button!==undefined&&event.button!==0)return;
     stop();ignoreClick=false;
     holdStarted=Date.now();
     timer=setTimeout(repeat,360);
    });
    for(const name of ["pointerup","pointercancel","pointerleave","lostpointercapture","blur"])
     button.addEventListener(name,stop);
    button.addEventListener("click",event=>{
     event.preventDefault();event.stopPropagation();
     if(ignoreClick){ignoreClick=false;return;}
     move(direction);
    });
   };
   bindStepper(decrement,-1);
   bindStepper(increment,1);
   number.addEventListener("input",()=>{
    normalizeTypedHour();
    commit();
   });
   number.addEventListener("change",()=>{
    normalizeTypedHour();
    const n=two(number.value,min,max);
    if(n!==null)number.value=PAD(n);
    commit();
   });
   number.addEventListener("blur",()=>{
    normalizeTypedHour();
    const n=two(number.value,min,max);
    if(n!==null)number.value=PAD(n);
   });
   return number;
  };
  const hour=makeNumber("hour","시",1,12);
  const colon=doc.createElement("span");colon.className="yuha-time-colon";colon.textContent=":";
  clock.append(colon);
  const minute=makeNumber("minute","분",0,59);
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
   const valid=two(hour.value,1,12)!==null&&two(minute.value,0,59)!==null;
   hour.setAttribute("aria-invalid",String(two(hour.value,1,12)===null));
   minute.setAttribute("aria-invalid",String(two(minute.value,0,59)===null));
   status.textContent=!valid?"시 01–12 · 분 00–59로 입력해 주세요":
    saved?"✓ "+(withDate?saved.date+" · ":"")+
     (saved.period==="am"?"오전":"오후")+" "+PAD(saved.hour)+":"+PAD(saved.minute):
    (!controls.period?"오전 또는 오후를 선택해 주세요":
     withDate?"날짜를 지정해 주세요":"시간을 확인해 주세요");
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
 c.hour.setAttribute("aria-invalid","false");
 c.minute.setAttribute("aria-invalid","false");
 c.status.dataset.complete=String(!!parsed);
 return true;
}
function refresh(scope){
 if(!scope)return;
 for(const field of Array.from(scope.querySelectorAll?.("input.yuha-time-source")||[]))sync(field);
}
root.YuhaTimePicker={enhance,sync,refresh,parseClock,composeClock,
 getMinuteStep,setMinuteStep,minuteStepOptions:[...MINUTE_STEPS],
 interpretHour};
})(window);
