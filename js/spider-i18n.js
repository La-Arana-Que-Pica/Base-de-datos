/* Spider-only static locale routes; no translation API or runtime content service. */
(() => {
  'use strict';
  const lang=document.documentElement.dataset.spiderLanguage;
  if(!lang)return;
  const key='laqp-spider-language',select=document.querySelector('#sp-language');
  const languages=['es','en','pt','ar','it'];
  const preview=new URL(location.href).searchParams.has('preview');
  // An explicit localized URL wins. A stored choice is applied to Spanish entry URLs.
  let stored;try{stored=localStorage.getItem(key);}catch{}
  if(lang==='es'&&!preview&&languages.includes(stored)&&stored!=='es'){
    const option=select?.querySelector(`option[value="${stored}"]`);
    if(option)location.replace(option.dataset.url+location.search+location.hash);
  }else if(!preview){try{localStorage.setItem(key,lang);}catch{}}
  select?.addEventListener('change',()=>{
    const option=select.selectedOptions[0];
    try{localStorage.setItem(key,select.value);}catch{}
    location.assign(option.dataset.url+location.search+location.hash);
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-copy-password]');if(!button)return;
    const status=button.parentElement.querySelector('.sp-copy-status');
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(button.dataset.copyPassword);
      else{
        const area=document.createElement('textarea');area.value=button.dataset.copyPassword;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();
        const copied=document.execCommand('copy');area.remove();button.focus();if(!copied)throw Error('copy');
      }
      status.textContent=button.dataset.copied;
    }catch{status.textContent=button.dataset.copyError;}
  });
})();
