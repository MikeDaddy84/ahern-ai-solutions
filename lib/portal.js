const express = require('express');
const { escapeHtml: h } = require('./layout');

function document(title, body, page = 'login') {
  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${h(title)} — Ahern AI</title><link rel="icon" href="/brand/favicon.png"><script src="/portal-theme.js?v=1"></script><link rel="stylesheet" href="/styles.css?v=studio-1"><link rel="stylesheet" href="/portal.css?v=2"></head><body class="portal" data-page="${h(page)}"><a class="skip-link" href="#main">Skip to content</a>${body}<button class="theme-toggle portal-theme-toggle" type="button" data-portal-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode"><svg class="theme-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="theme-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button><script src="/portal.js?v=1" defer></script></body></html>`;
}
const brand = '<a class="logo" href="/" aria-label="Ahern AI home"><span class="logo-mark"></span><span class="logo-type">Ahern AI</span></a>';
function login() {
  return document('Your workspace', `<header class="portal-header">${brand}<a class="quiet-link" href="/">Back to website <span aria-hidden="true">↗</span></a></header><main id="main" class="entry"><section class="entry-story"><p class="portal-kicker">THE AHERN AI PORTAL</p><h1>A place to<br>make progress.</h1><p class="entry-intro">Your tools. Your priorities.<br>One familiar place to get to work.</p><div class="entry-tool"><span class="satori-mark" aria-hidden="true">悟</span><div><strong>Satori lives here.</strong><p>Your daily agenda, with room to think.</p></div></div><p class="entry-foot">Built for the people behind the work.</p></section><section class="entry-form" aria-labelledby="welcome"><p class="portal-kicker">WELCOME IN</p><h2 id="welcome">Your day starts here.</h2><p>Sign in to your Ahern AI workspace.</p><form id="login-form"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="username" placeholder="you@company.com" required maxlength="254"><label for="password">Password</label><div class="password-field"><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="button" id="show-password" aria-label="Show password">Show</button></div><button class="portal-button" type="submit">Sign in <span aria-hidden="true">→</span></button><p id="login-message" class="form-message" role="status"></p></form><p class="entry-help">Need access or help signing in?<br><a href="mailto:hello@ahernai.com?subject=Portal%20access">Contact Ahern AI</a></p><div class="preview-entry"><span>Take a look inside</span><a href="/portal/preview">Explore the portal preview <span aria-hidden="true">→</span></a><small>Sample workspace. No account or password needed.</small></div></section></main><footer class="portal-footer"><span>© 2026 Ahern AI Solutions</span><a href="/privacy">Privacy</a></footer>`);
}
function setupPage() {
  return document('Set your password', `<header class="portal-header">${brand}<a class="quiet-link" href="/login">Sign in</a></header><main id="main" class="entry"><section class="entry-story"><p class="portal-kicker">WELCOME TO AHERN AI</p><h1>Your space.<br>Your next step.</h1><p class="entry-intro">Choose a password to activate your workspace.</p></section><section class="entry-form"><h2>Make yourself at home.</h2><p>Use a unique password of at least 14 characters.</p><form id="setup-form"><label for="setup-password">New password</label><input id="setup-password" name="password" type="password" autocomplete="new-password" minlength="14" maxlength="256" required><label for="setup-confirm">Confirm password</label><input id="setup-confirm" type="password" autocomplete="new-password" minlength="14" maxlength="256" required><button class="portal-button" type="submit">Activate my account →</button><p id="setup-message" role="status"></p></form><p class="entry-help">This setup link expires after 24 hours and works once.</p></section></main>`, 'setup');
}
function shell({ preview = false, name = 'Your workspace', email = '', role = 'member', csrf = '', view = 'home', content = '' } = {}) {
  const base = preview ? '/portal/preview' : '/portal';
  const safeName = h(name);
  const nav = (path, label, mark) => `<a href="${base}${path}" ${view === (path.slice(1) || 'home') ? 'aria-current="page"' : ''}><span aria-hidden="true">${mark}</span>${label}</a>`;
  return document(view === 'satori' ? 'Satori' : 'Workspace', `<div class="portal-shell"><aside class="portal-sidebar">${brand}<div class="workspace-label"><span class="workspace-avatar">${h(name.slice(0, 1).toUpperCase())}</span><div><strong>${safeName}</strong><small>${preview ? 'Sample workspace' : 'Personal workspace'}</small></div></div><nav aria-label="Workspace">${nav('', 'Overview', '⌂')}<p class="nav-label">YOUR TOOLS</p>${nav('/satori', 'Satori', '悟')}<p class="nav-label">ACCOUNT</p>${nav('/settings', 'Settings', '⚙')}<a href="mailto:hello@ahernai.com?subject=Portal%20support"><span aria-hidden="true">?</span>Get help</a></nav><div class="sidebar-bottom"><span class="member-avatar">${h(name.slice(0, 1).toUpperCase())}</span><div><strong>${safeName}</strong><small>${preview ? 'Preview mode' : h(role)}</small></div>${preview ? '<a href="/login" aria-label="Exit preview">↗</a>' : '<button id="signout" aria-label="Sign out">↗</button>'}</div></aside><div class="portal-main"><header class="workspace-top"><span>Ahern AI <span aria-hidden="true">/</span> ${view === 'satori' ? 'Satori' : view === 'settings' ? 'Settings' : 'Overview'}</span><a href="/">ahernai.com ↗</a></header>${preview ? '<div class="preview-banner"><strong>Portal preview</strong><span>Sample data only. Changes stay in this tab.</span><a href="/login">Exit preview ↗</a></div>' : ''}<main id="main" class="workspace-content" data-preview="${preview}" data-csrf="${h(csrf)}">${content || `<div class="welcome-row"><div><p class="portal-kicker">YOUR WORKSPACE</p><h1>Welcome${preview ? '' : ', ' + safeName}.</h1><p>A little clarity. A good place to start.</p></div><time id="workspace-date"></time></div><section class="tool-feature"><div class="tool-feature-copy"><div class="tool-label"><span class="satori-mark" aria-hidden="true">悟</span><span>YOUR DAILY AGENDA</span></div><h2>Satori</h2><p>Make room for what matters. Bring your have-tos, need-tos, and want-tos into focus.</p><a class="portal-button" href="${base}/satori">Open Satori <span aria-hidden="true">↗</span></a></div><div class="satori-glimpse" aria-label="Satori priorities"><div><span>01</span><strong>Have to</strong><small>The essentials</small></div><div><span>02</span><strong>Need to</strong><small>Move things forward</small></div><div><span>03</span><strong>Want to</strong><small>Make space for you</small></div></div></section><div class="workspace-secondary"><section><p class="portal-kicker">A SPACE THAT’S YOURS</p><h3>Pick up where you left off.</h3><p>Satori brings your agenda, backlog, and recent history together inside your workspace.</p></section><a class="settings-shortcut" href="${base}/settings"><span aria-hidden="true">⚙</span><div><h3>Make yourself at home</h3><p>Your profile and workspace details.</p></div><span aria-hidden="true">→</span></a></div>`}</main><footer class="workspace-footer"><span>Ahern AI · Built around your work.</span><a href="mailto:hello@ahernai.com">Need a hand?</a></footer></div></div>`, view);
}
function settings(user, preview) {
  return `<div class="welcome-row"><div><p class="portal-kicker">MAKE YOURSELF AT HOME</p><h1>Your settings.</h1><p>Profile and workspace details.</p></div></div><form id="profile-form" class="profile-form"><label for="profile-name">Display name</label><input id="profile-name" name="name" value="${h(user.name)}" required maxlength="80"><label for="profile-email">Email address</label><input id="profile-email" type="email" value="${h(user.email)}" disabled><p class="setting-note">Contact Ahern AI to change your sign-in email or reset your password.</p><button class="portal-button" type="submit">Save profile <span aria-hidden="true">→</span></button><p id="profile-message" role="status"></p></form><section class="account-details"><h2>Workspace details</h2><dl><div><dt>Access</dt><dd>${preview ? 'Sample account' : h(user.role)}</dd></div><div><dt>Agenda time zone</dt><dd>America/Chicago</dd></div><div><dt>Satori workspace</dt><dd>${preview ? 'Sample data in this tab' : 'Personal'}</dd></div></dl><p class="setting-note">Satori’s daily agenda and rollover follow Central Time.</p></section>${preview ? '' : '<button class="portal-button" id="settings-signout" type="button">Sign out</button>'}`;
}
function satoriPage(user, preview) {
  const source = require('./satori').clientHtml();
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) throw new Error('Satori client missing');
  const assets = (source.match(/<script[^>]*type="module"[^>]*>[\s\S]*?<\/script>|<link[^>]*rel="stylesheet"[^>]*>/g) || []).join('\n');
  const content = `<div class="satori-host" data-preview="${preview}">${body.replace(/<main\b/g,'<div').replace(/<\/main>/g,'</div>')}</div>`;
  return shell({...user,preview,view:'satori',content}).replace('</head>',`${assets}<link rel="stylesheet" href="/satori-portal.css?v=2"></head>`);
}
function createRouter({ storeProvider = require('./portal-auth').getStore, satori = require('./satori') } = {}) {
  const auth = require('./portal-auth');
  const router = express.Router();
  const attempts = new Map();
  router.use((req, res, next) => {
    if (req.path === '/login' || /^\/(?:portal|api\/portal)(?:\/|$)/.test(req.path)) res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    next();
  });
  router.use('/portal/satori-assets', express.static(require('node:path').join(__dirname,'../apps/satori/dist/public'), {index:false}));
  router.get('/login', (req, res) => res.send(login()));
  router.get('/portal/setup', (req,res)=>res.send(setupPage()));
  router.post('/api/portal/setup', async(req,res)=> {
    if(!auth.sameOrigin(req)) return res.status(403).json({error:'Please use your setup link on this website.'});
    const now=Date.now(), key='setup:'+req.ip;
    for(const [k,v] of attempts) if(v.until<=now) attempts.delete(k);
    const attempt=attempts.get(key) || {count:0,until:now+600000};
    if(attempts.size>10000 || attempt.count>=10) return res.status(429).set('Retry-After','600').json({error:'Too many attempts. Please try again in 10 minutes.'});
    attempt.count++;attempts.set(key,attempt);
    const {token,password}=req.body || {};
    if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token) || typeof password!=='string' || password.length<14 || password.length>256) return res.status(400).json({error:'Use your setup link and a password of 14–256 characters.'});
    try {
      const store=storeProvider();
      if(!store) throw new Error('Unavailable');
      if(!await store.finishSetup(token,password)) return res.status(400).json({error:'This setup link has expired or already been used. Contact Ahern AI for help.'});
      res.json({ok:true});
    } catch {res.status(503).json({error:'Account setup is temporarily unavailable. Please retry.'});}
  });
  router.get('/portal/preview', (req, res) => res.send(shell({ preview: true, name: 'Alex Morgan' })));
  const sample = {name:'Alex Morgan',email:'alex@example.com',role:'member'};
  router.get('/portal/preview/settings', (req,res)=>res.send(shell({...sample,preview:true,view:'settings',content:settings(sample,true)})));
  router.get('/portal/preview/satori', (req,res)=> {
    try {res.send(satoriPage(sample,true));} catch {res.status(503).send(shell({...sample,preview:true,view:'satori',content:'<h1>Satori is being prepared.</h1><p>Please return to your workspace and try again shortly.</p><a href="/portal/preview">Back to workspace</a>'}));}
  });
  router.post('/api/portal/login', async (req,res)=> {
    if(!auth.sameOrigin(req)) return res.status(403).json({error:'Please sign in from this website.'});
    const now=Date.now();
    for(const [key,value] of attempts) if(value.until<=now) attempts.delete(key);
    const keys=['ip:'+req.ip,'email:'+String(req.body?.email || '').trim().toLowerCase().slice(0,254)];
    if(attempts.size>10000 || keys.some(key=>(attempts.get(key)?.count || 0)>=10)) return res.status(429).set('Retry-After','600').json({error:'Too many attempts. Please try again in 10 minutes.'});
    for(const key of keys) { const current=attempts.get(key)||{count:0,until:now+600000};current.count++;attempts.set(key,current); }
    if(typeof req.body?.email!=='string' || req.body.email.length>254 || typeof req.body?.password!=='string' || req.body.password.length>256) return res.status(400).json({error:'Enter your email and password.'});
    try {
      const store=storeProvider();
      if(!store) return res.status(503).json({error:'Sign-in is not available yet. Please contact Ahern AI for access.'});
      const value=await store.login(req.body.email,req.body.password);
      if(!value) return res.status(401).json({error:'Email or password is incorrect.'});
      // Replace an existing browser session instead of retaining it after login.
      if(auth.readCookie(req)) await store.logout(auth.readCookie(req));
      res.cookie(auth.COOKIE,value,auth.cookieOptions()).json({ok:true});
    } catch {res.status(503).json({error:'Sign-in is temporarily unavailable. Please retry.'});}
  });
  router.use(['/portal','/api/portal'], async (req,res,next)=> {
    try {
      const store=storeProvider();
      const user=store && await store.session(auth.readCookie(req));
      if(!user) return req.originalUrl.startsWith('/api/') ? res.status(401).json({error:'Please sign in again.'}) : res.redirect(303,'/login');
      req.portalUser=user;req.portalStore=store;
      if(!['GET','HEAD','OPTIONS'].includes(req.method) && (!auth.sameOrigin(req) || req.get('X-CSRF-Token')!==user.csrf)) return res.status(403).json({error:'Your session changed. Reload this page and try again.'});
      next();
    } catch {res.status(503).send('Your workspace is temporarily unavailable. Please retry.');}
  });
  router.get('/portal', (req,res)=>res.send(shell(req.portalUser)));
  router.get('/portal/settings',(req,res)=>res.send(shell({...req.portalUser,view:'settings',content:settings(req.portalUser,false)})));
  router.get('/portal/satori',(req,res)=> {
    try { satori.configuration(req.portalUser.workspace_key); res.send(satoriPage(req.portalUser,false)); }
    catch {res.status(503).send(shell({...req.portalUser,view:'satori',content:'<h1>Your Satori workspace is being prepared.</h1><p>Contact Ahern AI to finish connecting your personal agenda.</p><a href="/portal">Back to workspace</a>'}));}
  });
  router.get('/api/portal/me',(req,res)=> {const {name,email,role,csrf}=req.portalUser;res.json({authenticated:true,name,email,role,csrf});});
  router.post('/api/portal/logout',async(req,res)=> {
    try {await req.portalStore.logout(auth.readCookie(req));res.clearCookie(auth.COOKIE,{...auth.cookieOptions(),maxAge:undefined}).json({success:true});}
    catch {res.status(503).json({error:'Sign-out could not be completed. Please retry.'});}
  });
  router.patch('/api/portal/profile',async(req,res)=> {
    const name=req.body?.name;
    if(typeof name!=='string'||!name.trim()||name.trim().length>80) return res.status(400).json({error:'Enter a name of 1–80 characters.'});
    try {await req.portalStore.profile(req.portalUser.id,name.trim());res.json({ok:true});}
    catch {res.status(503).json({error:'Your profile could not be saved. Please retry.'});}
  });
  router.all('/api/portal/satori/*',async(req,res)=> {
    const route=req.params[0];
    const methods = {today:['GET'],backlog:['GET'],history:['GET'],calendar:['GET'],tasks:['POST'],rollover:['POST']};
    const allowed=methods[route] || (/^tasks\/[a-zA-Z0-9-]{1,100}$/.test(route) ? ['PATCH','DELETE'] : []);
    if(!allowed.includes(req.method)) return res.status(404).json({error:'Not found.'});
    try {
      const query=new URL(req.originalUrl,'http://localhost').search;
      const response=await satori.request(req.portalUser.workspace_key,req.method,'/api/'+route+query,['GET','HEAD'].includes(req.method)?undefined:req.body);
      res.status(response.status).type('json').send(response.body);
    } catch {res.status(503).json({error:'Your Satori workspace is unavailable. Please retry or contact Ahern AI.'});}
  });
  return router;
}
module.exports = { createRouter, shell, login, document };
