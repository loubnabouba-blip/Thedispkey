/* =====================================================================
   The Discipline Key: account en synchronisatie
   - Supabase: account (e-mailcode of wachtwoord) en synchronisatie van de app-state.
   - App-brede micro-interacties (tap-feedback, ripple).
   De vlam (streak), kisten, Sparks, winkel en rang zijn bewust weggehaald.
   Dit bestand wordt ná het hoofdscript geladen (het gebruikt A, F, S, ui en
   de helpers daaruit) en start zichzelf onderaan met GM.init().
   ===================================================================== */
const GM = { cfg: window.DK_SUPABASE || {}, sb: null, user: null, on: false, queue: [], pushT: null, err: null };
const gmReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const gmEnabled = () => !!(GM.cfg.url && GM.cfg.key);
const gmReturnUrl = () => /^https:$/.test(location.protocol) ? location.origin + location.pathname : undefined;
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
/* Link uit een Supabase-mail: de app (hash-routing) opent met #access_token=…&type=signup|magiclink|recovery
   of met #error=…. Sessie oppakken, de hash opruimen en naar de juiste stap gaan. */
async function gmFromMailLink() {
  const h = location.hash || '';
  if (!/access_token=|error_description=/.test(h)) return false;
  const q = new URLSearchParams(h.slice(1)), type = q.get('type'), err = q.get('error_description') || q.get('error');
  GM._urlAuth = true;
  try { history.replaceState(null, '', location.pathname + location.search + '#mijn-plan'); } catch (e) {}
  route = 'mijn-plan';
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
  if (!user.email_confirmed_at) { ui.gmEmail = user.email; ui.gmStep = 'verify'; try { await GM.sb.auth.signOut(); } catch (x) {} GM.user = null; render(); return; }
  await gmPull(fresh);
  GM.on = true;
  gmLoadProfile(); render();
  gmNext();
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

function gmNext(delay) {
  clearTimeout(GM._wait);
  if (delay) { GM._wait = setTimeout(() => gmNext(), delay); return; }
  if ($('#modal-root .overlay')) { GM._wait = setTimeout(() => gmNext(), 700); return; }
  const f = GM.queue.shift(); if (!f) return;
  f(); GM._wait = setTimeout(() => gmNext(), f.gap || 700);
}
const gmStep = (fn, gap) => (fn.gap = gap, fn);
A.gmNext = () => { closeModal(); gmNext(160); };

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
  GM.on = false; GM.user = null; GM.profile = null; S.cloud = null; ui.gmStep = 'login'; gmPersist(); rwVer++; render(); toast('Uitgelogd. Je gegevens blijven op dit toestel.');
};

/* Ripple en veer-feedback op knoppen (pointer events: muis én touch). */
function gmFx() {
  if (GM._fx) return; GM._fx = true;
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn, .tile, .qbtn'); if (!b || b.disabled || gmReduced()) return;
    const r = b.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height) * 2;
    s.className = 'gm-rip'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.appendChild(s); setTimeout(() => s.remove(), 650);
  }, { passive: true });
}

/* ---------- start ---------- */
GM.init();
if (S && S.profile) render();
