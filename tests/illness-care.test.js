'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('illness-care.js','utf8');
const storage=new Map();
const locals={
 getItem:key=>storage.get(key)||null,
 setItem:(key,value)=>storage.set(key,String(value)),
 removeItem:key=>storage.delete(key)
};
function setup(rpcHandler){
 const root={dataset:{},innerHTML:'',handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},
  querySelector(){return null;},querySelectorAll(){return []}};
 const window={confirm:()=>true,addEventListener(){},prompt:()=>null};
 if(rpcHandler){
  window.google={script:{run:{
   withSuccessHandler(success){
    return {withFailureHandler(failure){
     return new Proxy({}, {get(_target,method){
      return (...args)=>rpcHandler(method,args,success,failure);
     }});
    }};
   }
  }}};
 }
 const context={window,document:{getElementById:id=>id==='main'?root:null},
  localStorage:locals,crypto:require('node:crypto').webcrypto,
  setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,
  FormData:class{constructor(form){this.values=form.values||{}}get(key){const v=this.values[key];return Array.isArray(v)?v[0]??null:v??null}getAll(key){const v=this.values[key];return Array.isArray(v)?v:v===undefined?[]:[v]}},
  Date,Math,JSON,Number,Intl,console};
 vm.runInNewContext(source,context,{filename:'illness-care.js'});
 return {root,window,model:window.YuhaIllness.model,test:window.YuhaIllness._test};
}
function baseMedication(overrides={}){
 return {id:'imed01',name:'처방받은 약 A',category:'other',doseMl:3,
 mode:'scheduled',intervalHours:8,active:true,doses:[],...overrides};
}
function intake(at,status='taken',extra={}){
 return {id:'idose01',at,status,amountMl:status==='taken'?3:null,
 note:'',scheduledFor:'',...extra};
}
(function testScheduledFirstActualAndOverdue(){
 const {test}=setup();
 const m=baseMedication({doses:[intake('2026-11-14T00:00:00.000Z')]});
 const upcoming=test.guidance(m,new Date('2026-11-14T07:00:00.000Z'));
 assert.equal(upcoming.state,'upcoming');
 assert.equal(upcoming.dueAt,'2026-11-14T08:00:00.000Z');
 const overdue=test.guidance(m,new Date('2026-11-14T09:15:00.000Z'));
 assert.equal(overdue.state,'overdue');
 assert.match(overdue.text,/1시간 15분/);
 const noFirst=test.guidance(baseMedication(),new Date('2026-11-14T09:15:00.000Z'));
 assert.equal(noFirst.state,'not-started');
 assert.equal(noFirst.dueAt,null);
 const skipped=test.guidance(baseMedication({doses:[
  intake('2026-11-14T00:00:00.000Z'),
  intake('2026-11-14T08:30:00.000Z','skipped',{
   id:'idose02',scheduledFor:'2026-11-14T08:00:00.000Z'})
 ]}),new Date('2026-11-14T10:00:00.000Z'));
 assert.equal(skipped.dueAt,'2026-11-14T16:00:00.000Z');
 console.log('PASS illness: first actual dose anchors scheduled next dose; overdue and documented skipped dose');
})();
(function testPrnAndEndedNeverWarn(){
 const {test}=setup();
 const last=intake('2026-11-14T00:00:00.000Z');
 for(const m of [
  baseMedication({mode:'prn',doses:[last]}),
  baseMedication({active:false,doses:[last]})
 ]){
  const s=test.guidance(m,new Date('2026-11-14T23:00:00.000Z'));
  assert.notEqual(s.state,'overdue');
 }
 const course=test.guidance(baseMedication({
  endsAt:'2026-11-14T03:00:00.000Z',doses:[last]
 }),new Date('2026-11-14T09:00:00.000Z'));
 assert.equal(course.state,'course-end');
 console.log('PASS illness: PRN, finished, and entered course-end records never fabricate missed-dose alerts');
})();
(function testFeverHeatmapHighestTemperature(){
 const {test}=setup();
 const values=test.dailyMax([
  {at:'2026-11-14T02:00:00.000Z',celsius:38.2},
  {at:'2026-11-14T03:00:00.000Z',celsius:39.1},
  {at:'2026-11-15T02:00:00.000Z',celsius:36.8}
 ]);
 assert.equal(values['2026-11-14'],39.1);
 assert.equal(test.heatBand(39.1),'high');
 assert.equal(test.heatBand(38.0),'fever');
 assert.equal(test.heatBand(36.8),'normal');
 assert.equal(test.heatBand(undefined),'missing');
 console.log('PASS illness: max measured temperature heatmap and no-data cells');
})();
(function testIndependentStorageAndWholeJournalUI(){
 storage.clear();
 const e=setup(),id='iabc_123',caseData={
  id,title:'발열·콧물',onsetAt:'2026-11-14T00:00:00.000Z',
  symptoms:'기침',status:'active',visits:[{
   id:'ivisit01',at:'2026-11-14T00:00:00.000Z',hospital:'가상병원',
   diagnosis:'감기',notes:'직접 확인'
  }],medications:[baseMedication()],temperatures:[{
   id:'itemp01',at:'2026-11-14T01:00:00.000Z',celsius:38.2,
   site:'ear',note:''
  }]
 };
 storage.set('yuha_illness_records_v1',JSON.stringify({[id]:caseData}));
 // A new view loads the persisted illness data without modifying unrelated keys.
 const e2=setup();
 e2.window.YuhaIllness.render();
 assert.equal(e2.model.cases[id].title,'발열·콧물');
 for(const label of ['새 질병 등록','병원 방문','처방 등록','복용 내역','체온 · 열 히트맵','질병 관리'])assert(e2.root.innerHTML.includes(label),label);
 assert(e2.root.innerHTML.includes('가상병원'));
 assert(e2.root.innerHTML.includes('38.2'));
 assert(!e2.root.innerHTML.includes('실제 처방 용량을 자동 제안하지 않습니다.')); // wording can change
 assert.equal(storage.has('yuha_mental_recovery_local_v1'),false);
 assert.equal(storage.has('yuha_sleep_month_v5_2026-11'),false);
 console.log('PASS illness: dedicated storage and all six user workflows render');
})();
(function testNormalizeNoMedicationInferenceOrAutomaticClosure(){
 const {test}=setup();
 const c=test.normalize({id:'ix_1',title:'증상',onsetAt:'2026-11-14T00:00:00.000Z',
  temperatures:[{id:'it_1',at:'2026-11-14T03:00:00.000Z',celsius:36.5,site:'ear'}]});
 assert.equal(c.status,'active');
 assert.equal(c.medications.length,0);
 assert.equal(c.closedAt,'');
 assert.equal(c.recoveryConfirmed,false);
 assert.equal(test.sameData(c,{...c,revision:'server-v1'}),true);
 console.log('PASS illness: fever normalization does not infer medicine dose or close illness');
})();


(function testFullEntryFlow(){
 storage.clear();
 const e=setup();e.window.YuhaIllness.render();
 const submit=(type,values)=>{
  const form={dataset:{form:type},values};
  const event={preventDefault(){},target:{closest:()=>form}};
  e.root.handlers.submit(event);
 };
 submit('episode',{title:'발열',onset:'2026-11-14T08:00',symptoms:'체온 상승',note:'시작'});
 const ids=Object.keys(e.model.cases);
 assert.equal(ids.length,1);
 const id=ids[0],get=()=>e.model.cases[id];
 assert.equal(get().title,'발열');
 assert.equal(get().status,'active');
 submit('visit',{at:'2026-11-14T10:00',hospital:'가상 테스트 병원',diagnosis:'검사',notes:'처방 기재'});
 assert.equal(get().visits.length,1);
 submit('medicine',{name:'가상 처방 A',category:'other',mode:'scheduled',
  doseMl:'2.5',intervalHours:'8',ingredient:'가상 성분',formulation:'시럽',instructions:'처방전대로',
  visitId:get().visits[0].id,endsAt:''});
 assert.equal(get().medications.length,1);
 assert.equal(get().medications[0].doseMl,2.5);
 assert.equal(get().medications[0].visitId,get().visits[0].id);
 const med=get().medications[0];
 submit('dose',{medicationId:med.id,at:'2026-11-14T11:00',status:'taken',amountMl:'2.5',note:'기록'});
 assert.equal(get().medications[0].doses.length,1);
 assert.equal(get().medications[0].doses[0].amountMl,2.5);
 submit('temp',{at:'2026-11-14T11:30',celsius:'38.6',site:'ear',note:'복용 전'});
 assert.equal(get().temperatures[0].celsius,38.6);
 // Explicit caregiver closure retires active prescriptions but does not delete doses.
 submit('close',{recovered:'on',done:'on',note:'회복됨'});
 assert.equal(get().status,'closed');
 assert.equal(get().medications[0].active,false);
 assert.equal(get().medications[0].doses.length,1);
 assert.equal(get().medications[0].doses[0].amountMl,2.5);
 assert.equal(get().recoveryConfirmed,true);
 assert.equal(get().noFurtherMedicationConfirmed,true);
 assert(Object.keys(JSON.parse(storage.get('yuha_illness_pending_v1'))).length===1);
 assert(JSON.parse(storage.get('yuha_illness_records_v1'))[id]);
 console.log('PASS illness: real form submissions cover episode→clinic→prescription→dose→temperature→explicit closure');
})();


(async function testAutomaticSharedServerSync(){
 storage.clear();
 let lastRevision='r0',calls=[],server={};
 const id='iautotest_01',localCase={
  id,title:'아기 기침',onsetAt:'2026-11-14T00:00:00.000Z',
  symptoms:'기침',status:'active',visits:[],medications:[],temperatures:[]
 };
 storage.set('yuha_illness_records_v1',JSON.stringify({[id]:localCase}));
 storage.set('yuha_illness_pending_v1',JSON.stringify({[id]:{
  episode:localCase,expectedRevision:''
 }}));
 const e=setup((method,args,success,failure)=>{
  calls.push({method,args});
  if(method==='getIllnessCases'){
   assert.equal(args.length,0,'shared app read does not request a password');
   success({ok:true,schemaVersion:4,cases:structuredClone(server)});
  }else if(method==='syncIllnessCase'){
   assert.equal(args.length,1,'save requires only one entry payload');
   assert(!('passphrase' in args[0]),'shared app save must not send a secret');
   assert.equal(args[0].episode.id,id);
   lastRevision='r1';
   server[id]={...structuredClone(args[0].episode),revision:lastRevision};
   success({ok:true,revision:lastRevision});
  }else failure(new Error('unexpected RPC '+method));
 });
 e.window.YuhaIllness.render();
 assert(e.root.innerHTML.includes('서버 재조회'));
 assert(!e.root.innerHTML.includes('type="password"'),'no extra password input');
 assert(!e.root.innerHTML.includes('비공개 서버 연결'),'no gated connect');
 for(let i=0;i<12&&Object.keys(e.model.pending).length;i++)
  await Promise.resolve();
 assert.equal(Object.keys(e.model.pending).length,0,
  'new local episode should automatically sync and clear pending after readback');
 assert(calls.some(x=>x.method==='getIllnessCases'));
 assert(calls.some(x=>x.method==='syncIllnessCase'));
 assert.equal(e.model.cases[id].revision,'r1');
 assert.equal(JSON.parse(storage.get('yuha_illness_records_v1'))[id].revision,'r1');
 console.log('PASS illness: tab entry auto-connects, no password prompt, syncs and verifies existing pending');
})().catch(error=>{console.error(error);process.exitCode=1;});


(function testTemperatureShorthandAndGroupSafety(){
 const {test}=setup();
 for(const [raw,expected] of [['385',38.5],['390',39],['375',37.5],['38',38],['38.5',38.5],['420',42]])
  assert.equal(test.parseTemperature(raw),expected,raw);
 for(const invalid of ['3850','4','385.5','999','29','43.1','abc',''])
  assert.equal(test.parseTemperature(invalid),null,invalid);
 const group={id:'ibundle_01',name:'아침 약',mode:'scheduled',intervalHours:8,active:true,
  items:[{id:'im_1',name:'약 A',amount:2.5,unit:'mL'},{id:'im_2',name:'약 B',amount:1,unit:'포'}],
  events:[]};
 assert.equal(test.groupGuidance(group,new Date('2026-11-14T08:00:00.000Z')).state,'not-started');
 group.events.push({id:'ie_1',at:'2026-11-14T08:00:00.000Z',status:'taken',items:group.items});
 const due=test.groupGuidance(group,new Date('2026-11-14T09:00:00.000Z'));
 assert.equal(due.dueAt,'2026-11-14T16:00:00.000Z');
 assert.equal(test.groupGuidance({...group,mode:'prn'},new Date('2026-11-14T23:00:00.000Z')).state,'prn');
 console.log('PASS illness: 385→38.5 temperature, invalid units rejected, group interval only after actual dose');
})();
(function testSimpleBundleFormsPreserveLegacyData(){
 storage.clear();
 const e=setup(),submit=(type,values)=>{
  const form={dataset:{form:type},values};
  e.root.handlers.submit({preventDefault(){},target:{closest:()=>form}});
 };
 e.window.YuhaIllness.render();
 submit('episode',{title:'감기',onset:'2026-11-14T08:00',symptoms:'기침',note:''});
 const id=Object.keys(e.model.cases)[0],episode=()=>e.model.cases[id];
 assert.equal(episode().medicationGroups.length,0);
 submit('group',{groupName:'아침·저녁 묶음',
  drugName:['챔프','시럽 B'],drugAmount:['3','2.5'],drugUnit:['mL','mL'],
  mode:'scheduled',intervalHours:'8'});
 assert.equal(episode().medicationGroups.length,1);
 assert.deepEqual(Array.from(episode().medicationGroups[0].items.map(x=>x.amount)),[3,2.5]);
 assert(episode().medicationGroups[0].items.every(x=>!('ingredient' in x)&&!('formulation' in x)));
 assert(e.root.innerHTML.includes('챔프')&&e.root.innerHTML.includes('3mL'));
 assert(e.root.innerHTML.includes('시럽 B')&&e.root.innerHTML.includes('2.5mL'));
 const g=episode().medicationGroups[0];
 submit('group-dose',{groupId:g.id,at:'2026-11-14T10:00',status:'taken',note:''});
 assert.equal(episode().medicationGroups[0].events.length,1);
 assert.equal(episode().medicationGroups[0].events[0].items.length,2);
 const past=episode().medicationGroups[0].events[0].items[0].amount;
 // Changing prescription amount preserves the original administration's snapshot.
 submit('group',{editGroupId:g.id,groupName:'아침·저녁 묶음',
  drugName:['챔프','시럽 B'],drugAmount:['4','2.5'],drugUnit:['mL','mL'],
  mode:'scheduled',intervalHours:'8'});
 assert.equal(episode().medicationGroups[0].items[0].amount,4);
 assert.equal(episode().medicationGroups[0].events[0].items[0].amount,past);
 submit('temp',{at:'2026-11-14T11:30',celsius:'385',site:'ear',note:''});
 assert.equal(episode().temperatures[0].celsius,38.5);
 submit('temp',{at:'2026-11-14T12:00',celsius:'999',site:'ear',note:''});
 assert.equal(episode().temperatures.length,1,'invalid temperature must not be stored');
 submit('close',{recovered:'on',done:'on',note:'완료'});
 assert.equal(episode().status,'closed','explicit caregiver confirmation ends illness');
 assert.equal(episode().medicationGroups[0].active,false);
 assert.equal(episode().medicationGroups[0].events[0].items[0].amount,past,
  'previously taken amount must survive closure');
 // A preexisting individual medicine must remain intact after bundling.
 assert.equal(episode().medications.length,0);
 assert.equal(JSON.parse(storage.get('yuha_illness_records_v1'))[id].medicationGroups.length,1);
 console.log('PASS illness: two medicines saved as one bundle, historical administered amounts preserved, temp 385 and medicine retirement at closure');
})();

(async function testOldServerWillNotReceiveBundles(){
 storage.clear();
 let saves=0;
 const id='ioldserver_01',episode={
  id,title:'기침',onsetAt:'2026-11-14T00:00:00.000Z',status:'active',
  medications:[],visits:[],temperatures:[],
  medicationGroups:[{id:'igroup01',name:'감기약',mode:'scheduled',intervalHours:8,
   active:true,endsAt:'',items:[{id:'idrug01',name:'약 A',amount:3,unit:'mL'}],events:[]}]
 };
 storage.set('yuha_illness_records_v1',JSON.stringify({[id]:episode}));
 storage.set('yuha_illness_pending_v1',JSON.stringify({[id]:{episode,expectedRevision:''}}));
 const e=setup((method,args,success)=>{
  if(method==='getIllnessCases')success({ok:true,schemaVersion:1,cases:{}});
  if(method==='syncIllnessCase'){saves++;success({ok:true,revision:'wrong'});}
 });
 e.window.YuhaIllness.render();
 for(let n=0;n<12;n++)await Promise.resolve();
 assert.equal(saves,0,'old API must never strip medication groups');
 assert.equal(Object.keys(e.model.pending).length,1,'group data remains locally pending');
 assert.equal(e.model.cases[id].medicationGroups[0].items[0].amount,3);
 console.log('PASS illness: old v1 API is read-only rejected; v2 required to save grouped medicines');
})().catch(err=>{console.error(err);process.exitCode=1});


(function testInputActuallyShowsDecimal(){
 storage.clear();
 const e=setup(),t=e.test;
 for(const [before,after] of [
  ['385','38.5'],['390','39.0'],['375','37.5'],
  ['38','38'],['38.5','38.5'],['999','999'],['38.','38.']
 ])assert.equal(t.formatTemperatureInput(before),after,before);
 assert.equal(t.formatTemperatureInput('38',true),'38.0');
 assert.equal(t.formatTemperatureInput('385',true),'38.5');
 const preview={textContent:''};
 e.root.querySelector=selector=>selector==='[data-temp-preview]'?preview:null;
 e.window.YuhaIllness.render();
 let cursor=null;
 const input={name:'celsius',value:'385',
  setSelectionRange:(start,end)=>{cursor=[start,end]}};
 e.root.handlers.input({target:input});
 assert.equal(input.value,'38.5','the actual displayed input must show decimal, not raw 385');
 assert.deepEqual(cursor,[4,4]);
 assert.equal(preview.textContent,'38.5℃로 저장됩니다');
 input.value='38';
 e.root.handlers.input({target:input});
 assert.equal(input.value,'38','two-digit entry should not gain a decimal prematurely');
 input.value='385';
 e.root.handlers.input({target:input});
 assert.equal(input.value,'38.5','typing the third digit must convert');
 input.value='38';
 e.root.handlers.focusout({target:input});
 assert.equal(input.value,'38.0','two-digit value gains a decimal on blur');
 input.value='999';
 e.root.handlers.input({target:input});
 assert.equal(input.value,'999','invalid number not turned into a plausible measurement');
 assert.match(preview.textContent,/확인/);
 console.log('PASS illness: actual temperature field formats 385 into visible 38.5 as typed');
})();


(function testAlwaysVisibleDailyFeverGraph(){
 storage.clear();
 const id='itrend_01',raw={
  id,title:'체온 추적',onsetAt:'2026-11-14T00:00:00.000Z',status:'active',
  visits:[],medications:[],medicationGroups:[],
  temperatures:[
   {id:'it_2',at:'2026-11-14T10:30:00.000Z',celsius:39.1,site:'ear',note:'오전'},
   {id:'it_3',at:'2026-11-14T15:20:00.000Z',celsius:38.0,site:'armpit',note:'오후'},
   {id:'it_1',at:'2026-11-14T08:15:00.000Z',celsius:37.7,site:'ear',note:'아침'},
   {id:'it_4',at:'2026-11-15T08:00:00.000Z',celsius:37.1,site:'forehead',note:'다음날'}
  ]
 };
 storage.set('yuha_illness_records_v1',JSON.stringify({[id]:raw}));
 const e=setup(),test=e.test;
 const sorted=test.dailyTemperatureReadings(raw.temperatures,'2026-11-14');
 assert.deepEqual(Array.from(sorted.map(t=>t.id)),['it_1','it_2','it_3'],
  'readings must be sorted by actual time rather than input order');
 assert.equal(test.dailyTemperatureReadings(raw.temperatures,'2026-11-16').length,0);
 e.window.YuhaIllness.render();
 const click=(action,day)=>{
  const button={dataset:{act:action,day},closest(){return this}};
  e.root.handlers.click({target:{closest:()=>button}});
 };
 click('temp-day','2026-11-14');
 const html=e.root.innerHTML;
 assert(html.includes('체온 변화'),'daily trend must be permanently visible');
 assert(html.includes('ill-temp-history'),'measurement list must also be permanently visible');
 assert(html.includes('측정 이력 · 11월 14일 (3회)'));
 assert(html.includes('<polyline points="'),'two or more measurements must form a line');
 assert.equal((html.match(/<circle cx=/g)||[]).length,3,'graph must show all three readings');
 assert(html.includes('최저 <b>37.7℃</b>'));
 assert(html.includes('최고 <b>39.1℃</b>'));
 assert(html.includes('첫 37.7 → 최근 <b>38.0℃</b>'));
 assert(!html.includes('<details><summary>체온 측정 이력'),
  'measurement history must not be hidden in an accordion');
 const heat=html.match(/data-act="temp-day" data-day="2026-11-14" aria-pressed="true"/g)||[];
 assert.equal(heat.length,1,'selected date must be highlighted and accessible');
 const a=html.indexOf('측정 이력 · 11월 14일');
 assert(html.indexOf('15:20',a)<html.indexOf('10:30',a),'readings in the visible list are newest-first');
 click('temp-day','2026-11-15');
 assert(e.root.innerHTML.includes('측정 이력 · 11월 15일 (1회)'));
 assert(!e.root.innerHTML.includes('<polyline points="'),
  'one reading is a point, not a fabricated trend line');
 assert.equal((e.root.innerHTML.match(/<circle cx=/g)||[]).length,1);
 click('temp-day','2026-11-16');
 assert(e.root.innerHTML.includes('이날 측정한 체온이 없습니다.'));
 assert(!e.root.innerHTML.includes('<circle cx='));
 assert.equal(e.model.cases[id].temperatures.length,4,'date selection never mutates original readings');
 console.log('PASS illness: always visible daily trend and readings; chronological points, day switch, one/zero cases');
})();
(function testTemperatureEntryUpdatesSelectedDailyTrend(){
 storage.clear();
 const e=setup(),id='itrend_form01';
 storage.set('yuha_illness_records_v1',JSON.stringify({[id]:{
  id,title:'발열',onsetAt:'2026-11-14T08:00:00.000Z',status:'active',
  visits:[],medications:[],medicationGroups:[],temperatures:[]
 }}));
 e.window.YuhaIllness.render();
 const form={dataset:{form:'temp'},values:{
  celsius:'385',at:'2026-11-14T13:20',site:'ear',note:'복용 전'
 }};
 e.root.handlers.submit({preventDefault(){},target:{closest:()=>form}});
 assert.equal(e.model.cases[id].temperatures[0].celsius,38.5);
 assert(e.root.innerHTML.includes('측정 이력 · 11월 14일 (1회)'),
  'saving must immediately show the new daily reading');
 assert(e.root.innerHTML.includes('38.5℃'));
 assert(e.root.innerHTML.includes('복용 전'));
 assert(!e.root.innerHTML.includes('<details><summary>체온 측정 이력'));
 console.log('PASS illness: recording 385 immediately refreshes its permanently open daily graph and history');
})();


(function testPrescriptionJsonParserAndPrecision(){
 const t=setup().test;
 const sample={schema:"yuha-prescription-import/v1",dispensedAt:"2026-11-14",medications:[
  {name:"항생제 A",doseAmount:5,doseUnit:"mL",timesPerDay:2,days:4},
  {name:"기침 시럽",doseAmount:4,doseUnit:"mL",timesPerDay:3,days:4},
  {name:"건조 시럽",doseAmount:0.3333,doseUnit:"g",timesPerDay:3,days:4},
  {name:"콧물약 정제",doseAmount:0.25,doseUnit:"정",timesPerDay:3,days:4},
  {name:"소염 시럽",doseAmount:4,doseUnit:"mL",timesPerDay:3,days:3}
 ]};
 assert.equal(t.validAmount(.25,"정"),true);
 assert.equal(t.validAmount(.01,"mL"),true);
 assert.equal(t.validAmount(.3333,"g"),true,"exact 0.3333g is never rounded");
 assert.equal(t.validAmount(.3333,"mL"),false,"ordinary manual units have at most 2 decimals");
 assert.equal(t.validAmount(.33333,"g"),false);
 const result=t.parsePrescriptionJson(JSON.stringify(sample));
 assert.equal(result.medicationCount,5);
 assert.equal(result.groups.length,3,"2x4, 3x4, 3x3 should be different bundles");
 assert(result.hasExtraPrecision);
 assert(result.groups.every(g=>g.intervalHours===null),"do not invent 12h or 8h");
 assert(result.groups.every(g=>g.events.length===0));
 assert(result.groups.some(g=>g.items.some(i=>i.amount===0.3333&&i.unit==="g")));
 const noHours=result.groups.find(g=>g.timesPerDay===2);
 assert.equal(noHours.days,4);
 assert.equal(noHours.items[0].amount,5);
 assert.equal(t.groupGuidance(noHours).state,"invalid","no overdue guess without interval");
 const template={...sample,bundleTemplates:[{name:"아침 저녁",items:[{name:"항생제 A",amount:5,unit:"mL"}]}]};
 const result2=t.parsePrescriptionJson(JSON.stringify(template));
 assert.equal(result2.groups.length,3,"unreferenced medicines are included safely");
 assert.equal(result2.groups[0].name,"아침 저녁");
 assert.throws(()=>t.parsePrescriptionJson("invalid json"),/JSON 형식/);
 assert.throws(()=>t.parsePrescriptionJson(JSON.stringify({
  ...sample,bundleTemplates:[{name:"잘못된 묶음",items:[{name:"항생제 A",amount:4,unit:"mL"}]}]
 })),/일치/);
 assert.throws(()=>t.parsePrescriptionJson(JSON.stringify({...sample,
  medications:[{...sample.medications[0],doseAmount:0.555}]})),/1회량/);
 console.log("PASS illness JSON: five meds into 3 safe bundles, exact g/quarter tablet, 2dp limits, no invented hours");
})();
(function testJsonPrescriptionPreviewAndGroupCopy(){
 storage.clear();
 const id="ijsoncase_01",episode={id,title:"발열",onsetAt:"2026-11-14T00:00:00.000Z",
  status:"active",medications:[],visits:[],temperatures:[],medicationGroups:[]};
 storage.set("yuha_illness_records_v1",JSON.stringify({[id]:episode}));
 const e=setup();
 let preview={innerHTML:""};
 e.root.querySelector=selector=>selector==="#illPrescriptionPreview"?preview:null;
 e.window.YuhaIllness.render();
 const input={schema:"yuha-prescription-import/v1",dispensedAt:"2026-11-14",
  medications:[
   {name:"약 1",doseAmount:2.5,doseUnit:"mL",timesPerDay:2,days:4},
   {name:"약 2",doseAmount:0.25,doseUnit:"정",timesPerDay:3,days:4}
  ]};
 const fire=(type,values)=>{
  const form={dataset:{form:type},values};
  e.root.handlers.submit({preventDefault(){},target:{closest:()=>form}});
 };
 const click=(act,id)=>{
  const button={dataset:{act,id},closest(){return this}};
  e.root.handlers.click({target:{closest:()=>button}});
 };
 fire("prescription-json",{prescriptionJson:JSON.stringify(input)});
 assert.equal(e.model.cases[id].medicationGroups.length,0,"preview must not save before confirmation");
 assert(preview.innerHTML.includes("저장 전 확인"));
 click("confirm-json-import");
 assert.equal(e.model.cases[id].medicationGroups.length,2);
 assert(e.model.cases[id].medicationGroups.every(g=>g.events.length===0));
 // Copy a preset, edit the medicine list, then save without copying doses.
 const first=e.model.cases[id].medicationGroups[0];
 const originalId=first.id,originalItemId=first.items[0].id;
 click("copy-group",originalId);
 assert(e.root.innerHTML.includes("복사본"),"copy must enter editable draft, not duplicate instantly");
 assert.equal(e.model.cases[id].medicationGroups.length,2);
 fire("group",{editGroupId:"",groupName:"아침 특별 묶음",drugName:["약 1"],
  drugAmount:["2.5"],drugUnit:["mL"],mode:"scheduled",intervalHours:""});
 assert.equal(e.model.cases[id].medicationGroups.length,3);
 const copied=e.model.cases[id].medicationGroups[2];
 assert.notEqual(copied.id,originalId);
 assert.notEqual(copied.items[0].id,originalItemId);
 assert.equal(copied.events.length,0);
 assert.equal(copied.timesPerDay,2);
 assert.equal(copied.intervalHours,null);
 // Second identical JSON import should be detected and not duplicate originals.
 const existing=e.model.cases[id].medicationGroups.length;
 preview={innerHTML:""};
 fire("prescription-json",{prescriptionJson:JSON.stringify(input)});
 click("confirm-json-import");
 assert.equal(e.model.cases[id].medicationGroups.length,existing);
 console.log("PASS illness JSON UI: preview, confirmed import, editable copy, fresh IDs/no dose history, dedupe");
})();

(function testCopyableCrossChatPrescriptionRequest(){
 storage.clear();
 const e=setup(),t=e.test,example=t.prescriptionExample();
 assert.equal(example.schema,"yuha-prescription-import/v1");
 const groups=t.parsePrescriptionJson(JSON.stringify(example)).groups;
 assert.equal(groups.length,2);
 assert(groups.some(g=>g.items.some(i=>i.unit==="g"&&i.amount===0.3333)));
 const prompt=t.prescriptionChatRequest();
 for(const phrase of ["첨부한","약봉투","JSON","timesPerDay","days","0.3333g","반올림","복용","확인 필요"])
  assert(prompt.includes(phrase),"missing in request: "+phrase);
 assert(prompt.includes(String.fromCharCode(96).repeat(3)+"json")&&prompt.includes("yuha-prescription-import/v1"),
  "prompt contains fenced valid example");
 let copied="";
 e.window.navigator={clipboard:{writeText:async(value)=>{copied=value}}};
 const episode={id:"iprompt_case1",title:"발열",onsetAt:"2026-11-14T00:00:00.000Z",
  status:"active",visits:[],medications:[],medicationGroups:[],temperatures:[]};
 storage.set("yuha_illness_records_v1",JSON.stringify({[episode.id]:episode}));
 e.window.YuhaIllness.render();
 assert(e.root.innerHTML.includes("다른 채팅용 요청문 복사"));
 assert(e.root.innerHTML.includes("예시 JSON 복사"));
 const click=act=>{
  const button={dataset:{act},closest(){return this}};
  e.root.handlers.click({target:{closest:()=>button}});
 };
 click("copy-prescription-request");
 assert(copied.includes("첨부한")&&copied.includes("bundleTemplates"));
 click("copy-prescription-example");
 assert.equal(JSON.stringify(JSON.parse(copied)),JSON.stringify(example));
 assert.equal(e.model.cases[episode.id].medicationGroups.length,0,
  "copying must not mutate existing illness records");
 console.log("PASS illness: cross-chat prompt and example JSON copy with no data modifications");
})();


(function testDailyMedicationSummaryCombinesBundlesAndOlderDoses(){
 const e=setup(),t=e.test;
 const c=t.normalize({id:"itimeline_01",title:"발열",onsetAt:"2026-11-14T00:00:00.000Z",
  medicationGroups:[
   {id:"igroup_01",name:"아침 약",active:true,mode:"scheduled",intervalHours:8,
    items:[{id:"idrug_01",name:"해열 시럽",amount:4,unit:"mL"}],
    events:[
     {id:"ievent_01",at:"2026-11-14T09:00:00.000Z",status:"taken",
      items:[{id:"idrug_01",name:"해열 시럽",amount:3,unit:"mL"}],note:"복용"},
     {id:"ievent_02",at:"2026-11-14T18:00:00.000Z",status:"skipped",items:[],note:"외출"}]},
   {id:"igroup_02",name:"삭제 묶음",active:false,
    deletedAt:"2026-11-14T19:00:00.000Z",mode:"prn",
    items:[{id:"idrug_02",name:"삭제된 약",amount:1,unit:"포"}],
    events:[{id:"ievent_arch_01",at:"2026-11-14T08:00:00.000Z",status:"taken",
     items:[{id:"idrug_02",name:"삭제된 약",amount:1,unit:"포"}]}]}
  ],
  medications:[{id:"imed_old",name:"이전 처방",doseMl:2,mode:"scheduled",intervalHours:8,
   active:false,doses:[{id:"idose_old",at:"2026-11-14T12:00:00.000Z",status:"taken",amountMl:2}]}]
 });
 const day=new Date("2026-11-14T12:00:00.000Z");
 const dKey=[day.getFullYear(),String(day.getMonth()+1).padStart(2,"0"),String(day.getDate()).padStart(2,"0")].join("-");
 const records=t.dailyMedicationEvents(c,dKey);
 assert.equal(records.length,3,"1 missed + 1 completed grouped + 1 old standalone; deleted excluded");
 assert.equal(records[0].status,"skipped");
 assert.equal(records[1].legacy,true,"older individual med is part of main timeline");
 assert.equal(records[2].items[0].amount,3,
  "actual administration snapshot is used, never today's amended 4 mL prescription");
 assert(!records.some(e=>e.name==="삭제 묶음"));
 const archive=t.dailyMedicationEvents(c,dKey,{includeDeleted:true});
 assert.equal(archive.length,4,"archived doses are preserved for restore");
 assert(archive.some(e=>e.deleted&&e.name==="삭제 묶음"));
 console.log("PASS illness: medication timeline merges group and legacy doses, skips archived, retains historical amounts");
})();
(function testVisibleMedicationTimelineAndArchiveRecovery(){
 storage.clear();
 const id="iarchive_test",now="2026-11-14T09:30:00.000Z",groupId="igroup_save";
 const initial={id,title:"진료",onsetAt:"2026-11-14T00:00:00.000Z",
  status:"active",visits:[],medications:[],temperatures:[],medicationGroups:[
   {id:groupId,name:"복용 묶음 A",mode:"scheduled",intervalHours:8,active:true,
    items:[{id:"imed_a",name:"약 A",amount:3,unit:"mL"}],
    events:[{id:"ievent_a",at:now,status:"taken",items:[
     {id:"imed_a",name:"약 A",amount:2.5,unit:"mL"}]}]}
  ]};
 storage.set("yuha_illness_records_v1",JSON.stringify({[id]:initial}));
 const e=setup();e.window.YuhaIllness.render();
 const get=()=>e.model.cases[id];
 assert(e.root.innerHTML.includes("복용 내역 · 시간별 서머리"),
  "summary must be visible without opening any medicine-group details");
 assert(e.root.innerHTML.includes('data-form="group-dose"'),
  "summary contains a direct dose entry form");
 assert(e.root.innerHTML.includes("복용 기록 저장"));
 assert(e.root.innerHTML.includes('data-act="delete-group"'));
 let prompts=[];
 e.window.confirm=message=>{prompts.push(message);return false;};
 const press=(act,recordId)=>{
  const button={dataset:{act,id:recordId},closest(){return this}};
  e.root.handlers.click({target:{closest:()=>button}});
 };
 press("delete-group",groupId);
 assert.equal(get().medicationGroups[0].deletedAt,"");
 assert.equal(get().medicationGroups[0].events.length,1);
 e.window.confirm=message=>{prompts.push(message);return true;};
 press("delete-group",groupId);
 assert(get().medicationGroups[0].deletedAt,"deletedAt must be recorded as a tombstone");
 assert.equal(get().medicationGroups[0].active,false);
 assert.equal(get().medicationGroups[0].events[0].items[0].amount,2.5,
  "deleting the bundle must not discard the dose record");
 assert(e.root.innerHTML.includes("삭제한 묶음 1개 · 복원 가능"));
 assert(!e.root.innerHTML.includes('data-act="take-group" data-id="'+groupId+'"'));
 assert(e.root.innerHTML.includes('data-act="restore-group"'));
 assert(JSON.parse(storage.get("yuha_illness_pending_v1"))[id].episode.medicationGroups[0].deletedAt,
  "archive tombstone is queued for server sync, not dropped");
 const saved=JSON.parse(storage.get("yuha_illness_records_v1"))[id];
 assert.equal(saved.medicationGroups[0].events.length,1);
 press("restore-group",groupId);
 assert.equal(get().medicationGroups[0].deletedAt,"");
 assert.equal(get().medicationGroups[0].active,false,
  "restoring should not resume medication automatically");
 assert.equal(get().medicationGroups[0].events.length,1);
 assert(prompts.some(p=>p.includes("복용 이력 1건은 원본에 보관")));
 console.log("PASS illness: timeline is prominent, delete is reversible and archives doses without auto-resuming therapy");
})();


(function testXmlButtonSnapshotsLocalAndPendingWithoutMutations(){
 storage.clear();
 const e=setup();
 const episode={id:"iillness_xml",title:"발열",onsetAt:"2026-11-14T06:00:00.000Z",
  visits:[],medications:[],medicationGroups:[],
  temperatures:[{id:"itemp1",at:"2026-11-14T07:30:00.000Z",celsius:38.5}]};
 storage.set("yuha_illness_records_v1",JSON.stringify({[episode.id]:episode}));
 storage.set("yuha_illness_pending_v1",JSON.stringify({
  [episode.id]:{episode,expectedRevision:"old-version"}
 }));
 let options;
 e.window.YuhaHistoryExport={open:args=>{options=args}};
 e.window.YuhaIllness.render();
 assert(e.root.innerHTML.includes('data-act="export-illness-xml"'));
 const button={dataset:{act:"export-illness-xml"},closest(){return this}};
 e.root.handlers.click({target:{closest:()=>button}});
 assert(options&&options.kind==="illness");
 assert.equal(typeof options.fetchIllness,"function");
 const device=options.localIllness();
 assert.equal(device.cases[episode.id].temperatures[0].celsius,38.5);
 assert.equal(device.pending[episode.id].expectedRevision,"old-version");
 device.cases[episode.id].temperatures[0].celsius=42;
 assert.equal(e.model.cases[episode.id].temperatures[0].celsius,38.5,
  "export source must be a detached snapshot, never mutate real measurements");
 assert.equal(JSON.parse(storage.get("yuha_illness_records_v1"))[episode.id].temperatures[0].celsius,38.5);
 console.log("PASS illness UI: XML button snapshots measurements and pending without any write");
})();


(function testHistoryEditorsAndHospitalHeatmapWorkflow(){
 storage.clear();
 const illnessId="ihistory_editor",groupId="igroup_editor";
 const episode={id:illnessId,title:"감기",onsetAt:"2026-11-14T00:00:00.000Z",
  status:"active",closedAt:"",visits:[{id:"ivisit1",at:"2026-11-14T01:30:00.000Z",
   hospital:"테스트 소아과",diagnosis:"감기",notes:"처방"}],
  temperatures:[{id:"itemp1",at:"2026-11-14T02:00:00.000Z",celsius:38.5,site:"ear",note:"이전 측정"}],
  medications:[{id:"imed1",name:"기존 시럽",doseMl:2.5,active:true,mode:"scheduled",intervalHours:8,
   doses:[{id:"idose1",at:"2026-11-14T05:00:00.000Z",status:"taken",amountMl:2.5,note:"이전 약"}]}],
  medicationGroups:[{id:groupId,name:"1일 3회 4일",active:true,mode:"scheduled",intervalHours:8,
   timesPerDay:3,days:4,items:[
    {id:"iitem1",name:"항생제 A",amount:3,unit:"mL"},
    {id:"iitem2",name:"씨투스",amount:0.3333,unit:"g"}
   ],events:[{id:"ievent1",at:"2026-11-14T04:00:00.000Z",status:"taken",note:"아침",
    items:[{id:"iitem1",name:"항생제 A",amount:2.5,unit:"mL"},
     {id:"iitem2",name:"씨투스",amount:0.3333,unit:"g"}]}]}]
 };
 storage.set("yuha_illness_records_v1",JSON.stringify({[illnessId]:episode}));
 const e=setup(),c=()=>e.model.cases[illnessId];
 e.window.YuhaIllness.render();
 const navigate=day=>{
  const button={dataset:{act:"temp-day",day},closest(){return this}};
  e.root.handlers.click({target:{closest:()=>button}});
 };
 navigate("2026-11-14");
 const html=e.root.innerHTML;
 assert(html.includes('aria-label="2026-11-14 · 38.5도 · 병원 방문 1회"'),
  "visit marker must be present on fever calendar cell");
 assert(html.includes("🏥"),"clinic marker must render");
 assert(html.includes("복용 내역 · 시간별 서머리"));
 const f=html.indexOf("체온 · 열 히트맵"),t=html.indexOf("체온 입력"),
  h=html.indexOf("복용 내역 · 시간별 서머리"),d=html.indexOf("약 복용 입력"),
  j=html.indexOf("처방 등록 · JSON / 직접 입력"),l=html.indexOf("등록한 약 리스트"),
  m=html.indexOf("질병 관리");
 assert(f>=0&&f<t&&t<h&&h<d&&d<j&&j<l&&l<m,
  "strict user-specified block order");
 assert(html.includes("항생제 A 3mL · 씨투스 0.3333g"),
  "dose selector must display medicine names and exact quantities, not only a frequency label");
 assert(!html.includes('data-act="take-group"'),
  "group details must no longer have duplicate one-touch dose button");
 assert(html.includes('name="prescriptionJson"'));
 assert(!html.includes('class="ill-import-details"'),"JSON textarea must always be exposed");
 assert(html.includes('data-form="group"'),"manual entry is visible in same prescription card");
 assert(html.includes('data-act="edit-temp"'));
 assert(html.includes('data-act="edit-dose"'));
 assert(html.includes('data-act="edit-visit"'));
 const click=(act,id,extra={})=>{
  const btn={dataset:{act,id,...extra},closest(){return this}};
  e.root.handlers.click({target:{closest:()=>btn}});
 };
 const submit=(type,values)=>{
  const form={dataset:{form:type},values};
  e.root.handlers.submit({preventDefault(){},target:{closest:()=>form}});
 };
 click("edit-temp","itemp1");
 assert(e.root.innerHTML.includes('data-form="edit-temp"'));
 submit("edit-temp",{editId:"itemp1",at:"2026-11-14T10:45",celsius:"390",site:"forehead",note:"시간 변경"});
 assert.equal(c().temperatures.length,1);
 assert.equal(c().temperatures[0].id,"itemp1");
 assert.equal(c().temperatures[0].celsius,39);
 assert.equal(c().temperatures[0].site,"forehead");
 assert.equal(c().temperatures[0].note,"시간 변경");
 click("edit-dose","ievent1",{group:groupId});
 assert(e.root.innerHTML.includes('data-form="edit-dose"'));
 submit("edit-dose",{editId:"ievent1",groupId,legacy:"no",at:"2026-11-14T13:20",
  status:"taken",note:"실제 오후 복용",doseDrugId:["iitem1","iitem2"],
  doseDrugName:["항생제 A","씨투스"],doseDrugUnit:["mL","g"],doseDrugAmount:["3.25","0.3333"]});
 const actual=c().medicationGroups[0].events;
 assert.equal(actual.length,1,"editing a dose must not append another event");
 assert.equal(actual[0].id,"ievent1");
 assert.equal(actual[0].items[0].amount,3.25);
 assert.equal(actual[0].items[1].amount,0.3333);
 assert.equal(actual[0].note,"실제 오후 복용");
 click("edit-dose","idose1",{med:"imed1"});
 submit("edit-dose",{editId:"idose1",groupId:"imed1",legacy:"yes",at:"2026-11-14T15:40",
  status:"taken",actualAmountMl:"2.25",note:"기존 시럽 실제량"});
 assert.equal(c().medications[0].doses.length,1);
 assert.equal(c().medications[0].doses[0].amountMl,2.25);
 click("edit-visit","ivisit1");
 assert(e.root.innerHTML.includes('data-form="visit"'));
 submit("visit",{editId:"ivisit1",hospital:"병원 수정",at:"2026-11-14T10:30",
  diagnosis:"열 확인",notes:"재진"});
 assert.equal(c().visits.length,1);
 assert.equal(c().visits[0].hospital,"병원 수정");
 assert(c().visits[0].at.endsWith("Z"));
 // Explicit closure archives current prescription status, NOT their actual doses.
 submit("close",{recovered:"on",done:"on",note:"치료 완료 확인"});
 assert.equal(c().status,"closed");
 assert.equal(c().medicationGroups[0].active,false);
 assert.equal(c().medications[0].active,false);
 assert.equal(c().medicationGroups[0].events[0].items[0].amount,3.25);
 assert.equal(c().medications[0].doses[0].amountMl,2.25);
 assert(e.root.innerHTML.includes("완치 처리됨")&&e.root.innerHTML.includes("완치 해제"));
 // Correct historical data without reopening the illness or restarting medicines.
 click("edit-temp","itemp1");
 submit("edit-temp",{editId:"itemp1",at:"2026-11-14T10:45",
  celsius:"38.8",site:"ear",note:"완치 후 확인 수정"});
 assert.equal(c().status,"closed");
 assert.equal(c().temperatures[0].celsius,38.8);
 assert.equal(c().medicationGroups[0].active,false);
 const saved=JSON.parse(storage.get("yuha_illness_records_v1"))[illnessId];
 assert.equal(saved.temperatures.length,1);
 assert.equal(saved.medicationGroups[0].events.length,1);
 assert.equal(saved.visits.length,1);
 console.log("PASS illness: calendar clinic badge, collapsed group manager, medicine-name selector, in-place edits and closure archival");
})();
(function testPcWheelNavigationHasOverflowGuard(){
 const html=fs.readFileSync("index.html","utf8");
 const source=html.match(/    function renderTabs\(\) \{[\s\S]*?^    \}/m);
 assert(source,"tab navigation handler should exist");
 const tabs={dataset:{},scrollLeft:0,scrollWidth:800,clientWidth:300,
  innerHTML:"",listeners:{},addEventListener(name,fn){this.listeners[name]=fn}};
 const document={getElementById(id){assert.equal(id,"tabs");return tabs}};
 const fn=vm.runInNewContext("("+source[0].replace("function renderTabs()","function()")+")",
  {document,tabOrder:[],currentTab:"illness",data:{},TAB_ICONS:{},window:{},render(){}});
 fn();
 assert.equal(typeof tabs.listeners.wheel,"function");
 let prevented=0;
 tabs.listeners.wheel({deltaY:90,deltaX:0,ctrlKey:false,metaKey:false,
  preventDefault(){prevented++}});
 assert.equal(tabs.scrollLeft,90);
 assert.equal(prevented,1);
 tabs.scrollWidth=300;
 tabs.listeners.wheel({deltaY:90,deltaX:0,ctrlKey:false,metaKey:false,
  preventDefault(){prevented++}});
 assert.equal(tabs.scrollLeft,90,"when all tabs fit, normal vertical scrolling remains");
 assert.equal(prevented,1);
 tabs.scrollWidth=800;
 tabs.listeners.wheel({deltaY:90,deltaX:0,ctrlKey:true,metaKey:false,
  preventDefault(){prevented++}});
 assert.equal(prevented,1,"Ctrl+wheel browser zoom is untouched");
 console.log("PASS tabs: desktop wheel navigates overflowing header horizontally only");
})();

(function testBalancedMedicineBundleActions(){
 storage.clear();
 const episodeId="ibundle_layout_1",groupId="igroup_layout_1";
 const episode={id:episodeId,title:"감기",onsetAt:"2026-11-14T00:00:00.000Z",
  status:"active",visits:[],temperatures:[],medications:[],
  medicationGroups:[{id:groupId,name:"항생제 묶음",mode:"scheduled",active:true,intervalHours:null,
   timesPerDay:2,days:4,items:[{id:"i1",name:"시럽",amount:3,unit:"mL"}],events:[]}]};
 storage.set("yuha_illness_records_v1",JSON.stringify({[episodeId]:episode}));
 const e=setup();
 e.window.YuhaIllness.render();
 const begin=e.root.innerHTML.indexOf('<div class="ill-group-actions"');
 const end=e.root.innerHTML.indexOf("</div></div>",begin);
 assert(begin>=0&&end>begin,"medicine actions must consist of two dedicated rows");
 const html=e.root.innerHTML.slice(begin,end+12),labels=["약·용량 수정","묶음 복사","복용 종료","묶음 삭제"];
 let last=-1;
 for(const label of labels){
  const i=html.indexOf(label);
  assert(i>last,"expected visible action order: "+label);
  last=i;
 }
 assert.equal((html.match(/class="ill-group-action-row/g)||[]).length,2,
  "edit/copy and lifecycle/delete must each have their own balanced row");
 assert(!html.includes('data-act="take-group"'),"dose taking belongs in the daily medication timeline");
 const css=fs.readFileSync("illness-care.css","utf8");
 assert(css.includes(".ill-group-action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))"),
  "both rows use equal-width columns");
 assert(css.includes(".ill-group-actions .ill-text-danger{grid-column:auto"),
  "delete must not span a whole row");
 const c=e.model.cases[episodeId];
 c.status="closed";c.medicationGroups[0].active=false;
 e.window.YuhaIllness.render();
 assert(!e.root.innerHTML.includes('data-act="delete-group"'),
  "closed illness must not present unclickable bundle-management actions");
 console.log("PASS illness: tidy two-row medicine actions and no dead controls on closed illnesses");
})();

(function testQuickActionFirstAndLegacyMedicineWorkflow(){
 storage.clear();
 const id="iquick_action_uxtest",groupId="igroup_quick_uxtest";
 const c={id,title:"감기",status:"active",onsetAt:"2026-11-14T07:00:00.000Z",
  visits:[],temperatures:[],
  medications:[{id:"imed_legacy_quick",name:"기존 개별 시럽",doseMl:2.25,mode:"scheduled",
   intervalHours:8,active:true,doses:[]}],
  medicationGroups:[{id:groupId,name:"하루 3회 · 4일",mode:"scheduled",active:true,
   intervalHours:8,timesPerDay:3,days:4,
   items:[{id:"im1",name:"시럽 A",amount:3.25,unit:"mL"},
    {id:"im2",name:"가루 B",amount:0.3333,unit:"g"}],events:[]}]};
 storage.set("yuha_illness_records_v1",JSON.stringify({[id]:c}));
 const e=setup(),get=()=>e.model.cases[id];
 e.window.YuhaIllness.render();
 let html=e.root.innerHTML;
 const f=html.indexOf("체온 · 열 히트맵"),t=html.indexOf("체온 입력"),
  h=html.indexOf("복용 내역 · 시간별 서머리"),d=html.indexOf("약 복용 입력"),
  j=html.indexOf("처방 등록 · JSON / 직접 입력"),l=html.indexOf("등록한 약 리스트"),
  m=html.indexOf("질병 관리");
 assert(f>=0&&f<t&&t<h&&h<d&&d<j&&j<l&&l<m,
  "heatmap, fever input, dosing history, dosing input, JSON/manual, medicines, disease");
 assert(html.includes('name="prescriptionJson"'));
 assert(!html.includes('class="ill-import-details"'));
 assert(html.includes('data-form="group"'));
 assert.equal((html.match(/data-form="temp"/g)||[]).length,1,"one single fever entry form");
 assert.equal((html.match(/data-form="group-dose"/g)||[]).length,1,"one single medication entry form");
 assert.equal((html.match(/data-form="dose"/g)||[]).length,0,
  "old individual prescription must not create a second hidden administration form");
 assert(html.includes("이전 개별 처방 1건 (기록 보존)"));
 assert(!html.includes("과거 복용 기록 확인 ·"),
  "bundle cards may not duplicate the daily actual-administration history");
 assert(html.includes("복용 내역 · 시간별 서머리"));
 assert(html.includes('data-drugs="시럽 A 3.25mL · 가루 B 0.3333g"'),
  "full selected regimen is available even if option label is shortened");
 assert(html.includes('data-act="dose-time-now"'),
  "a stale prefilled timestamp can be refreshed with one tap");
 assert(html.includes('value="legacy:imed_legacy_quick"'),
  "previously saved individual medicines can be recorded from the primary form");
 assert(html.indexOf("XML 기록 추출")>html.indexOf("복용 내역 · 시간별 서머리"),
  "infrequently used XML control belongs in utilities, not above daily actions");
 const preview={textContent:""};
 const select={name:"groupId",selectedOptions:[{dataset:{drugs:"기존 개별 시럽 2.25mL"}}],
  closest(){return {querySelector:()=>preview}}};
 e.root.handlers.change({target:select});
 assert.equal(preview.textContent,"기존 개별 시럽 2.25mL");
 const actualTime={value:"2000-01-01T00:00"};
 const nowButton={dataset:{act:"dose-time-now"},closest(selector){
  return selector==="form"?{querySelector:()=>actualTime}:this;
 }};
 e.root.handlers.click({target:{closest:()=>nowButton}});
 assert.match(actualTime.value,/^20\d\d-\d\d-\d\dT\d\d:\d\d$/,
  "now control must replace the old time with a fresh local timestamp");
 assert.notEqual(actualTime.value,"2000-01-01T00:00");
 const submit=(type,values)=>{
  const form={dataset:{form:type},values};
  e.root.handlers.submit({preventDefault(){},target:{closest:()=>form}});
 };
 submit("temp",{at:"2026-11-14T11:20",celsius:"385",site:"ear",note:"기록"});
 assert.equal(get().temperatures[0].celsius,38.5);
 assert(e.root.innerHTML.includes("체온 38.5℃를 기기에 저장했습니다."),
  "successful local recording must show immediate feedback outside collapsed tools");
 submit("group-dose",{groupId,at:"2026-11-14T11:30",status:"taken",note:"약 두 종류"});
 assert.equal(get().medicationGroups[0].events.length,1);
 assert.equal(get().medicationGroups[0].events[0].items[1].amount,0.3333);
 assert(e.root.innerHTML.includes("약 2종의 복용 시각을 기기에 저장했습니다."));
 submit("group-dose",{groupId:"legacy:imed_legacy_quick",at:"2026-11-14T12:00",
  status:"taken",note:"옛 처방"});
 assert.equal(get().medications[0].doses.length,1);
 assert.equal(get().medications[0].doses[0].amountMl,2.25);
 assert(e.root.innerHTML.includes("개별 약 복용 기록을 기기에 저장했습니다."));
 assert.equal(get().medicationGroups[0].events.length,1);
 console.log("PASS illness UX: single top quick-entry, inline dose preview, legacy medicine and visible local-save confirmation");
})();
(function testCureReversalAndRegisteredMedList(){
 storage.clear();
 const id="imanager_persistence",episode={
  id,title:"열",status:"active",onsetAt:"2026-11-14T07:00:00.000Z",
  visits:[],temperatures:[],medications:[],medicationGroups:[{id:"igroup_demo",
   name:"이전 묶음",active:true,mode:"scheduled",intervalHours:8,
   items:[{id:"id_1",name:"해열 시럽",amount:2,unit:"mL"}],events:[]}]
 };
 storage.set("yuha_illness_records_v1",JSON.stringify({[id]:episode}));
 const e=setup();e.window.YuhaIllness.render();
 assert(e.root.innerHTML.includes("처방 등록 · JSON / 직접 입력"));
 assert(e.root.innerHTML.includes("등록한 약 리스트"));
 assert(e.root.innerHTML.includes("질병 관리"));
 e.model.cases[id].status="closed";
 e.model.cases[id].medicationGroups[0].active=false;
 e.window.YuhaIllness.render();
 assert(e.root.innerHTML.includes("해열 시럽 2mL"));
 assert(e.root.innerHTML.includes('data-act="reopen"'));
 assert(!e.root.innerHTML.includes('data-form="temp"'));
 assert(!e.root.innerHTML.includes('data-form="group-dose"'));
 assert(!e.root.innerHTML.includes('data-form="group"'));
 const btn={dataset:{act:"reopen"},closest(){return this}};
 e.root.handlers.click({target:{closest:()=>btn}});
 assert.equal(e.model.cases[id].status,"active");
 assert.equal(e.model.cases[id].medicationGroups[0].active,false);
 console.log("PASS illness UX: disease manager handles cure reversal and retains prescriptions");
})();
