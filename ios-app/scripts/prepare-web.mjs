// Kopieert de web-app (index.html, icons, ex/*.webp, m3d/) uit de repo-root naar ios-app/www.
// De service worker en het manifest zijn in de native app niet nodig.
import { cpSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..'), out = join(here, '..', 'www');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="manifest"[^>]*>/g, '');
html = html.replace(/<script>[^<]*serviceWorker\.register[\s\S]*?<\/script>/g, '');
writeFileSync(join(out, 'index.html'), html);
for (const f of readdirSync(root)) if (f.endsWith('.webp')) cpSync(join(root, f), join(out, f));
cpSync(join(root, 'icons'), join(out, 'icons'), { recursive: true });
try { cpSync(join(root, 'ex'), join(out, 'ex'), { recursive: true }); } catch (e) {}
cpSync(join(root, 'm3d'), join(out, 'm3d'), { recursive: true }); // 3D-spierkaart (model + three.js)
console.log('www klaar');
