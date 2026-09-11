// Run privately in the hosting shell. The resulting URL grants one-time account
// activation for 24 hours; deliver it only to the intended account holder.
const auth=require('../lib/portal-auth');
async function main() {
  const store=auth.getStore();
  if(!store) throw new Error('Missing connection');
  try {
    const value=await store.setupAccount({email:process.env.PORTAL_USER_EMAIL,name:process.env.PORTAL_USER_NAME,workspace:process.env.PORTAL_USER_WORKSPACE,role:process.env.PORTAL_USER_ROLE || 'member'});
    const url=new URL('/portal/setup',process.env.SITE_URL || 'https://ahernai.com');
    url.hash=value;
    console.log('One-time setup link (expires in 24 hours):');
    console.log(url.href);
  } finally {store.client.close();}
}
main().catch(()=>{console.error('Account setup could not be created. Check account details and whether the account already exists.');process.exitCode=1;});
