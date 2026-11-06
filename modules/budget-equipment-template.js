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
 const api={key,giftOrder,sessions,order,template};
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
 // El mismo orden en pantalla, al guardar y al imprimir, también al añadir conceptos.
 const previousAdd=addBudgetLine;
 addBudgetLine=function(){const result=previousAdd.apply(this,arguments),host=document.getElementById('budgetLines');if(host)order([...host.children],line=>line.querySelector('.bl-name')?.value||'').forEach(line=>host.appendChild(line));return result};
 refresh();
})(typeof window!=='undefined'?window:null);
