/* Discipline Key service worker: de app start direct en werkt offline. */
const V = 'dk-71609580c8';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
const EXS = ["ex/backsquat_0.webp", "ex/backsquat_1.webp", "ex/benchbb_0.webp", "ex/benchbb_1.webp", "ex/benchdb_0.webp", "ex/benchdb_1.webp", "ex/bridge_0.webp", "ex/bridge_1.webp", "ex/cablecrunch_0.webp", "ex/cablecrunch_1.webp", "ex/cablecurl_0.webp", "ex/cablecurl_1.webp", "ex/cablerow_0.webp", "ex/cablerow_1.webp", "ex/calfbw_0.webp", "ex/calfbw_1.webp", "ex/calfdb_0.webp", "ex/calfdb_1.webp", "ex/calfmachine_0.webp", "ex/calfmachine_1.webp", "ex/chestpress_0.webp", "ex/chestpress_1.webp", "ex/curldb_0.webp", "ex/curldb_1.webp", "ex/deadbug_0.webp", "ex/deadbug_1.webp", "ex/deadlift_0.webp", "ex/deadlift_1.webp", "ex/dips_0.webp", "ex/dips_1.webp", "ex/facepull_0.webp", "ex/facepull_1.webp", "ex/farmers_0.webp", "ex/farmers_1.webp", "ex/goblet_0.webp", "ex/goblet_1.webp", "ex/hangknee_0.webp", "ex/hangknee_1.webp", "ex/hipthrust_0.webp", "ex/hipthrust_1.webp", "ex/lateraldb_0.webp", "ex/lateraldb_1.webp", "ex/legcurl_0.webp", "ex/legcurl_1.webp", "ex/legpress_0.webp", "ex/legpress_1.webp", "ex/lungedb_0.webp", "ex/lungedb_1.webp", "ex/ohpbb_0.webp", "ex/ohpbb_1.webp", "ex/ohpdb_0.webp", "ex/ohpdb_1.webp", "ex/plank_0.webp", "ex/plank_1.webp", "ex/pulldown_0.webp", "ex/pulldown_1.webp", "ex/pullup_0.webp", "ex/pullup_1.webp", "ex/pushdown_0.webp", "ex/pushdown_1.webp", "ex/pushup_0.webp", "ex/pushup_1.webp", "ex/rdlbb_0.webp", "ex/rdlbb_1.webp", "ex/rdldb_0.webp", "ex/rdldb_1.webp", "ex/reversefly_0.webp", "ex/reversefly_1.webp", "ex/rowbb_0.webp", "ex/rowbb_1.webp", "ex/rowdb_0.webp", "ex/rowdb_1.webp", "ex/rower_0.webp", "ex/rower_1.webp", "ex/shoulderpress_0.webp", "ex/shoulderpress_1.webp", "ex/sledpull_0.webp", "ex/sledpull_1.webp", "ex/sledpush_0.webp", "ex/sledpush_1.webp", "ex/slrdl_0.webp", "ex/slrdl_1.webp", "ex/split_0.webp", "ex/split_1.webp", "ex/squatbw_0.webp", "ex/squatbw_1.webp", "ex/squatjump_0.webp", "ex/squatjump_1.webp", "ex/stepup_0.webp", "ex/stepup_1.webp", "ex/triext_0.webp", "ex/triext_1.webp", "ex/walklunge_0.webp", "ex/walklunge_1.webp"];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE.concat(EXS))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('dk-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* Eerst uit de cache (snel en offline), op de achtergrond verversen: een nieuwe versie staat na de volgende start klaar. */
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }))); return; }
  if (u.origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => {
    const net = fetch(r).then(res => { if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })
      .catch(() => hit || (r.mode === 'navigate' ? caches.match('index.html') : undefined));
    return hit || net;
  }));
});
