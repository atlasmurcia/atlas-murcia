(function(){
 'use strict';
 // The blocking review notice was withdrawn at the clinic's request.
 // Keep the agenda integration callable without reading or changing pending reviews.
 const inactive=async()=>{};
 window.atlasAftercareReview={refresh:inactive,open:inactive};
})();
