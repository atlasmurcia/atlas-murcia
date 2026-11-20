(function(root){
 'use strict';
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const date=d=>d.toISOString().slice(0,10),parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Fecha de referencia inválida.');const d=new Date(s+'T12:00:00Z');if(date(d)!==s)throw Error('Fecha de referencia inválida.');return d};
 const addDays=(s,n)=>{const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return date(d)};
 function addMonths(s,n){const d=parse(s),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return date(d)}
 const monday=s=>addDays(s,-((parse(s).getUTCDay()+6)%7));
 const active=r=>!['cancelled','canceled','cancelada','noshow','noasistio'].includes(norm(r.status))&&!r.deleted_at;
 const done=r=>['completed','realizada'].includes(String(r.status||'').toLowerCase());
 const services=r=>r.services||[r.therapy||r.service];
 const mbst=s=>norm(s).startsWith('mbst');
 function selectedCards(plan){
  const all=cards(plan),config=plan.aftercare||{};
  // Existing configurations without an explicit selection retain all-or-none behaviour.
  if(!Object.prototype.hasOwnProperty.call(config,'reactivationCards'))return config.reactivation===true?all:[];
  const keys=config.reactivationCards;
  if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string'||!all.some(card=>card.key===key))||new Set(keys).size!==keys.length||config.reactivation!==(keys.length>0))throw Error('Revisa la selección de tarjetas MBST para la reactivación.');
  return all.filter(card=>keys.includes(card.key));
 }
 const options=p=>({followups:p.aftercare?.followups===true,reactivation:Object.prototype.hasOwnProperty.call(p.aftercare||{},'reactivationCards')?selectedCards(p).length>0:p.aftercare?.reactivation===true});
 const enabled=p=>{const o=options(p);return o.followups||o.reactivation};
 function businessDay(s,isClosed=()=>false){let day=s;for(let i=0;i<370;i++,day=addDays(day,1))if(![0,6].includes(parse(day).getUTCDay())&&!isClosed(day))return day;throw Error('No se ha encontrado un día laborable para el seguimiento.')}
 function tasks(anchor,isClosed){return [15,2,3,4,5,6].map((n,i)=>{const calculatedDate=i?addMonths(anchor,n):addDays(anchor,n);return{key:i?'month-'+n:'day-15',title:i?'Seguimiento '+n+'º mes':'Seguimiento 15 días',calculatedDate,dueDate:businessDay(calculatedDate,isClosed),area:'auxiliar'}})}
 function cards(plan){const out=[];for(const [line,lineData] of (plan.lines||[]).entries()){if(!mbst(lineData[0])||Number(lineData[1])<=0)continue;const count=Math.ceil(Number(lineData[1])/(norm(lineData[0]).includes('osteoporosis')?10:9));for(let i=0;i<count;i++)out.push({key:'card-'+line+'-'+i,number:out.length+1,line,part:i,service:lineData[0],label:lineData[4]?.zone||lineData[4]?.label||lineData[0]})}return out}
 function cardForTask(task,plan){const list=cards(plan).filter(c=>c.line===task.line),size=norm(task.service).includes('osteoporosis')?10:9;return list[Math.floor(Number(task.sequence||0)/size)]||list[0]}
 function equipmentAllowed(service,clinic){const n=norm(service);if(n.startsWith('mbst')||/bomba|ondadechoque|ondasdechoque|shockwave/.test(n))return false;if(clinic==='murcia'&&/imoove|imove|brains|dpa/.test(n))return false;if(clinic==='alicante'&&n.includes('physicalm'))return false;return true}
 function adopt(plan,originals,canonical,expectedTasks){if(originals.some(r=>!active(r)))throw Error('Hay sesiones anuladas o sin asistir que deben recolocarse antes de añadir seguimientos.');if(expectedTasks){const count=list=>{const m=new Map;for(const s of list)m.set(canonical(s),(m.get(canonical(s))||0)+1);return m},expected=count(expectedTasks.flatMap(t=>t.services||[t.service])),actual=count(originals.flatMap(services));if([...new Set([...expected.keys(),...actual.keys()])].some(s=>(expected.get(s)||0)!==(actual.get(s)||0)))throw Error('El tratamiento original está incompleto o sus sesiones no coinciden con el presupuesto. Revisa las citas pendientes antes de añadir seguimientos.');}const mapping={},cardList=cards(plan);return originals.map(row=>{let candidates=cardList.filter(c=>services(row).includes(canonical(c.service)));const identified=candidates.find(c=>c.key===row.aftercareCardKey);if(identified)candidates=[identified];if(candidates.length>1)throw Error('Las tarjetas MBST antiguas no están diferenciadas. Revisa su identificación antes de añadir reactivaciones.');const ref=String(row.centralRef||row.id),key='legacy-'+ref;mapping[ref]={originKey:key,cardKey:candidates[0]?.key||'',expectedUpdatedAt:row.centralUpdatedAt};plan.aftercareOriginalMap=mapping;return{...row,aftercarePhase:'original',aftercareOriginKey:key,aftercareCardKey:candidates[0]?.key||''}})}
 function monthTasks(plan,originals,clinic,adapter){const byService=new Map();for(const row of originals)for(const service of services(row)){if(!equipmentAllowed(service,clinic))continue;const def=adapter.definition(service);if(!def.equipment)continue;if(!byService.has(norm(def.equipment)))byService.set(norm(def.equipment),{service,services:[service],duration:def.duration,aftercareKey:'month-equipment-'+norm(service),aftercareVisit:'equipment'})}
  const readapt={service:'Readaptación',services:['Readaptación'],duration:30,aftercareKey:'month-readapt',aftercareVisit:'readapt'},osteo={service:'Osteopatía',services:['Osteopatía'],duration:30,aftercareKey:'month-osteo',aftercareVisit:'osteo'};
  // Keep PhysicalM dynamic immediately after the manual review. Equipment
  // groups can use another day when the clinic's DPA/readaptation rule requires it.
  const dynamic=[...byService.values()].filter(t=>norm(t.service).includes('physicalm')&&norm(t.service).includes('dinam'));
  const other=[...byService.values()].filter(t=>!dynamic.includes(t));
  const dpa=other.filter(t=>norm(t.service)==='dpa'),early=other.filter(t=>norm(t.service)==='sis'||norm(t.service).includes('magneto')),later=other.filter(t=>!dpa.includes(t)&&!early.includes(t));
  return [[...early,readapt,osteo,...dynamic,...later],...dpa.map(t=>[t])];
 }
 function build(plan,originals,clinic,adapter,settings={}){
  const o=options(plan),created=[],pending=[],anchors=settings.anchors||{},base=originals.filter(active).filter(r=>!r.aftercarePhase||r.aftercarePhase==='original'),last=base.map(r=>r.date).sort().at(-1)||'',lastMbst=base.filter(r=>services(r).some(mbst)).map(r=>r.date).sort().at(-1)||'';
  const anchor=anchors.treatment||last,mbstAnchor=anchors.mbst||lastMbst;
  const admin=o.followups&&anchor?tasks(anchor,settings.isClosed||adapter.isClosed):[];
  if(!enabled(plan))return{created,tasks:[],pending,anchor,mbstAnchor,cards:[]};
  if(!anchor)return{created,tasks:[],pending:['Falta la última sesión del tratamiento original.'],anchor,mbstAnchor,cards:cards(plan)};
  const fixed=settings.fixed||[],placed=[...fixed];
  function placeGroup(group,target,key,exact=false){const missing=group.filter(t=>!fixed.some(r=>r.aftercareKey===t.aftercareKey));if(!missing.length)return true;for(let offset=0;offset<(exact?1:84);offset++){const day=addDays(target,offset);if(day<(settings.notBefore||''))continue;const rows=adapter.place(missing,plan,[...base,...placed],day);if(!rows)continue;rows.forEach((row,i)=>{const task=missing[i];Object.assign(row,{aftercarePhase:key,aftercareKey:task.aftercareKey,aftercareVisit:task.aftercareVisit||'',aftercareCardKey:task.aftercareCardKey||'',aftercareCardNumber:task.aftercareCardNumber||0,aftercareSession:task.aftercareSession||0,aftercareTarget:target});row.notes=(key==='reactivation'?'MBST reactivación · Tarjeta '+task.aftercareCardNumber+' · '+task.label+' · Sesión '+task.aftercareSession+'/3':'Seguimiento presencial 1er mes · '+(task.aftercareVisit==='osteo'?'Osteópata asignado · 30 minutos':task.aftercareVisit==='readapt'?'Readaptador asignado · 30 minutos':task.service))+' · '+(row.notes||'');});created.push(...rows);placed.push(...rows);return true}if(exact)return false;pending.push((key==='month1'?'Seguimiento presencial 1er mes: ':'MBST reactivación: ')+missing.map(t=>t.service).join(' + ')+' sin hueco desde '+target+'. Revisa disponibilidad, profesional y equipos.');return false}
  if(o.followups)for(const group of monthTasks(plan,base,clinic,adapter)){const target=addMonths(anchor,1);if(placeGroup(group,target,'month1')||!group.some(t=>t.aftercareVisit==='osteo'))continue;pending.pop();const early=group.filter(t=>norm(t.service)==='sis'||norm(t.service).includes('magneto')),read=group.filter(t=>t.aftercareVisit==='readapt'),manual=group.filter(t=>t.aftercareVisit==='osteo'||norm(t.service).includes('physicalm')&&norm(t.service).includes('dinam')),others=group.filter(t=>!early.includes(t)&&!read.includes(t)&&!manual.includes(t));for(const chunk of [...early.map(t=>[t]),read,manual,...others.map(t=>[t])])if(chunk.length)placeGroup(chunk,target,'month1');}
  const cardList=selectedCards(plan);
  if(o.reactivation){if(!cardList.length||!mbstAnchor)pending.push('La reactivación necesita MBST y su última sesión original planificada.');else if(cardList.length>2)pending.push('Más de dos tarjetas MBST: revisar la pauta antes de planificar la reactivación.');else{
   const mode=plan.availabilityProfile?.twoCardsMode||'not_applicable';
   if(cardList.length===2&&mode!=='consecutive')pending.push('Para completar las dos tarjetas en una misma semana, selecciona una sesión de cada tarjeta, seguidas el mismo día. Si el paciente no puede, revisa la pauta antes de planificar.');
   else{
    const target=addMonths(mbstAnchor,6),selectedFixed=fixed.filter(r=>r.aftercarePhase==='reactivation'&&cardList.some(c=>c.key===r.aftercareCardKey)),fixedWeeks=new Set(selectedFixed.filter(active).map(r=>monday(r.date)));
    const canDay=(card,day)=>{const rows=[...selectedFixed,...created].filter(r=>r.aftercarePhase==='reactivation'&&r.aftercareCardKey===card.key&&active(r));return !rows.some(r=>r.date===day)&&rows.filter(r=>monday(r.date)===monday(day)).length<3};
    let complete=false;
    for(let weekOffset=0;weekOffset<17&&!complete;weekOffset++){
     const week=addDays(monday(target),weekOffset*7);if(fixedWeeks.size&&(fixedWeeks.size!==1||!fixedWeeks.has(week)))continue;
     const createdBefore=created.length,placedBefore=placed.length;let okay=true;
     for(let session=1;session<=3;session++){
      const key=card=>'reactivation-'+card.key+'-'+session,missing=cardList.filter(card=>!selectedFixed.some(r=>r.aftercareKey===key(card))),fixedSession=selectedFixed.filter(r=>active(r)&&cardList.some(card=>r.aftercareKey===key(card)));
      if(!missing.length)continue;
      const group=missing.map(card=>({service:adapter.canonical(card.service),services:[adapter.canonical(card.service)],duration:60,aftercareKey:key(card),aftercareCardKey:card.key,aftercareCardNumber:card.number,aftercareSession:session,label:card.label}));
      let found=false;
      for(let offset=0;offset<7;offset++){
       const day=addDays(week,offset);if(day<target||day<(settings.notBefore||'')||fixedSession.some(r=>r.date!==day)||!missing.every(card=>canDay(card,day)))continue;
       const before=created.length;placeGroup(group,day,'reactivation',true);if(created.length>before){created.slice(before).forEach(r=>r.aftercareTarget=target);found=true;break}
      }
      if(!found){okay=false;break}
     }
     if(okay)complete=true;else{created.splice(createdBefore);placed.splice(placedBefore);}
    }
    if(!complete)pending.push('No hay una misma semana con hueco para las tres sesiones de cada tarjeta seleccionada. Revisa disponibilidad, equipos y citas protegidas. No se reparten entre semanas.');
   }
  }}
  return{created,tasks:admin,pending:[...new Set(pending)],anchor,mbstAnchor,cards:cardList};
 }
 function validate(result,plan,clinic,adapter){const errors=[...(result.pending||[])],rows=result.created||[],o=options(plan);if(o.followups){if(result.tasks?.length!==6)errors.push('Faltan los seis seguimientos de Auxiliar.');for(const visit of ['readapt','osteo']){const row=rows.find(r=>r.aftercareVisit===visit);if(!row||row.duration!==30||row.professional!==(visit==='readapt'?plan.readaptProfessional:plan.mainProfessional))errors.push('Revisa el seguimiento presencial de '+visit+'.')}}if(o.reactivation)for(const card of selectedCards(plan)){const visits=rows.filter(r=>r.aftercareCardKey===card.key);if(visits.length!==3)errors.push('La tarjeta '+card.number+' necesita tres sesiones de reactivación.');for(const row of visits)if(row.date<addMonths(result.mbstAnchor,6)||!row.notes?.includes('Tarjeta '+card.number))errors.push('Fecha o identificación MBST incorrecta.')}const reactivated=rows.filter(row=>row.aftercarePhase==='reactivation');if(new Set(reactivated.map(row=>monday(row.date))).size>1)errors.push('Todas las reactivaciones deben quedar dentro de una misma semana.');for(const card of selectedCards(plan))if(new Set(reactivated.filter(row=>row.aftercareCardKey===card.key).map(row=>row.date)).size!==3)errors.push('Cada tarjeta necesita tres días distintos dentro de la misma semana.');for(const row of rows)if(row.aftercarePhase==='reactivation'&&!selectedCards(plan).some(card=>card.key===row.aftercareCardKey))errors.push('Reactivación de una tarjeta no seleccionada.');for(const row of rows)if(row.aftercarePhase==='month1'&&row.aftercareVisit==='equipment'&&!services(row).every(s=>equipmentAllowed(s,clinic)))errors.push('Equipo excluido del seguimiento presencial.');return [...new Set(errors)]}
 const api={norm,addDays,addMonths,monday,active,done,services,mbst,options,enabled,businessDay,tasks,cards,selectedCards,cardForTask,equipmentAllowed,adopt,monthTasks,build,validate};root.atlasAftercare=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
