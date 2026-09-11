// Run privately with environment variables; never pass passwords on the command line.
const auth = require('../lib/portal-auth');
async function main() {
  const store=auth.getStore();
  if(!store) throw new Error('Configure the existing Satori connection first.');
  try { await store.provision({email:process.env.PORTAL_USER_EMAIL,name:process.env.PORTAL_USER_NAME,password:process.env.PORTAL_USER_PASSWORD,workspace:process.env.PORTAL_USER_WORKSPACE,role:process.env.PORTAL_USER_ROLE || 'member'}); console.log('Portal account saved. Existing sessions for that account have been revoked.'); }
  finally { store.client.close(); }
}
main().catch(() => { console.error('Account could not be saved. Check database configuration, account fields, unique workspace, and a password of 14–256 characters.'); process.exitCode=1; });
