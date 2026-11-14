'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const code=fs.readFileSync('apps-script/Code.gs','utf8');
function fakeSheet(name){
 return {name,rows:[],
  getLastRow(){return this.rows.length},
  setFrozenRows(){},
  getRange(row,col,nrows=1,ncols=1){
   const sh=this;
   return {
    setValues(vals){
     for(let i=0;i<vals.length;i++){
      while(sh.rows.length<row+i)sh.rows.push([]);
      for(let j=0;j<vals[i].length;j++)sh.rows[row+i-1][col+j-1]=vals[i][j];
     }return this;
    },
    getValues(){return Array.from({length:nrows},(_,i)=>
     Array.from({length:ncols},(_,j)=>sh.rows[row+i-1]?.[col+j-1]??''));},
    setFontWeight(){return this},setBackground(){return this},
    setNumberFormat(){return this}
   };
  },
  appendRow(row){this.rows.push([...row]);return this}
 };
}
function setup(){
 const tabs=new Map();
 tabs.set('CHECKLIST_DB',fakeSheet('CHECKLIST_DB'));
 tabs.set('SLEEP_LOG',fakeSheet('SLEEP_LOG'));
 tabs.set('MENTAL_LOG',fakeSheet('MENTAL_LOG'));
 for(const t of tabs.values())t.rows.push(['unrelated existing record']);
 const ss={getSheetByName:n=>tabs.get(n)||null,
  insertSheet:n=>{const t=fakeSheet(n);tabs.set(n,t);return t}};
 const context=vm.createContext({
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush:()=>{}},
  PropertiesService:{getScriptProperties:()=>{throw Error('ILLNESS_LOG must not require a separate credential')}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
   computeDigest:(_alg,value)=>[...crypto.createHash('sha256').update(String(value)).digest()].map(v=>v>127?v-256:v),
   getUuid:()=>crypto.randomUUID()},
  console,Date,JSON,Array,Object
 });
 vm.runInContext(code,context,{filename:'Code.gs'});
 const fn=name=>vm.runInContext(name,context);
 return {tabs,fn};
}
function entry(){
 return {id:'iepisode01',title:'기침·발열',onsetAt:'2026-11-14T00:00:00.000Z',
  symptoms:'콧물',note:'경과 확인',status:'active',closedAt:'',
  recoveryConfirmed:false,noFurtherMedicationConfirmed:false,closureNote:'',
  visits:[{id:'ivisit01',at:'2026-11-14T03:00:00.000Z',
   hospital:'가상병원',diagnosis:'검사 필요',notes:'안내 받은 내용'}],
  medications:[{id:'imed01',visitId:'ivisit01',category:'other',name:'처방 시럽',
   ingredient:'성분 확인',formulation:'10 mg/5mL',mode:'scheduled',
   doseMl:2.5,intervalHours:8,endsAt:'',instructions:'8시간마다 2.5mL',
   active:true,doses:[{id:'idose01',at:'2026-11-14T03:30:00.000Z',
    status:'taken',amountMl:2.5,note:'',scheduledFor:''}]}],
  temperatures:[{id:'itemp01',at:'2026-11-14T04:00:00.000Z',
   celsius:38.3,site:'ear',note:'측정'}]};
}
(function testSharedAppReadAndWrite(){
 const e=setup();
 assert.equal(e.tabs.has('ILLNESS_LOG'),false,'empty journal does not exist before first read');
 const first=e.fn('getIllnessCases')();
 assert.equal(first.schemaVersion,3);assert.equal(Object.keys(first.cases).length,0);
 const original=entry();
 const saved=e.fn('syncIllnessCase')({episode:original,expectedRevision:''});
 assert.equal(saved.ok,true);
 const read=e.fn('getIllnessCases')();
 assert.equal(read.cases[original.id].medications[0].doseMl,2.5);
 assert.equal(read.cases[original.id].medications[0].intervalHours,8);
 assert.equal(read.cases[original.id].medications[0].doses[0].amountMl,2.5);
 assert.equal(read.cases[original.id].temperatures[0].celsius,38.3);
 assert.equal(read.cases[original.id].visits[0].diagnosis,'검사 필요');
 assert.equal(read.cases[original.id].revision,saved.revision);
 for(const name of ['CHECKLIST_DB','SLEEP_LOG','MENTAL_LOG'])
  assert.deepEqual(e.tabs.get(name).rows,[['unrelated existing record']]);
 console.log('PASS illness API: existing app connection without extra password, medication and vitals roundtrip, unrelated data untouched');
})();
(function testRevisionMismatchCannotOverwrite(){
 const e=setup();const original=entry();
 const saved=e.fn('syncIllnessCase')({episode:original,expectedRevision:''});
 const newer=structuredClone(original);newer.title='수정된 기록';
 const bad=e.fn('syncIllnessCase')({episode:newer,expectedRevision:'stale'});
 assert.equal(bad.conflict,true);
 const state=e.fn('getIllnessCases')().cases[original.id];
 assert.equal(state.title,original.title);assert.equal(state.revision,saved.revision);
 assert.equal(e.tabs.has('ILLNESS_CONFLICT_ARCHIVE'),false);
 console.log('PASS illness API: stale version rejected with originals untouched');
})();
(function testExplicitResolutionArchivesBeforeOverwrite(){
 const e=setup();const first=entry();
 const v1=e.fn('syncIllnessCase')({episode:first,expectedRevision:''});
 const revised=structuredClone(first);revised.note='기기에서 수정한 원본';
 const reply=e.fn('syncIllnessCase')({episode:revised,expectedRevision:v1.revision,
  resolution:{confirmed:true,serverRevision:v1.revision,localOriginal:revised}});
 assert.equal(reply.ok,true);assert.equal(reply.conflictArchived,true);
 const archive=e.tabs.get('ILLNESS_CONFLICT_ARCHIVE');
 assert.equal(archive.rows.length,2);
 const a=JSON.parse(archive.rows[1][3]),b=JSON.parse(archive.rows[1][4]);
 assert.equal(a.note,'경과 확인');assert.equal(b.note,'기기에서 수정한 원본');
 assert.equal(e.fn('getIllnessCases')().cases[first.id].note,'기기에서 수정한 원본');
 console.log('PASS illness API: explicit conflict resolution archives both originals before modifying row');
})();
(function testCannotInferMissingPrescription(){
 const e=setup(),raw=entry();raw.medications[0].intervalHours=null;
 assert.throws(()=>e.fn('illnessValidateEpisode_')(raw),/간격/);
 raw.medications[0].intervalHours=8;raw.medications[0].doseMl=null;
 assert.throws(()=>e.fn('illnessValidateEpisode_')(raw),/범위/);
 raw.medications[0].doseMl=2.5;raw.temperatures[0].celsius=44;
 assert.throws(()=>e.fn('illnessValidateEpisode_')(raw),/범위/);
 raw.temperatures[0].celsius=36.7;
 const clean=e.fn('illnessValidateEpisode_')(raw);
 assert.equal(clean.status,'active','normal temperature may not end treatment');
 console.log('PASS illness API: no inferred dose or interval and no auto-close after normal temperature');
})();

(function testMedicationBundlesWithLegacyPreservation(){
 const e=setup(),raw=entry();
 const items=[
  {id:'idrug01',name:'약 A',amount:2.5,unit:'mL'},
  {id:'idrug02',name:'약 B',amount:1,unit:'포'}
 ];
 raw.medicationGroups=[{
  id:'ibundle01',name:'아침 저녁 묶음',visitId:'ivisit01',
  mode:'scheduled',intervalHours:8,endsAt:'',active:true,items,
  events:[{id:'ievent01',at:'2026-11-14T05:00:00.000Z',
   status:'taken',note:'전부 복용',scheduledFor:'',items:structuredClone(items)}]
 }];
 const saved=e.fn('syncIllnessCase')({episode:raw,expectedRevision:''});
 assert.equal(saved.ok,true);
 let r=e.fn('getIllnessCases')().cases[raw.id];
 assert.equal(r.medications.length,1,'legacy medicines must remain');
 assert.equal(r.medicationGroups.length,1,'bundled medicine should roundtrip');
 assert.equal(r.medicationGroups[0].items.length,2);
 assert.equal(r.medicationGroups[0].events[0].items[0].amount,2.5);
 const changed=structuredClone(raw);
 changed.medicationGroups[0].items[0].amount=3;
 const done=e.fn('syncIllnessCase')({episode:changed,expectedRevision:saved.revision});
 assert.equal(done.ok,true);
 r=e.fn('getIllnessCases')().cases[raw.id];
 assert.equal(r.medicationGroups[0].items[0].amount,3);
 assert.equal(r.medicationGroups[0].events[0].items[0].amount,2.5,
  'past actual amount must remain unchanged');
 assert.equal(r.medications[0].doses[0].amountMl,2.5);
 const invalid=structuredClone(changed);
 invalid.medicationGroups[0].intervalHours=null;
 assert.throws(()=>e.fn('illnessValidateEpisode_')(invalid),/간격/);
 invalid.medicationGroups[0].intervalHours=8;
 invalid.medicationGroups[0].items[0].amount=250;
 assert.throws(()=>e.fn('illnessValidateEpisode_')(invalid),/범위/);
 invalid.medicationGroups[0].items[0].amount=3;
 invalid.medicationGroups[0].items.push({...invalid.medicationGroups[0].items[0]});
 assert.throws(()=>e.fn('illnessValidateEpisode_')(invalid),/중복/);
 console.log('PASS illness API: two-item bundle sync, immutable dose snapshot, backward compatibility and validation');
})();

(function testGramAndFrequencyImportBackend(){
 const e=setup(),raw=entry();
 raw.medicationGroups=[{
  id:"igrambundle01",name:"3회/일 · 4일",mode:"scheduled",intervalHours:null,
  timesPerDay:3,days:4,sourceDate:"2026-11-14",sourceKind:"prescription-json",
  visitId:"",endsAt:"",active:true,
  items:[{id:"igram01",name:"건조 시럽",amount:0.3333,unit:"g"},
   {id:"itablet01",name:"정제",amount:0.25,unit:"정"}],events:[]
 }];
 const created=e.fn("syncIllnessCase")({episode:raw,expectedRevision:""});
 assert.equal(created.ok,true);
 const recovered=e.fn("getIllnessCases")();
 assert.equal(recovered.schemaVersion,3);
 const g=recovered.cases[raw.id].medicationGroups[0];
 assert.equal(g.intervalHours,null,"timesPerDay must not become inferred 8h");
 assert.equal(g.timesPerDay,3);
 assert.equal(g.days,4);
 assert.equal(g.sourceDate,"2026-11-14");
 assert.equal(g.items[0].amount,0.3333);
 assert.equal(g.items[1].amount,0.25);
 const invalid=structuredClone(raw);
 invalid.medicationGroups[0].items[1].amount=0.251;
 assert.throws(()=>e.fn("illnessValidateEpisode_")(invalid),/소수 둘째/);
 invalid.medicationGroups[0].items[1].amount=0.25;
 invalid.medicationGroups[0].items[0].amount=0.33333;
 assert.throws(()=>e.fn("illnessValidateEpisode_")(invalid),/소수 넷째/);
 assert.equal(e.tabs.has("SLEEP_LOG"),true);
 console.log("PASS illness API: schema v3 exact 0.3333g and 0.25 tablet roundtrip, frequency metadata and precision");
})();
