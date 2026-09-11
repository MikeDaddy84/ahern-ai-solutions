(() => {
  const date = document.getElementById('workspace-date');
  if (date) { date.dateTime = new Date().toISOString(); date.textContent = new Intl.DateTimeFormat('en-US', { weekday:'long', month:'long', day:'numeric' }).format(new Date()); }
  const show = document.getElementById('show-password');
  if (show) show.addEventListener('click', () => { const input=document.getElementById('password'); const reveal=input.type==='password'; input.type=reveal?'text':'password'; show.textContent=reveal?'Hide':'Show'; show.setAttribute('aria-label',reveal?'Hide password':'Show password'); });
  const login = document.getElementById('login-form');
  async function signout() {
    try {const res=await fetch('/api/portal/logout',{method:'POST',headers:{'X-CSRF-Token':document.getElementById('main')?.dataset.csrf || ''}});if(!res.ok) throw new Error();location.assign('/login');}
    catch {window.alert('Sign-out could not be completed. Please retry.');}
  }
  document.getElementById('signout')?.addEventListener('click',signout);
  document.getElementById('settings-signout')?.addEventListener('click',signout);
  const profile=document.getElementById('profile-form');
  if(profile) profile.addEventListener('submit',async event=> {
    event.preventDefault();const message=document.getElementById('profile-message');const button=profile.querySelector('button[type=submit]');button.disabled=true;
    try {
      if(document.getElementById('main').dataset.preview==='true') {message.textContent='Preview only. Profile changes are not saved to an account.';return;}
      const res=await fetch('/api/portal/profile',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':document.getElementById('main').dataset.csrf},body:JSON.stringify({name:document.getElementById('profile-name').value})});
      const data=await res.json();if(!res.ok) throw new Error(data.error);message.textContent='Profile saved.';
    } catch(error) {message.textContent=error.message || 'Unable to save profile.';} finally {button.disabled=false;}
  });
  if (login) login.addEventListener('submit', async event => { event.preventDefault(); const button=login.querySelector('[type=submit]'); const message=document.getElementById('login-message'); button.disabled=true; message.textContent='Signing in…'; try { const res=await fetch('/api/portal/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:login.email.value,password:login.password.value})}); const data=await res.json(); if(!res.ok) throw new Error(data.error); location.assign('/portal'); } catch(error) { message.textContent=error.message || 'Unable to sign in. Please try again.'; } finally { button.disabled=false; } });
})();
