// Navegación por inicial sin modificar el orden ni marcar servicios al buscarlos.
(()=>{
 const dropdown=document.getElementById('mServices');
 const options=document.getElementById('mServicesOptions');
 if(!dropdown||!options||dropdown.dataset.serviceKeyboard==='1')return;
 dropdown.dataset.serviceKeyboard='1';
 const hint=document.createElement('div');
 hint.id='mServicesKeyboardHint';
 hint.className='small muted';
 hint.style.cssText='padding:0 12px 8px';
 hint.textContent='Pulsa una letra para ir al servicio; repítela para avanzar. Espacio o Intro para marcar.';
 dropdown.insertBefore(hint,options);
 const summary=dropdown.querySelector('summary');
 summary.setAttribute('aria-describedby',[summary.getAttribute('aria-describedby'),hint.id].filter(Boolean).join(' '));
 const style=document.createElement('style');
 style.textContent='#mServicesOptions label:focus-within{background:#e4f5fc;outline:2px solid #0b7fab;outline-offset:-2px;border-radius:5px}';
 document.head.append(style);
 const initial=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').charAt(0);
 let lastKey='',lastInput=null;
 const reset=()=>{lastKey='';lastInput=null};
 dropdown.addEventListener('toggle',()=>{if(!dropdown.open)reset()});
 summary.addEventListener('click',reset);
 dropdown.addEventListener('focusout',event=>{if(!dropdown.contains(event.relatedTarget))reset()});
 dropdown.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.altKey||event.metaKey)return;
  const target=event.target;
  if(target!==summary&&!target.matches('#mServicesOptions input[type="checkbox"]'))return;
  if(event.key==='Enter'&&target!==summary&&dropdown.open&&!target.disabled){
   event.preventDefault();
   if(!event.repeat)target.click();
   return;
  }
  if(!/^[\p{L}\p{N}]$/u.test(event.key))return;
  event.preventDefault();
  if(event.repeat)return;
  const key=initial(event.key);
  const matches=[...options.querySelectorAll('input[type="checkbox"]')].filter(input=>!input.disabled&&!input.closest('[hidden]')&&initial(input.value)===key);
  if(!matches.length)return;
  const current=key===lastKey&&document.activeElement===lastInput?matches.indexOf(lastInput):-1;
  const input=matches[(current+1)%matches.length];
  dropdown.open=true;
  input.focus({preventScroll:true});
  input.closest('label').scrollIntoView({block:'nearest',inline:'nearest'});
  lastKey=key;lastInput=input;
 });
})();
