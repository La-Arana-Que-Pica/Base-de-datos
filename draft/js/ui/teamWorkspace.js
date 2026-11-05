// Preserve the approved workspace and native button identity across squad updates.
function sameElement(a,b) {
 return a.nodeType===b.nodeType && (a.nodeType!==1 || (a.tagName===b.tagName && a.getAttribute('data-team-slot')===b.getAttribute('data-team-slot') && a.id===b.id && (a.getAttribute('class')||'').split(' ')[0]===(b.getAttribute('class')||'').split(' ')[0]));
}
export function reconcileWorkspace(target,source) {
 if(target.nodeType===3){if(target.nodeValue!==source.nodeValue)target.nodeValue=source.nodeValue;return;}
 if(target.nodeType!==1)return;
 const keepOpen=target.tagName==='DETAILS' && target.hasAttribute('data-squad-detail') && target.getAttribute('data-squad-detail')===source.getAttribute('data-squad-detail') && target.open;
 for(const attr of [...target.attributes])if(!source.hasAttribute(attr.name))target.removeAttribute(attr.name);
 for(const attr of [...source.attributes])if(target.getAttribute(attr.name)!==attr.value)target.setAttribute(attr.name,attr.value);
 if(keepOpen)target.open=true;
 let index=0;
 for(const child of [...source.childNodes]){
  const current=target.childNodes[index];
  if(!current)target.appendChild(child.cloneNode(true));
  else if(sameElement(current,child))reconcileWorkspace(current,child);
  else {
   const reusable=[...target.childNodes].slice(index+1).find(node=>sameElement(node,child));
   if(reusable){while(target.childNodes[index]!==reusable)target.childNodes[index].remove();reconcileWorkspace(reusable,child);}
   else target.insertBefore(child.cloneNode(true),current);
  }
  index++;
 }
 while(target.childNodes.length>index)target.lastChild.remove();
}
export function mountTeamWorkspace(container,html) {
 const existing=container.querySelector?.('.drafting-screen');
 if(!existing || typeof document==='undefined' || !document.createElement){container.innerHTML=html;return;}
 const template=document.createElement('template');
 if(!template.content){container.innerHTML=html;return;}
 template.innerHTML=html;
 const next=template.content.querySelector('.drafting-screen');
 if(next)reconcileWorkspace(existing,next);else container.innerHTML=html;
}
