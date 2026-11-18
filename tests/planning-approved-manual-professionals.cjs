// Public catalogue and synthetic patients/configuration; no clinic connection.
const vm=require('node:vm'),assert=require('node:assert/strict');
const {setup,generate,manual,readapt}=require('./planning-murcia-blocks.cjs');
const {catalogCode}=require('./planning-murcia-professional-catalog.cjs');
for(const main of ['María Pilar Iniesta Cárceles','María Visitación Martínez Ruiz']){
 const c=setup();c.professionals=[main,'Concepción Madrid Taverner','Teresa Echegaray Díaz de Figueroa','Aitor Inglés Barrena'];c.equipment.push('Physicalm');c.therapyDurations['PHYSICALM DINAMICO']=30;vm.runInContext(catalogCode,c);
 const r=generate([...manual,...readapt,['PHYSICALM DINAMICO',2]],{mainProfessional:main,physioProfessional:'',readaptProfessional:'Aitor Inglés Barrena'},c);
 assert.deepEqual(r.errors,[]);const visits=r.rows.filter(a=>a.services.includes('Fisioterapia'));assert.equal(visits.length,2);assert(visits.every(a=>a.professional===main&&a.duration===60&&a.services.length===3));
 const profiles={professionals:[{name:'María Pilar Iniesta Cárceles',active:true,therapies:['Fisioterapia','Neuromodulación'],schedule:{1:[['09:00','13:00']]}},{name:'María Visitación Martínez Ruiz',active:true,therapies:['Fisioterapia','Neuromodulación'],schedule:{3:[['09:00','13:00']]}},{name:'Otro perfil ficticio',therapies:['Fisioterapia']}]},before=JSON.stringify(profiles.professionals[2]),hours=JSON.stringify(profiles.professionals.map(p=>p.schedule));
 assert.equal(c.atlasApplyMurciaApprovedOsteopathy(profiles),true);assert(profiles.professionals.slice(0,2).every(p=>p.therapies.includes('Osteopatía')));assert.equal(JSON.stringify(profiles.professionals[2]),before);assert.equal(JSON.stringify(profiles.professionals.map(p=>p.schedule)),hours);assert.equal(c.atlasApplyMurciaApprovedOsteopathy(profiles),false);
 profiles.professionals[1].therapies=profiles.professionals[1].therapies.filter(s=>s!=='Osteopatía');assert.equal(c.atlasApplyMurciaApprovedOsteopathy(profiles),false);assert(!profiles.professionals[1].therapies.includes('Osteopatía'));
 console.log('PASS approved manual block with '+main+'; scoped confirmation, schedules, other profiles and later revocation preserved');
}
