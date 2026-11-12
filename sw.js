/* Discipline Key service worker: de app start direct en werkt offline. */
const V = 'dk-3d-20261112cart2';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'gm/config.js', 'gm/gamify.js', 'gm/gamify.css', 'gm/supabase.js', 'gm/591.supabase.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
const EXS = ["ex/backsquat_0.webp", "ex/backsquat_1.webp", "ex/benchbb_0.webp", "ex/benchbb_1.webp", "ex/benchdb_0.webp", "ex/benchdb_1.webp", "ex/bridge_0.webp", "ex/bridge_1.webp", "ex/cablecrunch_0.webp", "ex/cablecrunch_1.webp", "ex/cablecurl_0.webp", "ex/cablecurl_1.webp", "ex/cablerow_0.webp", "ex/cablerow_1.webp", "ex/calfbw_0.webp", "ex/calfbw_1.webp", "ex/calfdb_0.webp", "ex/calfdb_1.webp", "ex/calfmachine_0.webp", "ex/calfmachine_1.webp", "ex/chestpress_0.webp", "ex/chestpress_1.webp", "ex/curldb_0.webp", "ex/curldb_1.webp", "ex/d_bb.webp", "ex/d_beg.webp", "ex/d_hx.webp", "ex/d_pl.webp", "ex/d_run.webp", "ex/deadbug_0.webp", "ex/deadbug_1.webp", "ex/deadlift_0.webp", "ex/deadlift_1.webp", "ex/dips_0.webp", "ex/dips_1.webp", "ex/facepull_0.webp", "ex/facepull_1.webp", "ex/farmers_0.webp", "ex/farmers_1.webp", "ex/goblet_0.webp", "ex/goblet_1.webp", "ex/hangknee_0.webp", "ex/hangknee_1.webp", "ex/hipthrust_0.webp", "ex/hipthrust_1.webp", "ex/lateraldb_0.webp", "ex/lateraldb_1.webp", "ex/legcurl_0.webp", "ex/legcurl_1.webp", "ex/legpress_0.webp", "ex/legpress_1.webp", "ex/lungedb_0.webp", "ex/lungedb_1.webp", "ex/ohpbb_0.webp", "ex/ohpbb_1.webp", "ex/ohpdb_0.webp", "ex/ohpdb_1.webp", "ex/plank_0.webp", "ex/plank_1.webp", "ex/pulldown_0.webp", "ex/pulldown_1.webp", "ex/pullup_0.webp", "ex/pullup_1.webp", "ex/pushdown_0.webp", "ex/pushdown_1.webp", "ex/pushup_0.webp", "ex/pushup_1.webp", "ex/rdlbb_0.webp", "ex/rdlbb_1.webp", "ex/rdldb_0.webp", "ex/rdldb_1.webp", "ex/reversefly_0.webp", "ex/reversefly_1.webp", "ex/rowbb_0.webp", "ex/rowbb_1.webp", "ex/rowdb_0.webp", "ex/rowdb_1.webp", "ex/rower_0.webp", "ex/rower_1.webp", "ex/shoulderpress_0.webp", "ex/shoulderpress_1.webp", "ex/sledpull_0.webp", "ex/sledpull_1.webp", "ex/sledpush_0.webp", "ex/sledpush_1.webp", "ex/slrdl_0.webp", "ex/slrdl_1.webp", "ex/split_0.webp", "ex/split_1.webp", "ex/squatbw_0.webp", "ex/squatbw_1.webp", "ex/squatjump_0.webp", "ex/squatjump_1.webp", "ex/stepup_0.webp", "ex/stepup_1.webp", "ex/triext_0.webp", "ex/triext_1.webp", "ex/walklunge_0.webp", "ex/walklunge_1.webp"];
/* 3D-spierkaart: groot (ca. 3 MB), daarom los van de installatie op de achtergrond opgehaald. */
const M3D = ['m3d/three.min.js', 'm3d/model.js'];
/* Receptfoto's (ca. 3 MB): net als de 3D-kaart op de achtergrond ophalen, zodat de installatie snel blijft. */
const FOOD = ["food/d1.webp", "food/d10.webp", "food/d11.webp", "food/d12.webp", "food/d2.webp", "food/d3.webp", "food/d4.webp", "food/d5.webp", "food/d6.webp", "food/d7.webp", "food/d8.webp", "food/d9.webp", "food/l1.webp", "food/l10.webp", "food/l11.webp", "food/l12.webp", "food/l2.webp", "food/l3.webp", "food/l4.webp", "food/l5.webp", "food/l6.webp", "food/l7.webp", "food/l8.webp", "food/l9.webp", "food/n1.webp", "food/n10.webp", "food/n11.webp", "food/n12.webp", "food/n13.webp", "food/n14.webp", "food/n15.webp", "food/n16.webp", "food/n17.webp", "food/n18.webp", "food/n19.webp", "food/n2.webp", "food/n20.webp", "food/n21.webp", "food/n22.webp", "food/n23.webp", "food/n3.webp", "food/n4.webp", "food/n5.webp", "food/n6.webp", "food/n7.webp", "food/n8.webp", "food/n9.webp", "food/o1.webp", "food/o10.webp", "food/o11.webp", "food/o12.webp", "food/o2.webp", "food/o3.webp", "food/o4.webp", "food/o5.webp", "food/o6.webp", "food/o7.webp", "food/o8.webp", "food/o9.webp", "food/t1.webp", "food/t10.webp", "food/t11.webp", "food/t12.webp", "food/t2.webp", "food/t3.webp", "food/t4.webp", "food/t5.webp", "food/t6.webp", "food/t7.webp", "food/t8.webp", "food/t9.webp"];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => { c.addAll(M3D).catch(() => {}); c.addAll(FOOD).catch(() => {}); return Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })))).then(() => c.addAll(EXS)); }).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('dk-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* Pagina, scripts en stijl: eerst van het netwerk (met internet altijd de nieuwste versie), offline of bij een trage
   verbinding (na 4 seconden) uit de cache. Afbeeldingen en de 3D-kaart: eerst uit de cache (snel), op de achtergrond verversen. */
const FRESH = /\.(html|js|css|webmanifest)$|\/$/;
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }))); return; }
  if (u.origin !== location.origin) return;
  const put = res => { if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; };
  if (r.mode === 'navigate' || (FRESH.test(u.pathname) && !u.pathname.includes('/m3d/'))) {
    const cached = () => caches.match(r, { ignoreSearch: true }).then(hit => hit || (r.mode === 'navigate' ? caches.match('index.html') : undefined));
    e.respondWith(new Promise(resolve => {
      let done = false; const fin = v => { if (!done && v) { done = true; resolve(v); } };
      const t = setTimeout(() => cached().then(fin), 4000);
      fetch(r, { cache: 'no-cache' }).then(put).then(res => { clearTimeout(t); fin(res); }).catch(() => { clearTimeout(t); cached().then(hit => { fin(hit); if (!done) resolve(Response.error()); }); });
    }));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => {
    const net = fetch(r).then(put).catch(() => hit);
    return hit || net;
  }));
});
