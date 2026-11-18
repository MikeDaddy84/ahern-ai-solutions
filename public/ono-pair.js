document.getElementById('ono-pair')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  const status = document.getElementById('ono-status');
  document.getElementById('ono-key').textContent = '';
  try {
    const result = await fetch('/api/portal/ono-sendai/pair', { method:'POST', headers:{'X-CSRF-Token':document.getElementById('main').dataset.csrf} });
    if (!result.ok) throw new Error();
    document.getElementById('ono-key').textContent = (await result.json()).token;
    status.textContent = 'Copy this key to the private setup prompt. It is shown once.';
  } catch { status.textContent = 'Could not create a feed key. Refresh and retry.'; button.disabled = false; }
});
