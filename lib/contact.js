const crypto = require('node:crypto');
const INTERESTS = new Set(['AI automation', 'Custom gaming PC', 'Professional workstation', 'Business local AI system', 'Website or custom app', 'Not sure yet']);
function validate(body = {}) {
  const fields = { name: 200, email: 200, business: 200, interest: 100, message: 4000 };
  const lead = {};
  for (const [key, max] of Object.entries(fields)) {
    if (body[key] != null && typeof body[key] !== 'string') throw new Error('Please check the form fields.');
    const text = (body[key] || '').trim();
    if (text.length > max) throw new Error(`${key === 'message' ? 'Your message' : 'A form field'} is too long (maximum ${max} characters).`);
    lead[key] = text;
  }
  if (!lead.name || !INTERESTS.has(lead.interest)) throw new Error('Please enter your name and choose a service.');
  if (!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(lead.email)) throw new Error('Please enter a valid email address.');
  if (body.requestId && !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId)) throw new Error('Please reload the form and try again.');
  return { lead, requestId: body.requestId || crypto.randomUUID() };
}
function rateLimit({ limit = 8, interval = 600000 } = {}) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, item] of clients) if (item.until <= now) clients.delete(key);
    const key = req.ip;
    let item = clients.get(key);
    if (!item) {
      if (clients.size >= 10000) return res.status(429).json({ error: 'Please try again shortly.' });
      item = { count: 0, until: now + interval }; clients.set(key, item);
    }
    if (++item.count > limit) return res.set('Retry-After', String(Math.ceil((item.until - now) / 1000))).status(429).json({ error: 'Please wait a few minutes before trying again, or call or text instead.' });
    next();
  };
}
function adminAuth(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  const expected = process.env.LEADS_DASHBOARD_PASSWORD;
  if (!expected || expected.length < 16) return res.status(404).send('Not found');
  if (process.env.NODE_ENV === 'production' && !req.secure) return res.status(403).send('HTTPS is required.');
  const auth = req.get('authorization') || '';
  const decoded = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString() : '';
  const hash = value => crypto.createHash('sha256').update(value).digest();
  if (!crypto.timingSafeEqual(hash(decoded), hash(`mike:${expected}`))) {
    return res.set('WWW-Authenticate', 'Basic realm="Ahern AI leads", charset="UTF-8"').status(401).send('Sign in to view inquiries.');
  }
  next();
}
module.exports = { validate, rateLimit, adminAuth };
