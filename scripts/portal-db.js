const {createClient}=require('@libsql/client');
const {configuration,statements}=require('../lib/portal-db');
async function main() {
  const config=configuration();
  if(!config) throw new Error('Configure the existing Satori connection first.');
  const client=createClient(config);
  try {
    await client.batch(statements(),'write');
    const result=await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('portal_users','portal_sessions','portal_satori_tasks','portal_satori_meta','portal_satori_day_log') ORDER BY name");
    if(result.rows.length!==5) throw new Error('Incomplete portal schema');
    console.log('Verified all five portal tables in the configured Satori database. Legacy tables were not changed.');
  } finally {client.close();}
}
main().catch(()=> {console.error('Portal tables could not be verified. Check SATORI_DATABASE_URL and SATORI_AUTH_TOKEN privately.');process.exitCode=1;});
