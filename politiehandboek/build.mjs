// Genereert de losse pagina's (leren/, spiek/, index.html) uit data/*.js.
// Gebruik: node build.mjs            -> schrijft naar de map zelf
//          node build.mjs --fragment <bestand>   -> schrijft alleen de hub als fragment (zonder doctype/head/body), voor het publiceren als artifact
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} };
vm.createContext(ctx);
const files = fs.readdirSync(path.join(dir, "data")).filter((f) => /^m\d+\.js$/.test(f)).sort();
for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, "data", f), "utf8"), ctx);
const MODS = ctx.window.MODS.sort((a, b) => a.nr - b.nr);

const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">';
const head = (title, css) => `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${fonts}
<link rel="stylesheet" href="${css}">
</head>`;

function page(M, mode) {
  const label = mode === "leren" ? "Leerdocument" : "Spiekbriefje";
  return `${head(`${M.titel} · ${label}`, "../engine.css")}
<body class="r${M.reeks}">
<div id="app"></div>
<script>window.MODE="${mode}"</script>
<script src="../data/${M.id}.js"></script>
<script src="../engine.js"></script>
</body>
</html>
`;
}

function hub(fragment) {
  const scripts = MODS.map((M) => `<script src="data/${M.id}.js"></script>`).join("\n");
  if (fragment) {
    return `<title>Politiehandboek</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<link rel="stylesheet" href="engine.css">
<div id="app"></div>
<script>window.MODE="hub"</script>
${scripts}
<script src="engine.js"></script>
`;
  }
  return `${head("Politiehandboek", "engine.css")}
<body>
<div id="app"></div>
<script>window.MODE="hub"</script>
${scripts}
<script src="engine.js"></script>
</body>
</html>
`;
}

const fi = process.argv.indexOf("--fragment");
if (fi > -1) {
  fs.writeFileSync(process.argv[fi + 1], hub(true));
  console.log("fragment geschreven:", process.argv[fi + 1]);
} else {
  for (const M of MODS) {
    fs.writeFileSync(path.join(dir, "leren", `${M.id}.html`), page(M, "leren"));
    fs.writeFileSync(path.join(dir, "spiek", `${M.id}.html`), page(M, "spiek"));
  }
  fs.writeFileSync(path.join(dir, "index.html"), hub(false));
  console.log(`${MODS.length} onderdelen: ${MODS.length * 2} pagina's + index.html geschreven`);
}
