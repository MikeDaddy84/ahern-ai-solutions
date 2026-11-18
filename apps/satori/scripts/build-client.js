import { build, transform } from 'esbuild';
import postcss from 'postcss';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../src/client/', import.meta.url));
const out = fileURLToPath(new URL('../dist/public/', import.meta.url));
const base = '/portal/satori-assets/';
await mkdir(path.join(out, 'assets'), {recursive:true});
await cp(path.join(root, 'public'), out, {recursive:true});

async function asset(name, extension, bytes) {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0,16);
  const filename = `${name}-${hash}.${extension}`;
  await writeFile(path.join(out, 'assets', filename), bytes);
  return base + 'assets/' + filename;
}

const bundle = await build({entryPoints:[path.join(root,'src/main.ts')], bundle:true,
  format:'esm', platform:'browser', target:'es2022', minify:true, write:false});
const script = await asset('index','js',bundle.outputFiles[0].contents);
const sheet = postcss.parse(await readFile(path.join(root,'src/styles/main.css'),'utf8'));
sheet.walkRules(rule => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
  if (rule.selector.includes('.satori-host')) return;
  rule.selectors = rule.selectors.map(s => [':root','html','body'].includes(s) ? '.satori-host' : '.satori-host ' + s);
});
sheet.walkDecls(decl => {
  decl.value = decl.value.replaceAll("url('/fonts/", "url('" + base + "fonts/");
});
const css = await transform(sheet.toString(), {loader:'css', minify:true, target:'es2022'});
const style = await asset('index','css',css.code);
let html = await readFile(path.join(root,'index.html'),'utf8');
for (const [name,ext] of [['manifest','json'],['favicon','svg']]) {
  const filename = name + '.' + ext;
  html = html.replace('href="/'+filename+'"', 'href="'+await asset(name,ext,await readFile(path.join(root,filename)))+'"');
}
html = html.replace('<script type="module" src="/src/main.ts"></script>','')
  .replace('href="/src/styles/main.css"', 'href="'+style+'"')
  .replace('</head>', '<script type="module" src="'+script+'"></script>\n</head>');
await writeFile(path.join(out,'index.html'),html);
