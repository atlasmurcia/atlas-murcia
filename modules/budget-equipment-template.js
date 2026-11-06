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
  if(physicalm(service.name))return 6;
  if(['robot','attrobotic','robotatt','attrobot','robottraccion','traccionrobotica','vacu','vacusport'].includes(value))return 10;
  return service.sessions;
 }
 const rank=name=>giftOrder(name)?100+giftOrder(name):key(name)==='readaptacion'?100:0;
 function order(lines,nameOf=line=>line[0]){
  return lines.map((line,index)=>({line,index})).sort((a,b)=>rank(nameOf(a.line))-rank(nameOf(b.line))||a.index-b.index).map(item=>item.line);
 }
 function template(services){return order(services.map(service=>[service.name,sessions(service),service.price,giftOrder(service.name)?100:0]));}
 const effectiveFrom=Date.parse('2026-11-06T11:18:00+01:00');
 const eligible=budget=>Number.isFinite(Date.parse(budget?.createdAt))&&Date.parse(budget.createdAt)>=effectiveFrom;
 const api={key,giftOrder,sessions,order,template,eligible};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.AtlasBudgetEquipmentTemplate=api;
 if(typeof window==='undefined'||typeof therapyCatalog==='undefined')return;
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
 applyBudgetTemplate=function(type){if(type==='todas'&&!eligible(current()))return alert('Esta plantilla se aplica solo a presupuestos nuevos desde el 6/11/2026 a las 11:18. Crea un nuevo presupuesto para utilizarla.');return previousTemplate.apply(this,arguments)};
 const previousAdd=addBudgetLine;
 addBudgetLine=function(){const result=previousAdd.apply(this,arguments),host=document.getElementById('budgetLines');if(host&&eligible(current()))order([...host.children],line=>line.querySelector('.bl-name')?.value||'').forEach(line=>host.appendChild(line));return result};
 refresh();
})(typeof window!=='undefined'?window:null);
