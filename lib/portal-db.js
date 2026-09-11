const fs = require('node:fs');
const path = require('node:path');
function configuration() {
  const url=process.env.SATORI_DATABASE_URL;
  if(!url) return null;
  // Do not silently fall back to the website's unrelated Turso database.
  const parsed=new URL(url);
  if(!['libsql:','https:','file:'].includes(parsed.protocol)) throw new Error('Invalid Satori database URL');
  return {url,authToken:process.env.SATORI_AUTH_TOKEN};
}
function statements() {
  return fs.readFileSync(path.join(__dirname,'portal-schema.sql'),'utf8').replace(/^--.*$/gm,'').split(';').map(sql=>sql.trim()).filter(Boolean);
}
module.exports = { configuration, statements };
