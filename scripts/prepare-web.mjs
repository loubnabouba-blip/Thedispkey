// Kopieert de web-app (index.html, oefenfoto's, icons, ex/, m3d/) uit de repo-root naar www/
// voor de iOS-app. De service worker en het manifest zijn in de native app niet nodig.
// Daarna: npx cap sync ios
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="manifest"[^>]*>/g, '');
html = html.replace(/<script>[^<]*serviceWorker\.register[\s\S]*?<\/script>/g, '');
writeFileSync(join(out, 'index.html'), html);

for (const f of readdirSync(root)) if (f.endsWith('.webp')) cpSync(join(root, f), join(out, f));
for (const dir of ['icons', 'ex', 'm3d']) {
  if (existsSync(join(root, dir))) cpSync(join(root, dir), join(out, dir), { recursive: true });
}
console.log('www klaar');
