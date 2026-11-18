// Synthetic regression: reading a combined appointment must preserve edited times.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'modules/agenda.html'),'utf8');
const script=html.match(/<script id="atlas-v136-combined-duration-fix">([\s\S]*?)<\/script>/)[1];
const durationDefinition=html.split('\n').find(line=>line.includes('function durationForSelectedServices(services){'));
const core=['Fisioterapia','Osteopatía','Neuromodulación'];
function form(start,end,services=core){
 const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
 const fields={mTime:{value:start},mEndTime:{value:end},mDuration:{value:String(minutes(end)-minutes(start))}};
 const context={fields,document:{getElementById:id=>fields[id]},therapyDurations:{Fisioterapia:30,Osteopatía:30,Neuromodulación:30},
  mins:minutes,timeStr:value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0'),
  readModal:()=>({time:fields.mTime.value,endTime:fields.mEndTime.value,duration:Number(fields.mDuration.value),services:[...services]})};
 vm.createContext(context);
 vm.runInContext(durationDefinition+`\nfunction applySelectedServicesDuration(services){const duration=durationForSelectedServices(services);fields.mDuration.value=String(duration);return duration;}\n`+script,context);
 return {context,fields};
}
for(const [start,end,duration] of [['09:45','10:30',45],['09:30','10:15',45],['09:00','10:15',75],['11:00','12:00',60]]){
 const {context,fields}=form(start,end),before=JSON.stringify(fields),read=context.readModal();
 assert.equal(read.time,start);assert.equal(read.endTime,end);assert.equal(read.duration,duration);assert.equal(JSON.stringify(fields),before,'Reading must not rewrite the form');
}
const invalid=form('10:00','09:45').context.readModal();assert.equal(invalid.endTime,'09:45');assert(invalid.duration<0,'Do not turn an invalid interval into a valid default before validation');
const defaults=form('09:00','09:45');assert.equal(defaults.context.applySelectedServicesDuration(core),60);assert.equal(defaults.fields.mEndTime.value,'10:00');
const single=form('09:00','09:45',['Fisioterapia']);assert.equal(single.context.readModal().duration,45);
assert(html.includes("for(const [services,duration] of [[planManualServices,60],[planReadaptServices,45]])"),'Automatic planner block defaults are retained');
let scripts=0;for(const [,attrs,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|application\/json|application\/ld\+json/.test(attrs))continue;new vm.Script(body);scripts++}
console.log(`PASS: edited start/end, shorter/longer/invalid intervals, single service, 60-minute selection default and planner defaults; ${scripts} scripts valid.`);
