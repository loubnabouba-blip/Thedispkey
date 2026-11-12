/* =====================================================================
   The Discipline Key: gamificatie v2
   - Supabase: account (e-mailcode), eenmalige migratie van localStorage,
     synchronisatie van de app-state, streak/Sparks/kisten via server-RPC's.
   - Streak-urgentie, herstel-quest, kist-reveal, winkel en cosmetica.
   - App-brede micro-interacties (tap-feedback, ripple, vinkjes die "poppen").
   Dit bestand wordt ná het hoofdscript geladen (het gebruikt A, F, S, ui en
   de helpers daaruit) en start zichzelf onderaan met GM.init().
   ===================================================================== */
const GM = { cfg: window.DK_SUPABASE || {}, sb: null, user: null, on: false, snap: null, shop: [], days: {}, claiming: false, queue: [], pushT: null, claimT: null, err: null };
const GM_ERR = {
  'gm:insufficient_sparks': 'Je hebt nog niet genoeg Sparks.', 'gm:freezes_full': 'Je beschermers zitten al vol.',
  'gm:rank_too_low': 'Dit item komt vrij bij een hogere rang.', 'gm:already_owned': 'Dit heb je al.',
  'gm:no_repair_available': 'Er valt niets meer te herstellen.', 'gm:not_for_sale': 'Dit item vind je alleen in kisten.',
  'gm:day_out_of_window': 'Die dag kan niet meer worden geclaimd.', 'gm:not_won': 'Deze dag telt nog niet als gewonnen.',
  'gm:not_owned': 'Dit item heb je nog niet.', 'gm:email_unverified': 'Bevestig eerst je e-mailadres.', 'gm:chest_not_found': 'Deze kist bestaat niet meer.'
};
const GM_TIER = { brons: 'Bronzen kist', zilver: 'Zilveren kist', goud: 'Gouden kist' };
const GM_REASON = { welkom: 'Welkomstkist', mijlpaal: 'Mijlpaalkist', comeback: 'Comeback-kist', toeval: 'Verrassingskist', migratie: 'Welkom terug' };
const GM_PILLAR = { train: ['Training', 'gotoTraining'], steps: ['Stappen', 'stepsAsk'], protein: ['Eiwit', 'gotoFood'], check: ['Check-in', 'checkAsk'] };
const GM_MS = [7, 14, 21, 30];
const gmReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const gmSleep = ms => new Promise(r => setTimeout(r, ms));
const gmEnabled = () => !!(GM.cfg.url && GM.cfg.key);
const gmReturnUrl = () => /^https:$/.test(location.protocol) ? location.origin + location.pathname : undefined;
const gmTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam'; } catch (e) { return 'Europe/Amsterdam'; } };
const gmNum = n => Number(n || 0).toLocaleString('nl-NL');
const gmSpark = '<span class="gm-sp" aria-hidden="true">✦</span>';

/* ---------- Supabase ---------- */
function gmLoadLib() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve();
  return GM._lib || (GM._lib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'gm/supabase.js'; s.onload = res; s.onerror = () => { GM._lib = null; rej(new Error('lib')); }; document.head.appendChild(s); }));
}
async function gmClient() {
  if (GM.sb) return GM.sb;
  await gmLoadLib();
  GM.sb = window.supabase.createClient(GM.cfg.url, GM.cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !!GM._urlAuth, storageKey: 'dk-auth' } });
  return GM.sb;
}
async function gmRpc(fn, args) {
  const { data, error } = await GM.sb.rpc(fn, args || {});
  if (error) { const m = String(error.message || ''); const e = new Error(GM_ERR[m] || (m.startsWith('gm:') ? m : 'Geen verbinding met de server.')); e.code = m; throw e; }
  return data;
}

/* Link uit een Supabase-mail: de app (hash-routing) opent met #access_token=…&type=signup|magiclink|recovery
   of met #error=…. Sessie oppakken, de hash opruimen en naar de juiste stap gaan. */
async function gmFromMailLink() {
  const h = location.hash || '';
  if (!/access_token=|error_description=/.test(h)) return false;
  const q = new URLSearchParams(h.slice(1)), type = q.get('type'), err = q.get('error_description') || q.get('error');
  GM._urlAuth = true;
  try { history.replaceState(null, '', location.pathname + location.search + '#beloningen'); } catch (e) {}
  route = 'beloningen';
  if (err) { ui.gmStep = 'login'; ui.gmMsg = 'Deze link is verlopen of al gebruikt. Log in, of vraag een nieuwe mail aan.'; ui.gmMsgOk = false; render(); return true; }
  try {
    const sb = await gmClient(); const { data } = await sb.auth.getSession();
    const u = data && data.session && data.session.user; if (!u) throw new Error('geen sessie');
    S.gmHadAccount = true; gmPersist();
    if (type === 'recovery') { GM.user = u; ui.gmEmail = u.email; ui.gmStep = 'newpass'; ui.gmMsg = ''; render(); return true; }
    ui.gmStep = null; ui.gmMsg = '';
    await gmOnLogin(u, true);
    toast(type === 'signup' ? 'E-mailadres bevestigd. Welkom!' : 'Ingelogd.');
  } catch (e) { ui.gmStep = 'login'; ui.gmMsg = 'Inloggen via de link lukte niet. Log in met je e-mailadres en wachtwoord.'; render(); }
  return true;
}

GM.init = async function () {
  gmFx();
  if (!gmEnabled()) return;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && GM.on) gmRefresh(); });
  if (await gmFromMailLink()) return;
  let has = false; try { has = !!localStorage.getItem('dk-auth'); } catch (e) {}
  if (!has) return;                       // geen sessie: bibliotheek pas laden bij inloggen
  try {
    const sb = await gmClient(); const { data } = await sb.auth.getSession();
    if (data && data.session) await gmOnLogin(data.session.user, false);
  } catch (e) { GM.err = e.message; }
};

async function gmOnLogin(user, fresh) {
  GM.user = user;
  let r;
  try { r = await gmRpc('gm_reconcile', { p_tz: gmTz() }); }
  catch (e) { if (e.code === 'gm:email_unverified') { ui.gmEmail = user.email; ui.gmStep = 'verify'; try { await GM.sb.auth.signOut(); } catch (x) {} GM.user = null; render(); return; } throw e; }
  gmSetSnap(r.snapshot);
  const early = (r.events || []).slice();
  if (!GM.snap.migrated) {
    // eerste login na de update: lokale stand eenmalig overzetten
    const loc = gmLocalStreak(), state = gmSyncable();
    const m = await gmRpc('gm_migrate_local', { p_tz: gmTz(), p_state: S.profile ? state : null, p_current: loc.current, p_best: loc.best, p_lifetime: loc.lifetime, p_freezes: loc.freezes, p_last_won: loc.lastWon });
    gmSetSnap(m.snapshot);
    S.cloud = { uid: user.id, rev: 1, dirty: false };
    if (!m.already && S.profile) gmPersist();
    if (!m.already && (m.events || []).length) GM.queue.push(() => gmWelcome(m.events));
  } else {
    await gmPull(fresh);
  }
  GM.on = true;
  gmLoadShop(); gmLoadDays(); gmLoadProfile();
  gmApplyCosmetics(); render();
  if (early.length) gmPresent(early);
  gmAutoClaim();
  gmNext();
}
async function gmRefresh() {
  try { const r = await gmRpc('gm_reconcile', { p_tz: gmTz() }); gmSetSnap(r.snapshot); gmLoadDays(); render(); if ((r.events || []).length) gmPresent(r.events); gmAutoClaim(); } catch (e) { GM.err = e.message; }
}
function gmSetSnap(s) { if (!s) return; GM.snap = s; if (typeof rwVer !== 'undefined') rwVer++; gmApplyCosmetics(); }
async function gmLoadShop() { try { const { data } = await GM.sb.from('shop_items').select('*').order('sort'); GM.shop = data || []; gmApplyCosmetics(); render(); } catch (e) {} }
async function gmLoadDays() {
  try {
    const T = GM.snap.today, { data } = await GM.sb.from('streak_events').select('kind,local_day').gte('local_day', addDays(T, -40));
    const m = {}; (data || []).forEach(e => { if (e.kind === 'day_won') m[e.local_day] = 'won'; else if (e.kind === 'freeze_used' && !m[e.local_day]) m[e.local_day] = 'frozen'; });
    GM.days = m; rwVer++; if (route === 'beloningen' || route === 'home') render();
  } catch (e) {}
}

/* Lokale stand zoals de oude, afgeleide berekening hem ziet (voor de migratie). */
function gmLocalStreak() {
  GM._local = true; let R; try { rwVer++; R = rewards(); } finally { GM._local = false; rwVer++; }
  const won = Object.keys(R.dayInfo).filter(d => R.dayInfo[d].st === 'won').sort();
  return { current: R.m.streak, best: R.m.bestStreak, lifetime: won.length, freezes: R.freezes, lastWon: won.length ? won[won.length - 1] : null };
}
/* Aangeroepen vanuit rewards(): de server is leidend voor streak, record en beschermers. */
function gmOverlay(dayInfo) {
  if (!GM.on || !GM.snap || GM._local) return null;
  const st = GM.snap.streak, T = today(), first = Object.keys(GM.days).sort()[0];
  // het server-logboek is leidend voor afgehandelde dagen (gewonnen, beschermd of gemist)
  if (first) Object.keys(dayInfo).forEach(d => { if (d < first || d >= T || !st.last_day || d > st.last_day) return; dayInfo[d].st = GM.days[d] || 'miss'; });
  // vandaag lokaal gewonnen maar nog niet bij de server: alvast meetellen
  const x = dayInfo[T], localWin = x && x.sc >= 3 && !st.won_today && (!st.last_day || st.last_day < T);
  return { current: st.current + (localWin ? 1 : 0), best: Math.max(st.best, st.current + (localWin ? 1 : 0)), freezes: st.freezes };
}

/* ---------- Synchronisatie ---------- */
function gmSyncable() {
  const o = JSON.parse(JSON.stringify(S));
  // privacygevoelig of groot: blijft op dit toestel
  delete o.lock; delete o.cloud; delete o.rw; delete o.keyDay; o.photos = []; o.recipePhotos = {};
  return o;
}
function gmPersist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function gmAfterSave() {
  if (!GM.on) return;
  if (S.cloud) S.cloud.dirty = true;
  clearTimeout(GM.pushT); GM.pushT = setTimeout(gmPush, 2500);
  clearTimeout(GM.claimT); GM.claimT = setTimeout(gmAutoClaim, 900);
}
async function gmPush() {
  if (!GM.on || !S.profile) return;
  const rev = Date.now();
  try {
    const { error } = await GM.sb.from('user_state').upsert({ user_id: GM.user.id, state: gmSyncable(), client_rev: rev });
    if (error) throw error;
    S.cloud = { uid: GM.user.id, rev, dirty: false, at: new Date().toISOString() }; gmPersist();
  } catch (e) { GM.err = 'Synchroniseren mislukt. We proberen het later opnieuw.'; }
}
async function gmPull(fresh) {
  const { data } = await GM.sb.from('user_state').select('state,client_rev,updated_at').maybeSingle();
  const mine = S.cloud && S.cloud.uid === GM.user.id;
  if (!data) { S.cloud = { uid: GM.user.id, rev: 0, dirty: true }; if (S.profile) gmPush(); return; }
  if (mine && data.client_rev <= (S.cloud.rev || 0)) { if (S.cloud.dirty) gmPush(); return; }
  if (!S.profile || (mine && !S.cloud.dirty)) { gmApplyState(data); return; }
  // beide kanten hebben eigen wijzigingen: de gebruiker kiest
  GM._conflict = data;
  GM.queue.unshift(() => modal(`<div class="gm-sheet"><h3>Welke gegevens wil je houden?</h3><p class="sub">Je account bevat al gegevens van een ander toestel (laatst bijgewerkt ${esc(new Date(data.updated_at).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }))}). Dit toestel heeft ook eigen gegevens.</p>
    <div class="btns end"><button class="btn" data-a="gmKeepCloud">Account-gegevens gebruiken</button><button class="btn ghost" data-a="gmKeepLocal">Dit toestel gebruiken</button></div><p class="fine">Foto's en je pincode blijven altijd alleen op dit toestel.</p></div>`));
}
function gmApplyState(row) {
  const keep = { photos: S.photos, recipePhotos: S.recipePhotos, lock: S.lock, rw: S.rw, keyDay: S.keyDay, theme: S.theme };
  S = Object.assign(defaultState(), row.state, keep, { cloud: { uid: GM.user.id, rev: row.client_rev, dirty: false, at: row.updated_at } });
  gmPersist(); rwVer++;
}
A.gmKeepCloud = () => { closeModal(); if (GM._conflict) gmApplyState(GM._conflict); GM._conflict = null; render(); toast('Account-gegevens geladen.'); gmNext(); };
A.gmKeepLocal = () => { closeModal(); GM._conflict = null; S.cloud = { uid: GM.user.id, rev: 0, dirty: true }; gmPush(); toast('Dit toestel is nu leidend.'); gmNext(); };

/* ---------- Dagen claimen ---------- */
async function gmAutoClaim() {
  if (!GM.on || !GM.snap || GM.claiming || !S.profile) return;
  const st = GM.snap.streak, T = GM.snap.today, Y = addDays(T, -1), days = [];
  if (!st.won_today && !st.won_yesterday && (!st.last_day || Y > st.last_day)) days.push(Y);
  if (!st.won_today && (!st.last_day || st.last_day < T)) days.push(T);
  const todo = days.filter(d => rwScore(rwPillars(d)) >= 3);
  if (!todo.length) return;
  GM.claiming = true; const evs = [];
  try {
    for (const d of todo) {
      const p = rwPillars(d);
      const r = await gmRpc('gm_claim_day', { p_day: d, p_pillars: { train: !!p.train, rest: !!p.rest, steps: !!p.steps, protein: !!p.protein, check: !!p.check } });
      gmSetSnap(r.snapshot); evs.push(...(r.events || []));
    }
  } catch (e) { GM.err = e.message; } finally { GM.claiming = false; }
  if (evs.length) { gmLoadDays(); render(); gmPresent(evs); }
}

/* ---------- Gebeurtenissen tonen (één voor één, nooit door elkaar) ---------- */
function gmPresent(evs) {
  const sp = evs.filter(e => e.type === 'sparks').reduce((a, e) => a + e.amount, 0);
  const chests = evs.filter(e => e.type === 'chest'), broken = evs.find(e => e.type === 'streak_broken'), fixed = evs.find(e => e.type === 'repair_completed');
  const ms = evs.find(e => e.type === 'milestone'), frz = evs.find(e => e.type === 'freeze_earned'), used = evs.find(e => e.type === 'freeze_used'), prog = evs.find(e => e.type === 'repair_progress');
  if (used) GM.queue.push(gmStep(() => toast(`Je beschermer 🧊 ving ${used.days > 1 ? used.days + ' dagen' : 'een gemiste dag'} op. Je reeks loopt door.`), 1600));
  if (broken) GM.queue.push(() => gmBrokenModal(broken));
  if (fixed) GM.queue.push(() => gmFixedModal(fixed));
  if (sp) GM.queue.push(gmStep(() => gmFly(sp), 1100));
  if (prog) GM.queue.push(gmStep(() => toast(`Herstel-quest: ${prog.won} van ${prog.needed}. Nog ${prog.needed - prog.won} dag en je reeks komt terug.`), 1600));
  if (frz) GM.queue.push(gmStep(() => toast(frz.why === 'start' ? 'Je eerste streakbeschermer 🧊: hij vangt één gemiste dag op.' : 'Streakbeschermer verdiend 🧊'), 1600));
  if (chests.length) GM.queue.push(() => gmChestModal(chests[0].id, ms ? `${ms.n} dagen op rij!` : null));
  gmNext();
}
function gmNext(delay) {
  clearTimeout(GM._wait);
  if (delay) { GM._wait = setTimeout(() => gmNext(), delay); return; }
  if ($('#modal-root .overlay')) { GM._wait = setTimeout(() => gmNext(), 700); return; }
  const f = GM.queue.shift(); if (!f) return;
  f(); GM._wait = setTimeout(() => gmNext(), f.gap || 700);
}
const gmStep = (fn, gap) => (fn.gap = gap, fn);
A.gmNext = () => { closeModal(); gmNext(160); };

function gmFly(n) {
  hap('ok');
  let el = $('#gmfly'); if (!el) { el = document.createElement('div'); el.id = 'gmfly'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.innerHTML = `${gmSpark}+${n} <small>Sparks</small>`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  if (!gmReduced()) for (let i = 0; i < 7; i++) {
    const c = document.createElement('i'); c.className = 'gm-coin'; c.textContent = '✦';
    c.style.setProperty('--dx', ((Math.random() - .5) * 160).toFixed(0) + 'px'); c.style.setProperty('--dy', (-40 - Math.random() * 90).toFixed(0) + 'px'); c.style.animationDelay = (i * 45) + 'ms';
    el.appendChild(c);
  }
  $$('[data-gmwallet]').forEach(w => { w.classList.remove('gm-bump'); void w.offsetWidth; w.classList.add('gm-bump'); });
}

function gmBrokenModal(e) {
  const st = GM.snap.streak, rp = st.repair;
  const body = rp ? `<p>Je reeks van <b>${e.lost} dagen</b> is gepauzeerd, niet weg.</p>
    <div class="gm-quest"><b>Herstel-quest</b><span>Win ${rp.needed} dagen vóór ${gmDeadline(rp.deadline)} en je krijgt je ${e.lost} dagen terug, plus alles wat je erbij wint.</span>${gmQuestDots(rp)}</div>
    <p class="sub">Of herstel direct voor ${gmSpark}${rp.cost}. Je hebt er ${gmNum(GM.snap.sparks)}.</p>`
    : `<p>Je reeks van <b>${e.lost} ${e.lost === 1 ? 'dag' : 'dagen'}</b> is gestopt. Dat hoort erbij.</p>`;
  modal(`<div class="gm-sheet gm-broken"><div class="gm-ember" aria-hidden="true">🔥</div><h2 class="disp">Nieuwe kans</h2>${body}
    <p class="gm-life"><b>${gmNum(st.lifetime_won)}</b> gewonnen dagen staan op je naam. Die raak je nooit kwijt.</p>
    <div class="btns end">${rp ? `<button class="btn" data-a="gmNext">Ik ga ervoor</button>${GM.snap.sparks >= rp.cost ? `<button class="btn ghost" data-a="gmRepair">Herstel voor ✦${rp.cost}</button>` : ''}` : '<button class="btn" data-a="gmNext">Nieuwe reeks starten</button>'}</div></div>`);
}
function gmFixedModal(e) {
  hap('ok'); modal(`<div class="gm-sheet cel"><div class="gm-flame-big heat-${gmHeat(e.current)}" aria-hidden="true">🔥</div><h2 class="disp">Reeks hersteld</h2><p>Je ${e.restored} dagen zijn terug. Nieuwe stand: <b>${e.current} dagen</b>.</p><div class="btns end"><button class="btn" data-a="gmNext">Door!</button></div></div>`);
  rwConfetti();
}
function gmWelcome(evs) {
  const sp = evs.filter(e => e.type === 'sparks').reduce((a, e) => a + e.amount, 0), ch = evs.find(e => e.type === 'chest');
  modal(`<div class="gm-sheet cel"><div class="gm-coinstack" aria-hidden="true">✦</div><h2 class="disp">Je gegevens zijn bewaard</h2>
    <p>Je trainingen, voeding en streak staan nu veilig in je account en gaan mee naar elk toestel. Voor je trouw tot nu toe krijg je er <b>${gmSpark}${sp}</b> en een gouden kist bij.</p>
    <p class="sub">Sparks besteed je aan beschermers, vlammen, orbits en kleuren.</p>
    <div class="btns end">${ch ? `<button class="btn" data-a="gmChestGo" data-id="${ch.id}">Open je kist</button>` : '<button class="btn" data-a="gmNext">Top</button>'}</div></div>`);
}
A.gmChestGo = d => { closeModal(); gmChestModal(d.id, null); };

/* ---------- Kist: anticipatie -> open -> reveal ---------- */
function gmChestSvg(tier) {
  return `<svg class="gmc-svg" viewBox="0 0 160 140" aria-hidden="true">
   <defs><linearGradient id="gmcb-${tier}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gmc-hi)"/><stop offset="1" stop-color="var(--gmc-lo)"/></linearGradient></defs>
   <g class="gmc-body"><rect x="18" y="62" width="124" height="66" rx="12" fill="url(#gmcb-${tier})"/><rect x="18" y="62" width="124" height="66" rx="12" fill="none" stroke="var(--gmc-rim)" stroke-width="4"/>
     <rect x="70" y="62" width="20" height="66" fill="var(--gmc-rim)" opacity=".55"/><rect x="66" y="74" width="28" height="24" rx="6" fill="var(--gmc-rim)"/><circle cx="80" cy="84" r="5" fill="#0B1220"/><rect x="78" y="86" width="4" height="8" rx="2" fill="#0B1220"/></g>
   <g class="gmc-lid"><path d="M18 64 V46 a24 24 0 0 1 24 -24 h76 a24 24 0 0 1 24 24 V64 Z" fill="url(#gmcb-${tier})"/><path d="M18 64 V46 a24 24 0 0 1 24 -24 h76 a24 24 0 0 1 24 24 V64 Z" fill="none" stroke="var(--gmc-rim)" stroke-width="4"/><rect x="70" y="22" width="20" height="42" fill="var(--gmc-rim)" opacity=".55"/></g></svg>`;
}
function gmChestModal(id, headline) {
  const c = (GM.snap.chests || []).find(x => x.id === id) || { id, tier: 'brons', reason: 'toeval' };
  modal(`<div class="gm-sheet gm-chestpane t-${c.tier}" id="gmcp"><span class="eyebrow">${esc(GM_REASON[c.reason] || 'Kist')}</span><h2 class="disp">${esc(headline || GM_TIER[c.tier])}</h2>
    <button class="gmchest t-${c.tier} drop" data-a="gmOpen" data-id="${c.id}" aria-label="${GM_TIER[c.tier]} openen"><span class="gmc-rays" aria-hidden="true"></span><span class="gmc-glow" aria-hidden="true"></span>${gmChestSvg(c.tier)}</button>
    <p class="gm-hint" id="gmhint">Tik om te openen</p><div class="gm-loot" id="gmloot" aria-live="polite"></div><div class="btns end" id="gmcbtn" hidden></div></div>`);
  hap('med');
}
A.gmOpen = async (d, el) => {
  if (!el || el.classList.contains('busy') || el.classList.contains('open')) return;
  el.classList.add('busy', 'shake'); el.classList.remove('drop'); hap('med');
  const hint = $('#gmhint'); if (hint) hint.textContent = 'Hij gaat open…';
  let r;
  try { [r] = await Promise.all([gmRpc('gm_open_chest', { p_chest: d.id }), gmSleep(gmReduced() ? 200 : 1300)]); }
  catch (e) { el.classList.remove('busy', 'shake'); if (hint) hint.textContent = e.message + ' Tik om het opnieuw te proberen.'; return; }
  gmSetSnap(r.snapshot);
  el.classList.remove('shake'); el.classList.add('open'); hap('ok');
  const c = r.contents, loot = $('#gmloot'); if (hint) hint.textContent = '';
  const rows = [`<div class="gm-li gm-li-sp"><span class="gm-big">${gmSpark}<b data-count="${c.sparks}">0</b></span><small>Sparks</small></div>`];
  if (c.item) rows.push(`<div class="gm-li gm-li-item r-${c.item.rarity}">${gmItemPreview(c.item)}<span><b>${esc(c.item.name)}</b><small>Nieuw ${{ flame: 'vlam', orbit: 'orbit', theme: 'kleurthema' }[c.item.kind]} · ${c.item.rarity}</small></span></div>`);
  setTimeout(() => {
    if (!loot) return; loot.innerHTML = rows.join(''); gmCountUp($('[data-count]', loot));
    if (c.item || c.tier === 'goud') rwConfetti();
    const left = (GM.snap.chests || []).length, b = $('#gmcbtn');
    if (b) { b.hidden = false; b.innerHTML = `${c.item ? `<button class="btn ghost" data-a="gmEquipNow" data-slot="${c.item.kind}" data-id="${c.item.id}">Nu gebruiken</button>` : ''}${left ? `<button class="btn" data-a="gmChestGo" data-id="${GM.snap.chests[0].id}">Volgende kist (${left})</button>` : '<button class="btn" data-a="gmNext">Top</button>'}`; }
    render();
  }, gmReduced() ? 0 : 420);
};
A.gmEquipNow = async d => { await A.gmEquip(d); A.gmNext(); };
function gmCountUp(el) {
  if (!el) return; const to = +el.dataset.count;
  if (gmReduced()) { el.textContent = gmNum(to); return; }
  const t0 = performance.now(), dur = Math.min(1200, 400 + to * 6);
  (function f(t) { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = gmNum(Math.round(to * e)); if (k < 1) requestAnimationFrame(f); else hap('sel'); })(t0);
}

/* ---------- Winkel, herstel, cosmetica ---------- */
A.gmBuy = async d => {
  const it = GM.shop.find(x => x.id === d.id); if (!it) return;
  try { const r = await gmRpc('gm_buy', { p_item: d.id }); gmSetSnap(r.snapshot); hap('ok'); render(); toast(`${it.name} gekocht.`); if (it.kind !== 'freeze') A.gmEquip({ slot: it.kind, id: it.id }); }
  catch (e) { toast(e.message); }
};
A.gmRepair = async () => {
  try { const r = await gmRpc('gm_buy_repair'); gmSetSnap(r.snapshot); gmLoadDays(); closeModal(); gmFixedModal({ restored: r.restored, current: GM.snap.streak.current }); render(); }
  catch (e) { toast(e.message); }
};
A.gmEquip = async d => {
  try { const r = await gmRpc('gm_equip', { p_slot: d.slot, p_item: d.off ? null : d.id }); gmSetSnap(r.snapshot); hap('sel'); render(); }
  catch (e) { toast(e.message); }
};
function gmItem(id) { return GM.shop.find(x => x.id === id); }
function gmApplyCosmetics() {
  const r = document.documentElement, eq = GM.snap ? GM.snap.equipped || {} : {};
  const th = gmItem(eq.theme), fl = gmItem(eq.flame), ob = gmItem(eq.orbit);
  if (th && th.style.pg) { r.style.setProperty('--gm-pg', th.style.pg); r.dataset.gmtheme = th.id; } else { r.style.removeProperty('--gm-pg'); delete r.dataset.gmtheme; }
  if (fl) { const s = fl.style; r.style.setProperty('--gm-flame', s.anim ? 'none' : `hue-rotate(${(s.hue || 0) - 20}deg) saturate(${s.sat || 1.25})`); r.style.setProperty('--gm-glow', s.glow || '#FF8A3D'); r.dataset.gmflame = s.anim || 'skin'; }
  else { r.style.removeProperty('--gm-flame'); r.style.removeProperty('--gm-glow'); delete r.dataset.gmflame; }
  if (ob) r.dataset.gmorbit = ob.style.orb; else delete r.dataset.gmorbit;
}
function gmItemPreview(it) {
  const s = it.style || {};
  if (it.kind === 'flame') return `<span class="gm-prev fl ${s.anim ? 'prisma' : ''}" style="--f:${s.anim ? 'none' : `hue-rotate(${(s.hue || 0) - 20}deg) saturate(${s.sat || 1.25})`};--g:${s.glow || '#FF8A3D'}">🔥</span>`;
  if (it.kind === 'theme') return `<span class="gm-prev th" style="--g:${s.pg}"><i></i></span>`;
  if (it.kind === 'orbit') return `<span class="gm-prev ob o-${s.orb}"><i></i></span>`;
  return `<span class="gm-prev">${s.emoji || '🧊'}</span>`;
}

/* ---------- Streak-status (werkt ook zonder account) ---------- */
const gmHeat = n => n >= 100 ? 4 : n >= 30 ? 3 : n >= 7 ? 2 : n >= 1 ? 1 : 0;
function gmDay() {
  const R = rewards(), T = today(), x = R.dayInfo[T] || R.today, p = (x && x.p) || rwPillars(T), sc = rwScore(p), won = sc >= 3;
  const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const miss = ['train', 'steps', 'protein', 'check'].filter(k => k === 'train' ? !(p.train || p.rest) : !p[k]);
  const streak = R.m.streak, hr = now.getHours(), st = GM.on && GM.snap ? GM.snap.streak : null;
  const state = st && st.repair ? 'repair' : won ? 'safe' : streak === 0 ? 'cold' : hr >= 18 ? 'risk' : 'open';
  const ms = GM_MS.find(m => m > streak) || (Math.floor(streak / 30) + 1) * 30;
  return { R, p, sc, won, streak, left: mid - now, miss, need: Math.max(0, 3 - sc), state, freezes: R.freezes, st, ms };
}
function gmLeft(ms) { const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60); return h ? `${h} u ${m % 60} min` : `${m} min`; }
function gmDeadline(iso) { const d = new Date(iso); return d.toLocaleString('nl-NL', { weekday: 'long', hour: '2-digit', minute: '2-digit' }); }
function gmQuestDots(rp) { return `<span class="gm-qdots" role="img" aria-label="${rp.won} van ${rp.needed} dagen gewonnen">${Array.from({ length: rp.needed }, (_, i) => `<i class="${i < rp.won ? 'on' : ''}"></i>`).join('')}</span>`; }
function gmChips(miss) { return `<div class="gm-chips">${miss.map(k => `<button class="gm-chip" data-a="${GM_PILLAR[k][1]}">${GM_PILLAR[k][0]}<span aria-hidden="true">›</span></button>`).join('')}</div>`; }

/* Banner bovenaan Vandaag: de belangrijkste plek voor urgentie en herstel. */
function gmStreakBanner() {
  if (!S || !S.profile) return '';
  let g; try { g = gmDay(); } catch (e) { return ''; }
  const heat = gmHeat(g.streak), wallet = GM.on && GM.snap ? `<a class="gm-wallet" href="#beloningen" data-gmwallet aria-label="${gmNum(GM.snap.sparks)} Sparks">${gmSpark}<b>${gmNum(GM.snap.sparks)}</b>${(GM.snap.chests || []).length ? `<i class="gm-dot" aria-label="kist klaar"></i>` : ''}</a>` : '';
  const flame = `<span class="gm-fl heat-${heat}" aria-hidden="true">🔥</span>`;
  let title, sub, extra = '';
  if (g.state === 'repair') {
    const rp = g.st.repair;
    title = `${rp.lost} dagen staan in de vriezer`; sub = `Win nog ${rp.needed - rp.won} ${rp.needed - rp.won === 1 ? 'dag' : 'dagen'} vóór ${gmDeadline(rp.deadline)} en je reeks komt terug.`;
    extra = `${gmQuestDots(rp)}${!g.won ? gmChips(g.miss.slice(0, Math.max(g.need, 1) + 1)) : ''}<div class="gm-row"><button class="btn sm ghost" data-a="gmRepairAsk">Direct herstellen · ✦${rp.cost}</button></div>`;
  } else if (g.state === 'safe') {
    const togo = g.ms - g.streak;
    title = `Dag ${g.streak} binnen`; sub = `Je vlam is veilig tot morgen. Nog ${togo} ${togo === 1 ? 'dag' : 'dagen'} tot ${g.ms} op rij.`;
    extra = `<div class="gm-prog" role="img" aria-label="${g.streak} van ${g.ms} dagen"><i style="width:${Math.min(100, g.streak / g.ms * 100).toFixed(0)}%"></i><span>${g.ms}</span></div>`;
  } else if (g.state === 'cold') {
    const lt = g.st ? g.st.lifetime_won : 0;
    title = lt ? 'Nieuwe reeks, zelfde jij' : 'Steek je vlam aan';
    sub = lt ? `${gmNum(lt)} gewonnen dagen staan op je naam. Win vandaag ${g.need} ${g.need === 1 ? 'doel' : 'doelen'} meer en je bent weer vertrokken.` : `Haal 3 van de 4 dagdoelen en dag 1 staat erop.`;
    extra = gmChips(g.miss);
  } else {
    title = g.state === 'risk' ? `Je vlam brandt nog <span data-gmleft>${gmLeft(g.left)}</span>` : `Nog ${g.need} ${g.need === 1 ? 'doel' : 'doelen'} voor dag ${g.streak + 1}`;
    sub = g.state === 'risk' ? `${g.need} ${g.need === 1 ? 'doel' : 'doelen'} te gaan voor dag ${g.streak + 1}.${g.miss.includes('check') ? ' Een check-in kost 10 seconden.' : ''}${g.freezes ? ' Lukt het vandaag niet? Je beschermer 🧊 vangt het op.' : ''}` : 'Kies wat vandaag het makkelijkst past.';
    extra = gmChips(g.miss);
  }
  const frz = g.freezes ? `<span class="gm-frz" title="Streakbeschermers">🧊${g.freezes > 1 ? '×' + g.freezes : ''}</span>` : '';
  return `<div class="gm-banner s-${g.state}" style="--left:${(g.left / 864e5).toFixed(3)}"><div class="gm-bhead">${flame}<div class="gm-btxt"><b>${title}</b><small>${sub}</small></div><div class="gm-bside">${frz}${wallet}</div></div>${extra}${gmLoginNudge()}</div>`;
}
function gmLoginNudge() {
  if (!gmEnabled() || GM.on || S.gmNudgeOff) return '';
  return `<div class="gm-nudge"><span>Maak een account, zodat je gegevens bewaard blijven op elk toestel.</span><a class="link" href="#beloningen">Inloggen</a><button class="link" data-a="gmNudgeOff" aria-label="Verbergen">✕</button></div>`;
}
A.gmNudgeOff = () => { S.gmNudgeOff = true; save(); render(); };
A.gmRepairAsk = () => { const rp = GM.snap && GM.snap.streak.repair; if (!rp) return; modal(`<div class="gm-sheet"><h3>Reeks direct herstellen?</h3><p>Je ${rp.lost} dagen komen meteen terug. Kost ${gmSpark}${rp.cost}, je hebt er ${gmNum(GM.snap.sparks)}.</p><p class="sub">Gratis alternatief: win nog ${rp.needed - rp.won} ${rp.needed - rp.won === 1 ? 'dag' : 'dagen'} vóór ${gmDeadline(rp.deadline)}.</p><div class="btns end">${GM.snap.sparks >= rp.cost ? `<button class="btn" data-a="gmRepair">Herstel voor ✦${rp.cost}</button>` : `<button class="btn" disabled>Nog ${gmNum(rp.cost - GM.snap.sparks)} Sparks nodig</button>`}<button class="btn ghost" data-a="close">Ik win het terug</button></div></div>`); };

/* Header-chip: vlam, urgentie en Sparks op elke pagina. */
function gmChip() {
  if (!S || !S.profile) return '';
  let g; try { g = gmDay(); } catch (e) { return ''; }
  return `<span class="pill gm-pill s-${g.state}"><span class="gm-fl heat-${gmHeat(g.streak)}" aria-hidden="true">🔥</span><span>${g.streak}</span>${GM.on && GM.snap ? `<span class="gm-pw" data-gmwallet>✦${gmNum(GM.snap.sparks)}</span>` : ''}</span>`;
}

/* ---------- Beloningen-pagina: rang, kisten, winkel ---------- */
function gmRewardsSection() {
  if (!gmEnabled()) return '';
  if (!GM.on || !GM.snap) return gmAccountCard(true);
  const s = GM.snap, st = s.streak, rk = s.rank, nx = rk.next, ch = s.chests || [], eq = s.equipped || {}, inv = new Set(s.inventory || []);
  const rkp = nx ? Math.min(100, (st.lifetime_won - rk.min_won) / (nx.min_won - rk.min_won) * 100) : 100;
  const tabs = [['freeze', 'Beschermers'], ['flame', 'Vlammen'], ['orbit', 'Orbits'], ['theme', 'Kleuren']], tab = ui.gmTab || 'freeze';
  const items = GM.shop.filter(i => i.kind === tab);
  const card = it => {
    const own = inv.has(it.id), on = eq[it.kind] === it.id, lock = rk.rank < it.min_rank, rkName = (n => ({ 1: 'Vonk', 2: 'Gloed', 3: 'Vlam', 4: 'Vuurhaard' }[n]))(it.min_rank);
    let act;
    if (it.kind === 'freeze') act = st.freezes >= st.freeze_cap ? `<button class="btn sm" disabled>Vol (${st.freezes}/${st.freeze_cap})</button>` : `<button class="btn sm" data-a="gmBuy" data-id="${it.id}" ${s.sparks < it.price ? 'disabled' : ''}>✦${it.price}</button>`;
    else if (own) act = on ? `<button class="btn sm ghost" data-a="gmEquip" data-slot="${it.kind}" data-off="1">Aan · uitzetten</button>` : `<button class="btn sm" data-a="gmEquip" data-slot="${it.kind}" data-id="${it.id}">Gebruiken</button>`;
    else if (lock) act = `<span class="gm-lock">🔒 Rang ${rkName}</span>`;
    else if (it.price == null) act = `<span class="gm-lock">Alleen uit kisten</span>`;
    else act = `<button class="btn sm" data-a="gmBuy" data-id="${it.id}" ${s.sparks < it.price ? 'disabled' : ''}>✦${it.price}</button>`;
    return `<div class="gm-item r-${it.rarity} ${own ? 'own' : ''} ${on ? 'on' : ''}">${gmItemPreview(it)}<b>${esc(it.name)}</b><small>${esc(it.description)}</small>${act}</div>`;
  };
  return `<div class="card gm-rank"><div class="gm-rtop"><span class="gm-fl heat-${gmHeat(st.current)}" aria-hidden="true">🔥</span><div><span class="eyebrow">Rang ${rk.rank} van 4</span><h2 class="disp">${esc(rk.name)}</h2></div><a class="gm-wallet big" data-gmwallet href="#beloningen" aria-label="${gmNum(s.sparks)} Sparks">${gmSpark}<b>${gmNum(s.sparks)}</b></a></div>
    <div class="xpbar"><i style="width:${rkp.toFixed(1)}%"></i></div><p class="sub"><b>${gmNum(st.lifetime_won)}</b> ${st.lifetime_won === 1 ? 'dag' : 'dagen'} gewonnen. ${nx ? `Nog ${nx.min_won - st.lifetime_won} ${nx.min_won - st.lifetime_won === 1 ? 'gewonnen dag' : 'gewonnen dagen'} tot <b>${esc(nx.name)}</b>: betere kisten en meer Sparks.` : 'Hoogste rang bereikt.'} Je rang groeit met consistentie, nooit met hoeveel je traint, en daalt nooit.</p>
    ${st.repair ? `<div class="gm-quest"><b>Herstel-quest: ${st.repair.lost} dagen</b><span>Win nog ${st.repair.needed - st.repair.won} ${st.repair.needed - st.repair.won === 1 ? 'dag' : 'dagen'} vóór ${gmDeadline(st.repair.deadline)}.</span>${gmQuestDots(st.repair)}<button class="btn sm ghost" data-a="gmRepairAsk">Direct herstellen · ✦${st.repair.cost}</button></div>` : ''}</div>
  ${ch.length ? `<div class="card gm-chests"><h3>${ch.length === 1 ? 'Er staat een kist klaar' : ch.length + ' kisten staan klaar'}</h3><div class="gm-crow">${ch.map(c => `<button class="gmchest mini t-${c.tier} idle" data-a="gmChestGo" data-id="${c.id}" aria-label="${GM_TIER[c.tier]} openen"><span class="gmc-glow" aria-hidden="true"></span>${gmChestSvg(c.tier)}<small>${esc(GM_REASON[c.reason] || '')}</small></button>`).join('')}</div></div>` : ''}
  <div class="card gm-shop"><div class="qhead"><h3>Winkel</h3><span class="gm-wallet" data-gmwallet>${gmSpark}<b>${gmNum(s.sparks)}</b></span></div>
    <div class="gm-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-a="gmTab" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="gm-items">${items.length ? items.map(card).join('') : '<p class="sub">Winkel laden…</p>'}</div></div>
  ${acc('Kansen en regels', '', gmRulesHtml())}`;
}
A.gmTab = d => { ui.gmTab = d.t; hap('sel'); render(); };
function gmRulesHtml() {
  const s = GM.snap;
  return `<div class="gm-rules"><p><b>Sparks per gewonnen dag:</b> vast 8, +2 per rang, +4 bij een perfecte dag (4/4). De eis blijft altijd 3 van de 4 dagdoelen.</p>
    <p><b>Kisten.</b> Je krijgt er een bij je eerste dag, bij 7, 14, 21 en 30 dagen op rij en daarna elke 30 dagen, en bij een comeback na een gebroken reeks. Altijd om een reden die je kunt zien aankomen — geen toeval, geen kans erbij.</p>
    <p><b>Inhoud van een kist.</b> Brons geeft vaste Sparks; zilver en goud geven vaste Sparks plus, als je hem nog niet hebt, gegarandeerd een nieuwe vlam, orbit of kleurthema. Heb je alles al, dan krijg je in plaats daarvan extra Sparks.</p>
    <p><b>Beschermers.</b> De eerste krijg je op dag 1, daarna één per 7 dagen op rij. Je kunt er ${s.streak.freeze_cap} bewaren. Ze worden alleen gebruikt als ze je reeks echt redden.</p>
    <p><b>Herstel.</b> Breekt een reeks van 3 dagen of meer, dan heb je 72 uur. Win in die tijd 2 dagen en je reeks komt terug, of herstel direct met Sparks. Dit kan één keer per 30 dagen.</p>
    <p class="fine">Alles wordt op de server bepaald en vastgelegd. Je telefoonklok verzetten verandert niets.</p></div>`;
}

/* ---------- Account: registreren, bevestigen, inloggen (Supabase Auth) ----------
   Stappen (ui.gmStep): register | login | code (zonder wachtwoord) | verify (e-mail bevestigen)
   | forgot | reset (code + nieuw wachtwoord). Alles werkt met codes uit de mail, zodat het
   ook in de iOS-app werkt zonder deep links; de link in de mail werkt even goed. */
const GM_AUTH_ERR = {
  invalid_credentials: 'E-mailadres of wachtwoord klopt niet.', email_not_confirmed: 'Bevestig eerst je e-mailadres.',
  user_already_exists: 'Er bestaat al een account met dit e-mailadres. Log in.', weak_password: 'Kies een sterker wachtwoord: minstens 8 tekens.',
  over_email_send_rate_limit: 'Even wachten: je kunt over een minuut opnieuw een mail laten sturen.', otp_expired: 'Die code klopt niet of is verlopen.',
  same_password: 'Kies een ander wachtwoord dan je huidige.', email_address_invalid: 'Dat e-mailadres lijkt niet te kloppen.'
};
function gmAuthErr(e, fallback) {
  const c = (e && (e.code || '')) || '', m = String((e && e.message) || '');
  if (GM_AUTH_ERR[c]) return GM_AUTH_ERR[c];
  if (/not confirmed/i.test(m)) return GM_AUTH_ERR.email_not_confirmed;
  if (/invalid login/i.test(m)) return GM_AUTH_ERR.invalid_credentials;
  if (/already registered/i.test(m)) return GM_AUTH_ERR.user_already_exists;
  if (/expired|invalid.*(token|otp)/i.test(m)) return GM_AUTH_ERR.otp_expired;
  if (/fetch|network/i.test(m)) return 'Geen verbinding. Controleer je internet en probeer het opnieuw.';
  return fallback;
}
const gmPw = (name, ac, label) => `<label class="f gm-pwf">${label}<span class="gm-pwrow"><input name="${name}" type="password" autocomplete="${ac}" minlength="8" required placeholder="Minstens 8 tekens"><button type="button" class="gm-eye" data-a="gmEye" aria-label="Wachtwoord tonen">👁</button></span></label>`;
const gmMail = () => `<label class="f">E-mailadres<input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required placeholder="jij@voorbeeld.nl" value="${esc(ui.gmEmail || '')}"></label>`;
const gmCodeIn = () => `<label class="f">Code uit de mail<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="123456"></label>`;

function gmAccountCard(cta) {
  if (!gmEnabled()) return '';
  if (GM.on && GM.user) {
    if (cta) return '';
    const nm = GM.profile && GM.profile.display_name;
    return `<div class="card slim gm-acc"><div class="row"><div><b>${esc(nm || 'Account')}</b><small>${esc(GM.user.email || '')}${S.cloud && S.cloud.at ? ' · gesynchroniseerd ' + esc(new Date(S.cloud.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })) : ''}</small></div><button class="btn ghost sm" data-a="gmLogout">Uitloggen</button></div>${GM.err ? `<small class="fine">${esc(GM.err)}</small>` : ''}<small class="fine">Je gegevens staan in je account. Foto's en je pincode blijven alleen op dit toestel.</small></div>`;
  }
  const step = ui.gmStep || (S.gmHadAccount ? 'login' : 'register'), em = esc(ui.gmEmail || '');
  const tabs = ['register', 'login', 'code'].includes(step) ? `<div class="gm-tabs gm-authtabs" role="tablist">${[['register', 'Registreren'], ['login', 'Inloggen'], ['code', 'Met code']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${step === k}" class="${step === k ? 'on' : ''}" data-a="gmAuthStep" data-s="${k}">${l}</button>`).join('')}</div>` : '';
  let body;
  if (step === 'register') body = `<form data-submit="gmRegister" class="stack gm-authf"><label class="f">Naam<input name="name" autocomplete="given-name" maxlength="60" placeholder="Hoe mogen we je noemen?" value="${esc(ui.gmName || (S.profile && S.profile.name) || '')}"></label>${gmMail()}${gmPw('password', 'new-password', 'Wachtwoord')}<button class="btn">Account maken</button></form><small class="fine">Je krijgt een mail om je adres te bevestigen. Pas daarna is je account actief.</small>`;
  else if (step === 'login') body = `<form data-submit="gmLogin" class="stack gm-authf">${gmMail()}${gmPw('password', 'current-password', 'Wachtwoord')}<button class="btn">Inloggen</button></form><button class="link" data-a="gmAuthStep" data-s="forgot">Wachtwoord vergeten?</button>`;
  else if (step === 'code') body = ui.gmCodeSent ? `<div class="gm-verify"><span class="gm-mailic" aria-hidden="true">✉️</span><h3>Check je mail</h3><p class="sub">We stuurden een inloglink naar <b>${em}</b>. Tik erop en je bent ingelogd.</p></div>${gmCodeAlt('gmCode', 'Inloggen')}<button class="link" data-a="gmCodeAgain">Ander e-mailadres</button>`
    : `<form data-submit="gmEmail" class="stack gm-authf">${gmMail()}<button class="btn">Stuur inloglink</button></form><small class="fine">Geen wachtwoord nodig: je krijgt een link per mail.</small>`;
  else if (step === 'verify') body = `<div class="gm-verify"><span class="gm-mailic" aria-hidden="true">✉️</span><h3>Bevestig je e-mailadres</h3><p class="sub">We stuurden een mail naar <b>${em}</b>. Tik op de knop in die mail. Je komt dan vanzelf ingelogd terug, of je logt daarna hier in.</p></div>
      <div class="gm-row"><button class="btn sm" data-a="gmAuthStep" data-s="login">Ik heb bevestigd, inloggen</button><button class="btn ghost sm" data-a="gmResend">Mail opnieuw sturen</button></div>
      ${gmCodeAlt('gmVerify', 'Bevestigen')}<small class="fine">Geen mail? Kijk ook in je spam.</small>`;
  else if (step === 'forgot') body = `<h3>Wachtwoord vergeten</h3><form data-submit="gmForgot" class="stack gm-authf">${gmMail()}<button class="btn">Stuur herstelmail</button></form><button class="link" data-a="gmAuthStep" data-s="login">Terug naar inloggen</button>`;
  else if (step === 'newpass') body = `<h3>Kies een nieuw wachtwoord</h3><p class="sub">Voor ${em}.</p><form data-submit="gmNewPass" class="stack gm-authf">${gmPw('password', 'new-password', 'Nieuw wachtwoord')}<button class="btn">Opslaan en inloggen</button></form>`;
  else body = `<div class="gm-verify"><span class="gm-mailic" aria-hidden="true">✉️</span><h3>Check je mail</h3><p class="sub">We stuurden een herstelmail naar <b>${em}</b>. Tik op de knop in de mail; je komt dan hier terug om een nieuw wachtwoord te kiezen.</p></div>
      <details class="gm-alt" ${ui.gmAltOpen ? 'open' : ''}><summary>Ik heb een code gekregen</summary><form data-submit="gmReset" class="stack gm-authf">${gmCodeIn()}${gmPw('password', 'new-password', 'Nieuw wachtwoord')}<button class="btn">Opslaan en inloggen</button></form></details>
      <button class="link" data-a="gmAuthStep" data-s="login">Terug naar inloggen</button>`;
  return `<div class="card gm-acc ${cta ? 'gm-cta' : ''}">${cta ? `<div class="gm-ctahead"><span class="gm-coinstack" aria-hidden="true">✦</span><div><h3>Bewaar je gegevens</h3><p class="sub">Maak een account, zodat je trainingen, voeding, voortgang en instellingen bewaard blijven en meegaan naar elk toestel. Je streak, Sparks en kisten gaan automatisch mee, en bestaande gebruikers krijgen een welkomstbonus.</p></div></div>` : '<h3>Account</h3>'}
    ${tabs}${body}${ui.gmMsg ? `<p class="gm-authmsg ${ui.gmMsgOk ? 'ok' : ''}" role="status">${esc(ui.gmMsg)}</p>` : ''}</div>`;
}
/* code als alternatief voor de link (werkt zodra de mailtemplates {{ .Token }} bevatten) */
function gmCodeAlt(submit, label) { return `<details class="gm-alt" ${ui.gmAltOpen ? 'open' : ''}><summary>Ik heb een code gekregen</summary><form data-submit="${submit}" class="stack gm-authf">${gmCodeIn()}<button class="btn">${label}</button></form></details>`; }
function gmMsg(m, ok) { ui.gmMsg = m; ui.gmMsgOk = !!ok; render(); }
function gmBusy(f, on) { const b = f && f.querySelector('button.btn'); if (b) { b.disabled = on; b.classList.toggle('gm-loading', on); } }
A.gmAuthStep = d => { ui.gmStep = d.s; ui.gmMsg = ''; ui.gmAltOpen = false; hap('sel'); render(); };
/* open/dicht van "Ik heb een code gekregen" onthouden, zodat een foutmelding het veld niet weer inklapt */
document.addEventListener('toggle', e => { const d = e.target; if (d && d.matches && d.matches('details.gm-alt')) ui.gmAltOpen = d.open; }, true);
A.gmEye = (d, el) => { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.setAttribute('aria-label', i.type === 'password' ? 'Wachtwoord tonen' : 'Wachtwoord verbergen'); };
A.gmCodeAgain = () => { ui.gmCodeSent = false; ui.gmMsg = ''; render(); };

F.gmRegister = async (f, fd) => {
  const name = String(fd.get('name') || '').trim(), email = String(fd.get('email') || '').trim(), password = String(fd.get('password') || '');
  ui.gmEmail = email; ui.gmName = name;
  if (password.length < 8) return gmMsg(GM_AUTH_ERR.weak_password);
  gmBusy(f, true);
  try {
    const sb = await gmClient();
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: gmReturnUrl() } });
    if (error) throw error;
    S.gmHadAccount = true; gmPersist();
    if (data.session) { ui.gmStep = null; ui.gmMsg = ''; await gmOnLogin(data.user, true); toast('Account gemaakt.'); return; }
    ui.gmStep = 'verify'; gmMsg('');
  } catch (e) { gmBusy(f, false); gmMsg(gmAuthErr(e, 'Registreren lukte niet. Probeer het opnieuw.')); }
};
F.gmVerify = async (f, fd) => {
  gmBusy(f, true);
  try { const sb = await gmClient(); const { data, error } = await sb.auth.verifyOtp({ email: ui.gmEmail, token: String(fd.get('code') || '').trim(), type: 'signup' }); if (error) throw error;
    ui.gmStep = null; ui.gmMsg = ''; await gmOnLogin(data.user, true); toast('E-mailadres bevestigd. Welkom!'); }
  catch (e) { gmBusy(f, false); gmMsg(gmAuthErr(e, GM_AUTH_ERR.otp_expired)); }
};
A.gmResend = async () => {
  try { const sb = await gmClient(); const { error } = await sb.auth.resend({ type: 'signup', email: ui.gmEmail }); if (error) throw error; gmMsg('Nieuwe mail verstuurd.', true); }
  catch (e) { gmMsg(gmAuthErr(e, 'Opnieuw versturen lukte niet.')); }
};
F.gmLogin = async (f, fd) => {
  const email = String(fd.get('email') || '').trim(); ui.gmEmail = email; gmBusy(f, true);
  try { const sb = await gmClient(); const { data, error } = await sb.auth.signInWithPassword({ email, password: String(fd.get('password') || '') }); if (error) throw error;
    S.gmHadAccount = true; ui.gmStep = null; ui.gmMsg = ''; await gmOnLogin(data.user, true); toast('Ingelogd.'); }
  catch (e) {
    gmBusy(f, false); const m = gmAuthErr(e, 'Inloggen lukte niet. Probeer het opnieuw.');
    if (m === GM_AUTH_ERR.email_not_confirmed) { ui.gmStep = 'verify'; return gmMsg('Je account is nog niet bevestigd. Tik op de knop in de bevestigingsmail, of laat hem opnieuw sturen.'); }
    gmMsg(m);
  }
};
F.gmForgot = async (f, fd) => {
  const email = String(fd.get('email') || '').trim(); ui.gmEmail = email; gmBusy(f, true);
  try { const sb = await gmClient(); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: gmReturnUrl() }); if (error) throw error; ui.gmStep = 'reset'; gmMsg(''); }
  catch (e) { gmBusy(f, false); gmMsg(gmAuthErr(e, 'Versturen lukte niet. Probeer het opnieuw.')); }
};
F.gmReset = async (f, fd) => {
  const password = String(fd.get('password') || ''); if (password.length < 8) return gmMsg(GM_AUTH_ERR.weak_password);
  gmBusy(f, true);
  try { const sb = await gmClient();
    const { data, error } = await sb.auth.verifyOtp({ email: ui.gmEmail, token: String(fd.get('code') || '').trim(), type: 'recovery' }); if (error) throw error;
    const up = await sb.auth.updateUser({ password }); if (up.error) throw up.error;
    ui.gmStep = null; ui.gmMsg = ''; await gmOnLogin(data.user, true); toast('Nieuw wachtwoord opgeslagen.'); }
  catch (e) { gmBusy(f, false); gmMsg(gmAuthErr(e, 'Opslaan lukte niet. Probeer het opnieuw.')); }
};
/* na een herstellink: nieuw wachtwoord opslaan (de link gaf al een sessie) */
F.gmNewPass = async (f, fd) => {
  const password = String(fd.get('password') || ''); if (password.length < 8) return gmMsg(GM_AUTH_ERR.weak_password);
  gmBusy(f, true);
  try { const sb = await gmClient(); const up = await sb.auth.updateUser({ password }); if (up.error) throw up.error;
    const u = (up.data && up.data.user) || GM.user; ui.gmStep = null; ui.gmMsg = ''; await gmOnLogin(u, true); toast('Nieuw wachtwoord opgeslagen.'); }
  catch (e) { gmBusy(f, false); gmMsg(gmAuthErr(e, 'Opslaan lukte niet. Probeer het opnieuw.')); }
};
/* zonder wachtwoord: inloglink (en, met eigen templates, een code) per mail; bevestigt het adres meteen */
F.gmEmail = async (f, fd) => {
  const email = String(fd.get('email') || '').trim(); if (!email) return; ui.gmEmail = email; gmBusy(f, true);
  try { const sb = await gmClient(); const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: gmReturnUrl() } }); if (error) throw error; ui.gmCodeSent = true; gmMsg(''); }
  catch (e) { gmBusy(f, false); gmMsg(gmAuthErr(e, 'Versturen lukte niet. Controleer je internet en probeer het opnieuw.')); }
};
F.gmCode = async (f, fd) => {
  gmBusy(f, true);
  try { const sb = await gmClient(); const { data, error } = await sb.auth.verifyOtp({ email: ui.gmEmail, token: String(fd.get('code') || '').trim(), type: 'email' }); if (error) throw error;
    S.gmHadAccount = true; ui.gmStep = null; ui.gmMsg = ''; ui.gmCodeSent = false; await gmOnLogin(data.user, true); toast('Ingelogd.'); }
  catch (e) { gmBusy(f, false); gmMsg(gmAuthErr(e, GM_AUTH_ERR.otp_expired)); }
};
/* profiel (1-op-1 met auth.users): naam tonen en onboarding-status bijhouden */
async function gmLoadProfile() {
  try {
    const { data } = await GM.sb.from('profiles').select('display_name,avatar_url,onboarding_status').eq('id', GM.user.id).maybeSingle();
    GM.profile = data || null;
    const patch = {};
    if (data && !data.display_name && S.profile && S.profile.name) patch.display_name = String(S.profile.name).slice(0, 60);
    if (data && data.onboarding_status !== 'klaar' && S.profile) patch.onboarding_status = 'klaar';
    if (Object.keys(patch).length) { await GM.sb.from('profiles').update(patch).eq('id', GM.user.id); Object.assign(GM.profile, patch); }
    if (data && data.display_name && S.profile && !S.profile.name) { S.profile.name = data.display_name; gmPersist(); }
  } catch (e) {}
}
A.gmLogout = async () => {
  try { await gmPush(); await GM.sb.auth.signOut(); } catch (e) {}
  GM.on = false; GM.user = null; GM.snap = null; GM.days = {}; GM.profile = null; S.cloud = null; ui.gmStep = 'login'; gmPersist(); rwVer++; gmApplyCosmetics(); render(); toast('Uitgelogd. Je gegevens blijven op dit toestel.');
};

/* ---------- Na elke render: urgentie door de hele app, vinkjes laten poppen ---------- */
function gmAfterRender() {
  let g = null; try { if (S && S.profile && !ui.ob) g = gmDay(); } catch (e) {}
  const r = document.documentElement;
  if (g) { r.dataset.streak = g.state; r.style.setProperty('--gm-left', (g.left / 864e5).toFixed(3)); } else delete r.dataset.streak;
  const now = {}; $$('#main .vt').forEach((el, i) => { const ok = el.classList.contains('ok'); now[i] = ok; if (ok && GM._ok && GM._ok[i] === false) { el.classList.add('gm-justok'); hap('ok'); } });
  if (route === 'home') GM._ok = now;
}
setInterval(() => { const el = $$('[data-gmleft]'); if (!el.length || document.hidden) return; try { const g = gmDay(); el.forEach(e => e.textContent = gmLeft(g.left)); document.documentElement.style.setProperty('--gm-left', (g.left / 864e5).toFixed(3)); } catch (e) {} }, 30000);

/* Ripple en veer-feedback op knoppen (pointer events: muis én touch). */
function gmFx() {
  if (GM._fx) return; GM._fx = true;
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn, .gm-chip, .vt, .tile, .qbtn, .gm-item .btn'); if (!b || b.disabled || gmReduced()) return;
    const r = b.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height) * 2;
    s.className = 'gm-rip'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.appendChild(s); setTimeout(() => s.remove(), 650);
  }, { passive: true });
}

/* ---------- start ---------- */
GM.init();
if (S && S.profile) render();
