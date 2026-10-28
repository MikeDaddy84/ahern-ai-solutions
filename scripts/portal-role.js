// Portal role check and change. Run privately in the hosting shell.
//   npm run portal:role                       → list accounts (email, name, role, status)
//   PORTAL_USER_EMAIL=x PORTAL_USER_ROLE=employee npm run portal:role
//                                             → change that account's role and sign it out everywhere
// Never prints password hashes, sessions or workspace keys.
const auth=require('../lib/portal-auth');
const ROLES=['owner','employee','client','member'];
async function main() {
  const store=auth.getStore();
  if(!store) throw new Error('Missing connection');
  try {
    await store.prepare();
    const email=(process.env.PORTAL_USER_EMAIL||'').trim().toLowerCase(), role=process.env.PORTAL_USER_ROLE||'';
    if(email || role) {
      if(!email || !ROLES.includes(role)) throw new Error('Set PORTAL_USER_EMAIL and PORTAL_USER_ROLE (owner, employee, client or member).');
      const r=await store.client.execute({sql:'UPDATE portal_users SET role=? WHERE email=?',args:[role,email]});
      if(!r.rowsAffected) throw new Error('No account with that email.');
      await store.client.execute({sql:'DELETE FROM portal_sessions WHERE user_id IN (SELECT id FROM portal_users WHERE email=?)',args:[email]});
      console.log(`Role for ${email} is now ${role}. Their existing sessions were signed out.`);
    }
    const {rows}=await store.client.execute('SELECT email,name,role,disabled FROM portal_users ORDER BY role,email');
    console.table(rows.map(r=>({email:r.email,name:r.name,role:r.role,status:Number(r.disabled)?'not activated':'active'})));
  } finally {store.client.close();}
}
main().catch(e=>{console.error(e.message && !/SQLITE|libsql|fetch/i.test(e.message) ? e.message : 'Roles could not be read. Check the portal database configuration.');process.exitCode=1;});
