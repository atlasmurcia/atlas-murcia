/* Reglas de la plantilla de presupuestos de Murcia; conserva los precios del catálogo. */
(function(root){
 'use strict';
 const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const physicalm=name=>/^(physicalm|phisicalm)/.test(key(name));
 function giftOrder(name){
  const value=key(name);
  if(value==='osteopatia')return 1;
  if(value==='imoove')return 2;
  if(physicalm(name))return /dinamic/.test(value)?3:4;
  if(['camillafd','camillaflexiondistraccion','camilladeflexiondistraccion','flexiondistraccion'].includes(value))return 5;
  return 0;
 }
 function sessions(service){
  const value=key(service.name);
  if(/^brains?way(?:terapiatranscraneal)?$/.test(value))return 10;
  if(value==='fisioavanzada')return 6;
  const mbst=value.match(/^mbst(?:flex|osteospin)?(artrosis|disco|hueso|ligamento|musculo|nervios?|osteoporosis|postcirugia|tendon)$/);
  if(mbst)return mbst[1]==='osteoporosis'?10:9;
  if(physicalm(service.name))return 6;
  if(['robot','attrobotic','robotatt','attrobot','robottraccion','traccionrobotica','vacu','vacusport'].includes(value))return 10;
  return service.sessions;
 }
 const rank=name=>giftOrder(name)?100+giftOrder(name):key(name)==='readaptacion'?100:0;
 function order(lines,nameOf=line=>line[0]){
  return lines.map((line,index)=>({line,index})).sort((a,b)=>rank(nameOf(a.line))-rank(nameOf(b.line))||a.index-b.index).map(item=>item.line);
 }
 function template(services){return order(services.map(service=>[service.name,sessions(service),service.price,0]));}
 // Plantilla combinada aprobada: cantidades y precios propios, independientes del catálogo general.
 function combinedTemplate(){return {name:'Radiculopatia Simple',lines:order([
  ['MBST OSTEOSPIN Nervio',9,150,0],['BRAINS WAY (TERAPIA TRANSCRANEAL)',10,110,0],
  ['Bomba Diamagnética dinámica',10,100,0],['Magnetophysio',10,25,0],['SIS',10,25,0],
  ['Neuromodulación',6,20,0],['Fisioterapia',6,45,0],['ROBOT',10,65,0],['Readaptación',10,45,0],
  ['Osteopatía',6,60,0],['IMOOVE',10,20,0],['PHYSICALM DINAMICO',6,15,0],['Camilla FD',6,65,0]
 ])}}
 const effectiveFrom=Date.parse('2026-11-06T11:22:14+01:00');
 const eligible=budget=>Number.isFinite(Date.parse(budget?.createdAt))&&Date.parse(budget.createdAt)>=effectiveFrom;
 const api={key,giftOrder,sessions,order,template,combinedTemplate,eligible};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.AtlasBudgetEquipmentTemplate=api;
 if(typeof window==='undefined'||typeof therapyCatalog==='undefined')return;
 budgetTemplates.radiculopatia_simple=combinedTemplate();
 function refresh(){
  therapyCatalog.forEach(service=>{service.sessions=sessions(service)});
  budgetTemplates.todas.lines=template(therapyCatalog);
  if(document.getElementById('therapyPicker'))initTherapyPicker();
 }
 const previousCatalog=window.atlasApplyServiceCatalog;
 window.atlasApplyServiceCatalog=function(services){const result=previousCatalog(services);if(result)refresh();return result};
 // Nunca reordenar ni aplicar la nueva plantilla a presupuestos anteriores al corte.
 const current=()=>budgets.find(budget=>String(budget.id)===String(currentBudgetId));
 const previousTemplate=applyBudgetTemplate;
 applyBudgetTemplate=function(type){if(type==='todas'&&!eligible(current()))return alert('Esta plantilla se aplica solo a presupuestos nuevos desde el 6/11/2026 a las 11:22. Crea un nuevo presupuesto para utilizarla.');return previousTemplate.apply(this,arguments)};
 const previousAdd=addBudgetLine;
 addBudgetLine=function(){const result=previousAdd.apply(this,arguments),host=document.getElementById('budgetLines');if(host&&eligible(current()))order([...host.children],line=>line.querySelector('.bl-name')?.value||'').forEach(line=>host.appendChild(line));return result};
 refresh();
})(typeof window!=='undefined'?window:null);
