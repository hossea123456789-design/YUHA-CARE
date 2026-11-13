'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('illness-care.js','utf8');
const storage=new Map();
const locals={
 getItem:key=>storage.get(key)||null,
 setItem:(key,value)=>storage.set(key,String(value)),
 removeItem:key=>storage.delete(key)
};
function setup(){
 const root={dataset:{},innerHTML:'',handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},
  querySelector(){return null;},querySelectorAll(){return []}};
 const window={confirm:()=>true,addEventListener(){},prompt:()=>null};
 const context={window,document:{getElementById:id=>id==='main'?root:null},
  localStorage:locals,crypto:require('node:crypto').webcrypto,
  setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,
  FormData:class{constructor(form){this.values=form.values||{}}get(key){return this.values[key]??null}},
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
 for(const label of ['새 질병 시작','병원 방문','처방약','복용 기록','체온 기록','히트맵','질병 종료'])assert(e2.root.innerHTML.includes(label),label);
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
 // Finishing is not automatic; active prescriptions block a closure.
 submit('close',{recovered:'on',done:'on',note:'회복됨'});
 assert.equal(get().status,'active');
 const button={dataset:{act:'end-med',id:med.id},closest(){return this}};
 e.root.handlers.click({target:{closest:()=>button}});
 assert.equal(get().medications[0].active,false);
 submit('close',{recovered:'on',done:'on',note:'회복됨'});
 assert.equal(get().status,'closed');
 assert.equal(get().recoveryConfirmed,true);
 assert.equal(get().noFurtherMedicationConfirmed,true);
 assert(Object.keys(JSON.parse(storage.get('yuha_illness_pending_v1'))).length===1);
 assert(JSON.parse(storage.get('yuha_illness_records_v1'))[id]);
 console.log('PASS illness: real form submissions cover episode→clinic→prescription→dose→temperature→explicit closure');
})();
