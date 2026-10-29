'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function setup(opts={}){
 class Sheet{
  constructor(name){this.name=name;this.rows=[];}
  getLastRow(){return this.rows.length;}
  getRange(row,col,nrows=1,ncols=1){
   const s=this;return {
    getValues(){return Array.from({length:nrows},(_,i)=>
      Array.from({length:ncols},(_,j)=>s.rows[row+i-1]?.[col+j-1]??''));},
    setValues(values){for(let i=0;i<values.length;i++){
     while(s.rows.length<row+i)s.rows.push([]);
     for(let j=0;j<values[i].length;j++)s.rows[row+i-1][col+j-1]=values[i][j];
    }return this;},
    setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
    setNumberFormat(){return this;}
   };
  }
  appendRow(row){if(opts.failArchive&&this.name==='MENTAL_CONFLICT_ARCHIVE')throw Error('archive blocked');
   this.rows.push([...row]);return this;}
  setFrozenRows(){return this;}
  setColumnWidths(){return this;}
 }
 const sheet=new Sheet('MENTAL_LOG');
 const fields=['energy','control','capacity','tolerance','rest','selfAction','self'];
 const row=(memo)=>({date:'2026-10-27',
  scores:Object.fromEntries(fields.map(k=>[k,7])),
  offDutyMinutes:0,offDutyType:[],basicNeedsDelayed:[],contexts:[],
  memo,husbandLetter:'',husbandLetterStatus:'',husbandLetterOpenedAt:''});
 const server=row('server original 5');
 sheet.rows=[['기준일','비공개 회복 기록 JSON','최종 수정'],
   ['2026-10-27',JSON.stringify(server),'2026-10-27T22:01:00Z']];
 const map=new Map([['MENTAL_LOG',sheet]]);
 const ss={getSheetByName:n=>map.get(n),insertSheet:n=>{
  const sh=new Sheet(n);map.set(n,sh);return sh;}};
 const context=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush:()=>{}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},console});
 vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context,{filename:'Code.gs'});
 vm.runInContext('mentalValidateAccess_=function(){}',context);
 function sync(merged,expectedRevision,original,confirmed=true){
  const payload={passphrase:'0000',entry:merged,expectedRevision,
   diagnostics:{deviceId:'aaaaaaaaaaaaaaaaaaaaaaaa',role:'wife',os:'Windows'},
   resolution:{confirmed,serverRevision:expectedRevision,originalLocal:original}};
  return vm.runInContext('syncMentalEntry',context)(payload);
 }
 return {sync,server,row,sheet,map,context};
}
(function testArchiveThenWrite(){
 const env=setup(),local=env.row('full unsynced device memo'),merged=env.row('full unsynced device memo');
 const result=env.sync(merged,'2026-10-27T22:01:00Z',local);
 assert.equal(result.ok,true);
 assert.equal(result.conflictArchived,true);
 const archive=env.map.get('MENTAL_CONFLICT_ARCHIVE');
 assert.equal(archive.rows.length,2);
 assert.equal(JSON.parse(archive.rows[1][4]).memo,'server original 5');
 assert.equal(JSON.parse(archive.rows[1][5]).memo,'full unsynced device memo');
 assert.equal(JSON.parse(env.sheet.rows[1][1]).memo,'full unsynced device memo');
 console.log('PASS server: both complete originals archived before overwrite');
})();
(function testStaleRevisionLeavesServer(){
 const env=setup(),local=env.row('more local');
 const response=env.sync(local,'obsolete',local);
 assert.equal(response.conflict,true);
 assert.equal(env.map.has('MENTAL_CONFLICT_ARCHIVE'),false);
 assert.equal(JSON.parse(env.sheet.rows[1][1]).memo,'server original 5');
 console.log('PASS server: revision mismatch rejects resolution without writes');
})();
(function testArchiveFailureLeavesServer(){
 const env=setup({failArchive:true}),local=env.row('more local');
 assert.throws(()=>env.sync(local,'2026-10-27T22:01:00Z',local),/archive blocked/);
 assert.equal(JSON.parse(env.sheet.rows[1][1]).memo,'server original 5');
 console.log('PASS server: archive storage failure never writes active record');
})();
(function testEvenServerChoicePreservesBoth(){
 const env=setup(),originalLocal=env.row('device original'),
  choice=env.row('server original 5');
 const response=env.sync(choice,'2026-10-27T22:01:00Z',originalLocal);
 assert.equal(response.unchanged,true);
 assert.equal(response.conflictArchived,true);
 assert.equal(env.map.get('MENTAL_CONFLICT_ARCHIVE').rows.length,2);
 console.log('PASS server: choosing unchanged server still archives both originals');
})();
(function testSchemaVersion(){
 const env=setup();
 const response=vm.runInContext('getMentalMonth',env.context)('0000',2026,10);
 assert.equal(response.schemaVersion,6);
 console.log('PASS server: v6 capability is exposed to the frontend');
})();

(function testLikeWithoutTouchingRecoveryRecord(){
 const env=setup(),letter='A sealed letter transformed to read';
 const saved=env.row('important recovery memo');saved.husbandLetter=letter;
 saved.husbandLetterStatus='opened';saved.husbandLetterOpenedAt='2026-10-28T05:00:00.000Z';
 saved.husbandLetterLiked=false;
 env.sheet.rows[1][1]=JSON.stringify(saved);
 const liked={...saved,husbandLetterLiked:true};
 const reply=vm.runInContext('syncMentalEntry',env.context)({
  passphrase:'0000',entry:liked,expectedRevision:'obsolete',letterOnly:true,
  letterAction:'like',diagnostics:{deviceId:'aaaaaaaaaaaaaaaaaaaaaaaa'}
 });
 assert.equal(reply.ok,true);
 const after=JSON.parse(env.sheet.rows[1][1]);
 assert.equal(after.husbandLetterLiked,true);
 assert.equal(after.memo,'important recovery memo');
 assert.equal(after.husbandLetter,letter);
 assert.equal(after.husbandLetterOpenedAt,'2026-10-28T05:00:00.000Z');
 console.log('PASS server: liked letter never overwrites recovery memo or scores');
})();
(function testLikeCannotApplyToOtherOrSealedLetter(){
 const env=setup();
 const saved=env.row('memo');saved.husbandLetter='different letter';
 saved.husbandLetterStatus='sealed';
 env.sheet.rows[1][1]=JSON.stringify(saved);
 const tryLike={...saved,husbandLetter:'stale local letter',
  husbandLetterStatus:'opened',husbandLetterLiked:true};
 const reply=vm.runInContext('syncMentalEntry',env.context)({
  passphrase:'0000',entry:tryLike,letterOnly:true,letterAction:'like',
  diagnostics:{deviceId:'aaaaaaaaaaaaaaaaaaaaaaaa'}
 });
 assert.equal(reply.conflict,true);
 assert.equal(JSON.parse(env.sheet.rows[1][1]).husbandLetterLiked,undefined);
 console.log('PASS server: different or unopened letter cannot receive a stale heart');
})();
