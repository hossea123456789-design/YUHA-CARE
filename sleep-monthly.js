/* Monthly pediatric sleep report for the YUHA sleep diary.
   Informational, not diagnostic. No server writes and no external requests. */
(function(root){
 "use strict";
 const DAY=86400000;
 const mean=arr=>arr.length?Math.round(arr.reduce((a,b)=>a+b,0)/arr.length):null;
 const median=arr=>{
  if(!arr.length)return null;
  const s=arr.slice().sort((a,b)=>a-b),i=Math.floor(s.length/2);
  return s.length%2?s[i]:Math.round((s[i-1]+s[i])/2);
 };
 const valid=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
 function clockMinutes(s){
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(s||"")))return null;
  const p=s.split(":").map(Number);return p[0]*60+p[1];
 }
 function clockLabel(n){
  if(n===null||!Number.isFinite(n))return "—";
  const m=(Math.round(n)%1440+1440)%1440;
  return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
 }
 function duration(n){
  if(!valid(n))return "—";
  return Math.floor(n/60)+"시간 "+(n%60)+"분";
 }
 function dayBefore(date){
  const parts=date.split("-").map(Number);
  return new Date(Date.UTC(parts[0],parts[1]-1,parts[2]-1)).toISOString().slice(0,10);
 }
 function circularClock(values){
  if(!values.length)return {clock:"—",deviation:null,count:0};
  const angles=values.map(n=>n*Math.PI*2/1440);
  const sin=angles.reduce((a,n)=>a+Math.sin(n),0),cos=angles.reduce((a,n)=>a+Math.cos(n),0);
  let t=Math.atan2(sin,cos)*1440/(Math.PI*2);
  t=(t+1440)%1440;
  // Median absolute distance from the circular mean is descriptive, not a
  // pediatric diagnostic threshold.
  const deviation=median(values.map(n=>{
   const d=Math.abs(t-n);return Math.round(Math.min(d,1440-d));
  }));
  return {clock:clockLabel(t),deviation,count:values.length};
 }
 function assess(summary){
  const x=summary;
  const insights=[];
  if(x.completeDays===0){
   insights.push({kind:"limited",title:"기록이 없어 종합 평가 보류",
    text:"밤잠(전날 잠든 시각·당일 기상)과 낮잠 시작·종료가 모두 확인된 날이 없습니다. 빠진 시간을 0분으로 간주하지 않았습니다."});
  }else if(x.completeDays<5){
   insights.push({kind:"limited",title:"표본 부족 · 현재는 관찰값만 제공",
    text:"총수면이 완성된 기록이 "+x.completeDays+"일이어서 월간 경향을 일반화하기 어렵습니다. 우선 여러 날을 연속 기록해 주세요."});
  }else if(x.recommendedCount===0){
   insights.push({kind:"limited",title:"월령별 권고 판정 불가",
    text:"총수면은 집계했지만 생년월일에 맞는 권고 범위가 확인되지 않아 적정 여부를 단정하지 않았습니다."});
  }else{
   const p=Math.round(x.withinCount/x.recommendedCount*100);
   const detail="평가 가능 "+x.recommendedCount+"일 중 권고 범위 "+x.withinCount+"일("+p+"%), 미만 "+x.belowCount+"일, 초과 "+x.aboveCount+"일입니다.";
   let kind="neutral",title="월령별 총수면 권고와 비교";
   if(x.belowCount>=3&&x.belowCount>x.withinCount){
    kind="review";title="권고 미만인 날이 반복 관찰됨";
   }else if(x.aboveCount>=3&&x.aboveCount>x.withinCount){
    kind="review";title="권고 초과인 날이 반복 관찰됨";
   }else if(p>=75){
    kind="positive";title="기록된 날 대부분 권고 범위";
   }
   const nextStep=kind==="positive"?
    " 수면량은 권고와 대체로 부합하지만, 야간 각성이나 수면호흡 상태까지 확인된 것은 아닙니다.":
    x.belowCount>x.withinCount?
    " 우선 누락된 밤잠·낮잠 시간이 없는지 확인하고, 일정한 취침 준비와 24시간 수면 기회를 살펴보세요.":
    x.aboveCount>x.withinCount?
    " 권고보다 긴 수면만으로 질환을 판단할 수는 없으며, 낮 활동성·컨디션 변화와 함께 관찰할 필요가 있습니다.":
    " 일별 수면량 편차와 낮 활동성을 함께 살피며 일정한 수면 루틴을 유지하는 편이 좋습니다.";
   insights.push({kind,title,text:detail+
    " AASM·WHO의 24시간 총수면(낮잠 포함) 권고에 따른 비교입니다."+nextStep});
  }
  if(x.asleepClock.count>=4&&x.wakeClock.count>=4){
   insights.push({kind:"neutral",title:"수면·기상 리듬",
    text:"실제 잠든 시각 평균 "+x.asleepClock.clock+"(일별 편차 중앙값 "+x.asleepClock.deviation+"분), "+
     "기상 평균 "+x.wakeClock.clock+"(편차 "+x.wakeClock.deviation+"분)입니다. "+
     "WHO는 일정한 수면·기상 시각을 권장하지만, 이 편차 수치에 단일 의학적 정상·비정상 경계값을 적용하지 않습니다."});
  }else{
   insights.push({kind:"limited",title:"수면 리듬 판단에 기록 부족",
    text:"취침·기상 시각을 각각 4일 이상 관찰하면 평균 시각과 일별 변동을 표시합니다."});
  }
  if(x.halfDifference!==null){
   const delta=Math.abs(x.halfDifference);
   insights.push({kind:"neutral",title:"월 전·후반 추세",
    text:"월 전반부에 비해 후반부의 완성 기록 하루 총수면 평균이 "+
     (x.halfDifference===0?"같습니다.":delta+"분 "+(x.halfDifference>0?"늘었습니다.":"줄었습니다."))+
     " 각 구간 최소 4일의 기록을 비교한 기술통계이며 개인 건강에 대한 평가 기준은 아닙니다."});
  }
  if(x.latencySamples>=3){
   insights.push({kind:"neutral",title:"입실 후 잠들기",
    text:"침대 입실부터 실제 잠듦까지 기록된 평균은 "+x.latencyAverage+"분("+x.latencySamples+"일)입니다. "+
      "이는 보호자 입력에 따른 경과 시간이며, 이 숫자만으로 수면장애나 치료 필요성을 판정할 수 없습니다."});
  }
  insights.push({kind:"guidance",title:"소아청소년과 관점의 관찰 포인트",
   text:"총수면과 시각 외에 밤중 잦은 각성, 지속적인 코골이·호흡 이상, 낮 동안의 과도한 졸림·행동 변화를 함께 살피세요. "+
    "반복되면 수면 일지를 바탕으로 소아청소년과에서 평가할 만한 신호입니다."});
  return insights;
 }
 function buildMonthlySummary(args){
  const {year,month,today,qualityFor,recordFor,recommendationFor}=args||{};
  if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12||
     typeof qualityFor!=="function"||typeof recordFor!=="function"||
     typeof recommendationFor!=="function")throw Error("Invalid monthly sleep summary inputs");
  const period=String(year)+"-"+String(month).padStart(2,"0");
  const days=new Date(Date.UTC(year,month,0)).getUTCDate();
  const last=today||"9999-12-31";
  const eligible=period>last.slice(0,7)?0:period===last.slice(0,7)?Math.min(days,Number(last.slice(8,10))):days;
  const totals=[],nights=[],naps=[],latencies=[],sleepClocks=[],wakes=[];
  let observedDays=0,withinCount=0,belowCount=0,aboveCount=0,recommendedCount=0;
  let napSingle=0,napDouble=0,firstHalf=[],secondHalf=[];
  for(let i=1;i<=eligible;i++){
   const date=period+"-"+String(i).padStart(2,"0");
   const q=qualityFor(date)||{};
   if(q.level!=="empty"&&q.level!==undefined)observedDays++;
   const night=valid(q.night)?q.night:null,nap=valid(q.nap)?q.nap:null;
   if(night!==null)nights.push(night);
   if(nap!==null){
    naps.push(nap);
    if(q.napCount===1)napSingle++;
    if(q.napCount===2)napDouble++;
   }
   if(valid(q.latency))latencies.push(q.latency);
   const p=recordFor(dayBefore(date))||{},t=recordFor(date)||{};
   const asleep=clockMinutes(p.asleepTime),wake=clockMinutes(t.wakeTime);
   if(asleep!==null)sleepClocks.push(asleep);
   if(wake!==null)wakes.push(wake);
   if(!valid(q.total))continue;
   totals.push(q.total);
   if(i<=Math.floor(eligible/2))firstHalf.push(q.total);
   else secondHalf.push(q.total);
   const rec=recommendationFor(date)||{};
   if(!valid(rec.min)||!valid(rec.max))continue;
   recommendedCount++;
   if(q.total<rec.min)belowCount++;
   else if(q.total>rec.max)aboveCount++;
   else withinCount++;
  }
  const completeDays=totals.length;
  const completeness=eligible?Math.round(completeDays/eligible*100):0;
  const asleepClock=circularClock(sleepClocks),wakeClock=circularClock(wakes);
  const result={
   period,eligible,observedDays,completeDays,completeness,
   averageTotal:mean(totals),averageNight:mean(nights),nightSamples:nights.length,
   averageNap:mean(naps),napSamples:naps.length,napSingle,napDouble,
   latencyAverage:mean(latencies),latencySamples:latencies.length,
   asleepClock,wakeClock,
   withinCount,belowCount,aboveCount,recommendedCount,
   recommendationPct:recommendedCount?Math.round(withinCount/recommendedCount*100):null,
   halfDifference:firstHalf.length>=4&&secondHalf.length>=4?
     mean(secondHalf)-mean(firstHalf):null,
   recordLevel:completeDays>=10&&completeness>=60?"sufficient":
     completeDays>=5?"limited":"insufficient"
  };
  result.insights=assess(result);
  return result;
 }
 // Start/end times are suggestions only. A valid manually entered end is never
 // altered, even if it is different from the default duration.
 function suggestedEnd(start,currentEnd,mode){
  const a=clockMinutes(start),b=clockMinutes(currentEnd);
  if(a===null)return currentEnd||"";
  const isNight=mode==="night";
  const diff=b===null?null:isNight?(b-a+1440)%1440:b-a;
  const reasonable=diff!==null&&diff>0&&diff<=(isNight?180:360);
  if(reasonable)return currentEnd;
  if(!isNight&&a+30>=1440)return currentEnd||"";
  return clockLabel(a+30);
 }
 root.YuhaSleepMonthly=Object.freeze({
  buildMonthlySummary,formatDuration:duration,clockLabel,suggestedEnd
 });
})(window);
