// One verified branch, held as immutable text, scoped to a single coordinator.
// Not a source of HEAD/CAS truth, not persistent, never contains Auth material.
export class VerifiedDownloadCache{
 constructor({maxBytes=8*1024*1024,ttlMs=120000,now=()=>Date.now()}={}){Object.assign(this,{maxBytes,ttlMs,now});this.size=0;}
 key(owner,projectRef,head){return JSON.stringify([owner,projectRef,head.id||null,head.revision,head.hash]);}
 get(owner,projectRef,head){const key=this.key(owner,projectRef,head);if(!this.entry||this.entry.key!==key||this.now()>=this.entry.expires){this.clear();return null;}return this.entry;}
 rememberVerified(owner,projectRef,head,exportText){this.clear();if(exportText.length+head.manifest.length>this.maxBytes)return;const size=new TextEncoder().encode(exportText).length+new TextEncoder().encode(head.manifest).length;if(size>this.maxBytes)return;this.entry=Object.freeze({key:this.key(owner,projectRef,head),exportText,manifest:head.manifest,expires:this.now()+this.ttlMs});this.size=size;this.timer=setTimeout(()=>this.clear(),this.ttlMs);this.timer.unref?.();}
 clear(){clearTimeout(this.timer);this.timer=null;this.entry=null;this.size=0;}
}
