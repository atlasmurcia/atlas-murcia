/* Candidato de interfaz. El transporte debe llamar a una operación transaccional del servidor. */
(function(root){
  'use strict';
  class PatientMergeController {
    constructor(request, now=()=>Date.now(), newId=()=>crypto.randomUUID()) {
      this.request=request; this.now=now; this.newId=newId;
      this.generation=0; this.busy=false; this.preview=null; this.result=null;
      this.resolutions={}; this.confirmed=false; this.requestId=null;
    }
    invalidate(){ this.generation++; this.preview=null; this.resolutions={}; this.confirmed=false; this.requestId=null; }
    async compare(primaryId, secondaryId){
      if(this.busy) throw Error('Hay una operación en curso.');
      this.invalidate();
      if(!primaryId||!secondaryId||primaryId===secondaryId) throw Error('Selecciona dos fichas diferentes.');
      const generation=this.generation;
      const p=await this.request('patients:mergePreview',{primaryId,secondaryId});
      if(generation!==this.generation) return null;
      if(!p||p.primary?.id!==primaryId||p.secondary?.id!==secondaryId||!p.token||
         !Number.isFinite(Date.parse(p.expiresAt))||!Array.isArray(p.conflicts)||
         !Array.isArray(p.categories)||!Array.isArray(p.blockers)||!p.coverageComplete)
        throw Error('El servidor no ha verificado toda la información. No se puede fusionar.');
      this.preview=p; this.requestId=this.newId(); return p;
    }
    resolve(field, source){
      if(this.busy) throw Error('Hay una operación en curso.');
      if(!this.preview?.conflicts.some(c=>c.field===field)||!['primary','secondary'].includes(source))
        throw Error('Decisión no válida.');
      this.resolutions[field]=source; this.confirmed=false;
    }
    canCommit(){
      const p=this.preview;
      return !!(p&&!this.busy&&this.confirmed&&!this.result&&Date.parse(p.expiresAt)>this.now()&&
        !p.blockers.length&&p.conflicts.every(c=>Object.hasOwn(this.resolutions,c.field)));
    }
    async commit(){
      if(!this.canCommit()) throw Error('Revisa los conflictos y confirma expresamente la fusión.');
      const p=this.preview; this.busy=true;
      try {
        const result=await this.request('patients:mergeCommit',{
          token:p.token,primaryId:p.primary.id,secondaryId:p.secondary.id,
          resolutions:{...this.resolutions},confirmed:true,idempotencyKey:this.requestId
        });
        if(!result?.mergeId||result.primaryId!==p.primary.id||!result.verified)
          throw Error('Respuesta sin verificación. Comprueba el estado antes de repetir.');
        this.result=result; this.confirmed=false; return result;
      } finally {this.busy=false;}
    }
    async undo(reason, confirmed){
      if(this.busy||!this.result||confirmed!==true||!String(reason||'').trim())
        throw Error('Confirma la reversión e indica el motivo.');
      const mergeId=this.result.mergeId; this.busy=true;
      try {
        const result=await this.request('patients:mergeUndo',{
          mergeId,reason:reason.trim(),confirmed:true,idempotencyKey:'undo-'+mergeId
        });
        if(!result?.verified||!result.reverted) throw Error('No se ha verificado la reversión.');
        this.result=null; this.invalidate(); return result;
      } finally {this.busy=false;}
    }
  }
  root.PatientMergeController=PatientMergeController;
})(globalThis);
