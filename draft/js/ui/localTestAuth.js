export function openLocalTestAuth(client,onChange){
 if(document.querySelector('#draft-test-auth'))return;
 const dialog=document.createElement('dialog');dialog.id='draft-test-auth';dialog.className='draft-modal campaign-save-dialog';
 dialog.innerHTML='<h2>Cuenta del proyecto de pruebas</h2><p>Usá cuentas de LAqP Draft - Pruebas. Las cuentas de producción no sirven aquí.</p><form><label>Correo <input name="email" type="email" autocomplete="username" required></label><label>Contraseña <input name="password" type="password" autocomplete="current-password" required minlength="6"></label><div class="campaign-save-actions"><button class="draft-btn" type="submit">Iniciar sesión</button><button class="draft-btn" type="button" data-register>Crear cuenta de prueba</button><button class="draft-btn" type="button" data-logout>Cerrar sesión</button><button class="draft-btn" type="button" data-close>Cerrar</button></div></form><p role="status" data-auth-status></p>';
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const form=dialog.querySelector('form'),status=dialog.querySelector('[data-auth-status]');let busy=false;
 async function execute(action){if(busy)return;if(!client){status.textContent='Configuración de pruebas no disponible. No se conectará a producción.';return;}if(action!=='logout'&&!form.reportValidity())return;busy=true;status.textContent='Conectando al proyecto de pruebas…';try{
 const email=form.elements.email.value.trim(),password=form.elements.password.value;
 const result=action==='logout'?await client.auth.signOut():action==='register'?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});
 form.elements.password.value='';if(result.error)throw result.error;
 if(action==='register'&&!result.data?.session)status.textContent='Revisá tu correo y confirmá la cuenta. Después iniciá sesión aquí. No se desactivó la confirmación.';
 else {await onChange();status.textContent=action==='logout'?'Sesión de pruebas cerrada.':'Sesión de pruebas iniciada.';}
 }catch(error){status.textContent='No se pudo autenticar: '+String(error.message||error);}finally{form.elements.password.value='';busy=false;}}
 form.addEventListener('submit',e=>{e.preventDefault();execute('login');});dialog.addEventListener('click',e=>{if(e.target.closest('[data-close]'))dialog.close();else if(e.target.closest('[data-register]'))execute('register');else if(e.target.closest('[data-logout]'))execute('logout');});dialog.showModal();
}
