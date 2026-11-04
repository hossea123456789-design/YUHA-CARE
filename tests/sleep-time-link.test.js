'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
for(const [,source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(source.trim())new vm.Script(source,{filename:'index-inline.js'});
}
const helperFrom=html.indexOf('    function sleepMinutes(time) {');
const helperTo=html.indexOf('    function napIntervals(row) {',helperFrom);
const modalFrom=html.indexOf('    let sleepEditing=null;',helperTo);
const modalTo=html.indexOf('    function updateSleepSummaries() {',modalFrom);
assert(helperFrom>=0&&helperTo>helperFrom&&modalFrom>helperTo&&modalTo>modalFrom);
const source=html.slice(helperFrom,helperTo)+'\n'+html.slice(modalFrom,modalTo)+
 '\nglobalThis.__test={suggestedSleepTime,sleepClockPlus,sleepFollowupValid,openSleepTimeModal,applySleepTimeModal};';
function setup(row,previousDay={},dateKey='2026-11-04'){
 const edits=[];
 const elements=new Map();
 function getEl(id){
  if(!elements.has(id))elements.set(id,{value:'',textContent:'',
   classList:{add(){},remove(){}},dataset:{}});
  return elements.get(id);
 }
 const c={
  document:{getElementById:getEl},
  DAY_NAMES:['일','월','화','수','목','금','토'],
  getSleepRecord:date=>date===new Date(Date.parse(dateKey+'T12:00:00Z')-86400000).toISOString().slice(0,10)?previousDay:row,
  shiftSleepDate:(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10),
  updateSleepField:(date,field,value)=>{row[field]=value;edits.push([field,value]);},
  drawSleepTable(){},drawSleepCalendar(){},updateSleepSummaries(){},
  setSleepStatus(text){c.status=text;},nap2ReturnDate:null,
  reopenNap2Popover(){},setTimeout(fn){fn();},alert(msg){throw Error(msg)}
 };
 vm.runInNewContext(source,c,{filename:'sleep-time-link.js'});
 return {row,edits,context:c,element:getEl,test:c.__test};
}
function assertEdits(actual,expected){assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);}
{
 const t=setup({napStart:'08:00',napEnd:''});
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'08:30');
 assert.match(t.element('sleepModalTimeHint').textContent,/30분/);
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napEnd','08:30']]);
 console.log('PASS: start 08:00 prefills end 08:30');
}
{
 const t=setup({napStart:'07:30',napEnd:'08:00'});
 t.test.openSleepTimeModal('2026-11-04','napStart');
 t.element('sleepModalInput').value='08:00';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napStart','08:00'],['napEnd','08:30']]);
 assert.equal(t.row.napEnd,'08:30');
 console.log('PASS: editing previous start advances an invalid stored end by 30m');
}
{
 const t=setup({napStart:'07:30',napEnd:'09:45'});
 t.test.openSleepTimeModal('2026-11-04','napStart');
 t.element('sleepModalInput').value='08:00';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napStart','08:00']]);
 assert.equal(t.test.suggestedSleepTime(t.row,'napEnd').time,'09:45');
 console.log('PASS: valid existing end is never silently overwritten');
}
{
 const t=setup({bedTime:'21:00',asleepTime:'21:30'});
 t.test.openSleepTimeModal('2026-11-04','bedTime');
 t.element('sleepModalInput').value='23:50';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['bedTime','23:50'],['asleepTime','00:20']]);
 assert.equal(t.test.sleepFollowupValid('23:50','00:20',true),true);
 assert.equal(t.test.sleepFollowupValid('08:00','07:00',true),false);
 console.log('PASS: real bedtime rollover to 00:20, not bogus morning rollover');
}
{
 const t=setup({napEnd:'14:00',nap2Start:'15:00',nap2End:'16:00'});
 t.test.openSleepTimeModal('2026-11-04','nap2Start');
 t.element('sleepModalInput').value='16:00';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['nap2Start','16:00'],['nap2End','16:30']]);
 console.log('PASS: second nap stays ordered and compatible with existing validation');
}
{
 const t=setup({napEnd:'14:00',nap2Start:'',nap2End:''});
 assert.equal(t.test.suggestedSleepTime(t.row,'nap2Start').time,'14:30');
 assert.equal(t.test.suggestedSleepTime({bedTime:'',asleepTime:''},'asleepTime').time,'20:00');
 assert.equal(t.test.suggestedSleepTime({napStart:'23:45',napEnd:''},'napEnd').time,'14:00');
 console.log('PASS: second nap follows first nap and empty fields retain legacy defaults');
}
{
 const t=setup({napStart:'08:00',napEnd:'09:00'});
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'09:00');
 t.test.applySleepTimeModal(true);
 assertEdits(t.edits,[['napEnd','']]);
 console.log('PASS: existing end and intentional clear remain unchanged');
}
console.log('PASS: sleep time linkage, existing data preservation, and inline JavaScript syntax');

{
 const t=setup({napStart:'12:30',napEnd:''},{napStart:'12:35',napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'14:25','Yesterday 14:25 should override artificial start+30');
 assert.match(t.element('sleepModalTimeHint').textContent,/어제/);
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napEnd','14:25']]);
 console.log('PASS: today normal start borrows yesterday actual 14:25 wake');
}
{
 const t=setup({napStart:'14:25',napEnd:''},{napStart:'12:35',napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'14:55','Changed start equal to historical end must trigger +30');
 assert.match(t.element('sleepModalTimeHint').textContent,/30분/);
 console.log('PASS: drastically changed start makes yesterday end invalid, use +30 fallback');
}
{
 const t=setup({napStart:'',napEnd:''},{napStart:'12:35',napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napStart');
 assert.equal(t.element('sleepModalInput').value,'12:35','Start time comes from previous day same field');
 assert.match(t.element('sleepModalTimeHint').textContent,/어제/);
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'14:25','End time borrows historical end even before today start is entered');
 console.log('PASS: both empty start/end time pickers reference yesterday instead of fixed defaults');
}
{
 const t=setup({wakeTime:''},{wakeTime:'06:25'});
 t.test.openSleepTimeModal('2026-11-04','wakeTime');
 assert.equal(t.element('sleepModalInput').value,'06:25');
 console.log('PASS: previous day wake time becomes next day default');
}
{
 const t=setup({napStart:'12:30',napEnd:'14:15'},{napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'14:15');
 t.test.openSleepTimeModal('2026-11-04','napStart');
 t.element('sleepModalInput').value='12:40';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napStart','12:40']]);
 console.log('PASS: existing valid recorded end is never changed to yesterday time');
}
{
 const t=setup({napStart:'12:20',napEnd:'12:40'},{napStart:'12:30',napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napStart');
 t.element('sleepModalInput').value='12:30';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napStart','12:30'],['napEnd','14:25']]);
 console.log('PASS: start edit with invalid old end adjusts to yesterday real end rather than +30');
}
{
 const t=setup({napStart:'12:20',napEnd:'12:40'},{napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napStart');
 t.element('sleepModalInput').value='14:25';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napStart','14:25'],['napEnd','14:55']]);
 console.log('PASS: start moved beyond yesterday end, final saved end follows start by +30');
}
{
 const t=setup({napStart:'12:20',napEnd:''},{napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napStart');
 t.element('sleepModalInput').value='12:35';
 t.test.applySleepTimeModal(false);
 assertEdits(t.edits,[['napStart','12:35']]);
 assert.equal(t.row.napEnd,'','Unknown unobserved end must not be silently written');
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'14:25');
 console.log('PASS: previous day end is suggested for confirmation, not fabricated as observed time');
}

{
 const t=setup({napStart:'12:20',napEnd:''},{napStart:'12:30',napEnd:'14:25'},'2026-11-01');
 t.test.openSleepTimeModal('2026-11-01','napEnd');
 assert.equal(t.element('sleepModalInput').value,'14:25','November 1 must consult October 31');
 console.log('PASS: previous calendar month is used for November 1 time suggestion');
}

{
 const t=setup({napStart:'08:00',napEnd:''},{napEnd:'21:00'});
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'08:30',
  'Implausibly long yesterday-derived duration should not become a suggested nap');
 console.log('PASS: implausible previous-day endpoint falls back to a 30m suggestion');
}
{
 const t=setup({napStart:'08:00',napEnd:'15:00'},{napEnd:'14:25'});
 t.test.openSleepTimeModal('2026-11-04','napEnd');
 assert.equal(t.element('sleepModalInput').value,'15:00',
  'Real current-day manual values must not be overwritten due to historical plausibility limits');
 console.log('PASS: unusual manually observed end remains intact');
}
