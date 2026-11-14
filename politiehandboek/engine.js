/* Politiehandboek: motor. Leest window.MODS (data/*.js) en tekent hub, leerdocument of spiekbriefje. */
(function () {
  "use strict";
  var REEKS = {
    1: ["Fundament", "Eerst begrijpen wat mag, onder welke voorwaarden en met welke grenzen."],
    2: ["Straat & gesprek", "De dagelijkse praktijk: aanspreken, kwalificeren, orde handhaven."],
    3: ["Bijzondere wetten", "De wetten waar je het vaakst op stuit: drugs, wapens, verkeer, ondermijning."],
    4: ["Verwerken", "Vastleggen, bewijzen en verantwoorden wat je deed."]
  };
  var BWB = { Sv: "BWBR0001903", Sr: "BWBR0001854", Pw: "BWBR0031788", AI: "BWBR0006589", WVW: "BWBR0006622", RVV: "BWBR0004825", Opw: "BWBR0001941", WWM: "BWBR0008804", Gemw: "BWBR0005416", Awb: "BWBR0005537" };
  var NAAM = { Sv: "Wetboek van Strafvordering", Sr: "Wetboek van Strafrecht", Pw: "Politiewet 2012", AI: "Ambtsinstructie", WVW: "Wegenverkeerswet 1994", RVV: "Reglement verkeersregels en verkeerstekens 1990", Opw: "Opiumwet", WWM: "Wet wapens en munitie", Gemw: "Gemeentewet", Awb: "Algemene wet bestuursrecht" };
  var LRE = /(<[^>]*>)|\b(Sv|Sr|Pw|AI|WVW|RVV|Opw|WWM|Gemw|Awb)\s(\d+[a-z]{0,5}(?::\d+[a-z]{0,2})?)\b/g;
  var NOTE = "Wetsartikelen zijn getoetst aan de tekst op wetten.overheid.nl (stand 14 november 2026). Beleidsregels van het OM (zoals de Aanwijzing Opiumwet en AHOJG-G), jurisprudentie, protocollen (zoals de wachttijd bij de ademanalyse), de Wet politiegegevens, de Wet tijdelijk huisverbod en de Wet verplichte ggz zijn niet getoetst. Wetten wijzigen; controleer altijd de actuele tekst. Korpsvoorschriften, het Handelingskader en de leerstof van je opleiding gaan voor.";

  function lk(s) {
    return String(s == null ? "" : s).replace(LRE, function (m, tag, w, n) {
      if (tag) return tag;
      return '<a class="wl" href="https://wetten.overheid.nl/jci1.3:c:' + BWB[w] + "&artikel=" + n + '" target="_blank" rel="noopener" title="Wettekst ' + NAAM[w] + " art. " + n + '">' + m + "</a>";
    });
  }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function strip(h) { var d = document.createElement("div"); d.innerHTML = h; return d.textContent || ""; }
  function sget(k, d) { try { var v = localStorage.getItem("pol:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function sset(k, v) { try { localStorage.setItem("pol:" + k, JSON.stringify(v)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function mods() { return (window.MODS || []).slice().sort(function (a, b) { return a.nr - b.nr; }); }

  /* ---------- gedeelde kop ---------- */
  function header(root, M, mode) {
    var w = el("div", "wrap");
    var t = el("div", "top");
    t.appendChild(el("div", "crumb", '<a href="../index.html">Politiehandboek</a><span>/</span><span class="rk">Reeks ' + M.reeks + " · " + REEKS[M.reeks][0] + "</span>"));
    t.appendChild(el("h1", "", esc(M.titel)));
    t.appendChild(el("p", "sub", esc(M.kort)));
    var sw = el("div", "sw");
    sw.innerHTML = '<a href="../leren/' + M.id + '.html"' + (mode === "leren" ? ' aria-current="page"' : "") + '>Leerdocument</a><a href="../spiek/' + M.id + '.html"' + (mode === "spiek" ? ' aria-current="page"' : "") + ">Spiekbriefje</a>";
    t.appendChild(sw);
    if (M.wetten && M.wetten.length) {
      var cw = el("div", "chipwet");
      M.wetten.forEach(function (x) { cw.innerHTML += '<a href="https://wetten.overheid.nl/' + x[1] + '" target="_blank" rel="noopener">' + esc(x[0]) + "</a>"; });
      t.appendChild(cw);
    }
    w.appendChild(t);
    root.appendChild(w);
    return w;
  }
  function up() {
    var b = el("button"); b.id = "up"; b.setAttribute("aria-label", "Naar boven"); b.innerHTML = "&#8593;";
    document.body.appendChild(b);
    window.addEventListener("scroll", function () { b.style.display = window.scrollY > 300 ? "block" : "none"; }, { passive: true });
    b.onclick = function () { window.scrollTo({ top: 0, behavior: "smooth" }); };
  }
  function foot(w) { w.appendChild(el("div", "disc", "<b>Let op.</b> " + NOTE)); }

  /* ---------- leerdocument ---------- */
  function block(b, M, idx) {
    var k = b[0], d;
    if (k === "p") return el("p", "", lk(b[1]));
    if (k === "lead") return el("p", "lead", lk(b[1]));
    if (k === "ul" || k === "ol") { d = el(k); b[1].forEach(function (x) { d.appendChild(el("li", "", lk(x))); }); return d; }
    if (k === "tip" || k === "truc" || k === "let" || k === "wet") {
      var lab = { tip: "Tip", truc: "Truc", let: "Let op", wet: "Wet" }[k];
      return el("div", "co " + k, '<span class="l">' + lab + "</span>" + lk(b[1]));
    }
    if (k === "tab") {
      d = el("div", "tw");
      var h = "<table><tr>" + b[1].map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr>";
      b[2].forEach(function (r) { h += "<tr>" + r.map(function (x) { return "<td>" + lk(x) + "</td>"; }).join("") + "</tr>"; });
      d.innerHTML = h + "</table>"; return d;
    }
    if (k === "stap") {
      d = el("ol", "st");
      b[1].forEach(function (s) { d.appendChild(el("li", "", "<div><b>" + lk(s[0]) + "</b>" + lk(s[1]) + "</div>")); });
      return d;
    }
    if (k === "vs") {
      d = el("div", "vs");
      d.innerHTML = '<div class="y"><h4>' + b[1] + "</h4><ul>" + b[2].map(function (x) { return "<li>" + lk(x) + "</li>"; }).join("") + '</ul></div><div class="n"><h4>' + b[3] + "</h4><ul>" + b[4].map(function (x) { return "<li>" + lk(x) + "</li>"; }).join("") + "</ul></div>";
      return d;
    }
    if (k === "dl") {
      d = el("dl", "df");
      b[1].forEach(function (x) { d.appendChild(el("div", "", "<dt>" + lk(x[0]) + "</dt><dd>" + lk(x[1]) + "</dd>")); });
      return d;
    }
    if (k === "casus") {
      d = el("details", "casus");
      d.innerHTML = "<summary>" + esc(b[1]) + '</summary><div class="cb"><p>' + lk(b[2]) + '</p><p class="vraag">' + lk(b[3]) + '</p><details class="ans"><summary>Toon antwoord</summary><div>' + lk(b[4]) + "</div></details></div>";
      return d;
    }
    if (k === "quiz") {
      var saved = sget(M.id + ":quiz", {});
      d = el("div", "quiz");
      d.innerHTML = '<div class="tag">Zelftoets</div><div class="qq">' + lk(b[1]) + '</div><div class="opts"></div><div class="ex" hidden></div>';
      var opts = d.querySelector(".opts"), ex = d.querySelector(".ex"), btns = [];
      function show(ch) {
        btns.forEach(function (x, i) { x.disabled = true; if (i === b[3]) x.classList.add("good"); else if (i === ch) x.classList.add("bad"); });
        ex.hidden = false; ex.innerHTML = (ch === b[3] ? "<b>Goed.</b> " : "<b>Niet helemaal.</b> ") + lk(b[4]);
      }
      b[2].forEach(function (o, i) {
        var bt = el("button", "o", lk(o)); bt.type = "button"; btns.push(bt);
        bt.onclick = function () { var s = sget(M.id + ":quiz", {}); s[idx] = i; sset(M.id + ":quiz", s); show(i); progress(M); };
        opts.appendChild(bt);
      });
      if (saved[idx] != null) show(saved[idx]);
      return d;
    }
    return el("p", "", "");
  }
  function quizCount(M) {
    var n = 0, qs = [];
    M.leren.forEach(function (s, si) { s.b.forEach(function (b, bi) { if (b[0] === "quiz") { qs.push([si + "-" + bi, b[3]]); n++; } }); });
    return qs;
  }
  function progress(M) {
    var p = $("prog"); if (!p) return;
    var qs = quizCount(M), s = sget(M.id + ":quiz", {}), good = 0, done = 0;
    qs.forEach(function (q) { if (s[q[0]] != null) { done++; if (s[q[0]] === q[1]) good++; } });
    p.innerHTML = "<span>Zelftoets: " + good + " van " + qs.length + " goed" + (done < qs.length ? " (" + done + " beantwoord)" : "") + '</span><i><b style="width:' + (qs.length ? Math.round(100 * good / qs.length) : 0) + '%"></b></i>';
  }
  function leren(root, M) {
    var w = header(root, M, "leren");
    var prog = el("div", "prog"); prog.id = "prog"; w.appendChild(prog);
    var nav = el("nav", "tabs");
    M.leren.forEach(function (s, i) { nav.innerHTML += '<a href="#s' + i + '">' + (i + 1) + ". " + esc(s.h) + "</a>"; });
    w.appendChild(nav);
    var main = el("main");
    main.appendChild(el("p", "lead", lk(M.intro)));
    if (M.doelen) main.appendChild(el("div", "goals", "<b>Na dit onderdeel kun je</b><ul>" + M.doelen.map(function (x) { return "<li>" + lk(x) + "</li>"; }).join("") + "</ul>"));
    M.leren.forEach(function (s, i) {
      var sec = el("section"); sec.id = "s" + i;
      sec.appendChild(el("h2", "", '<span class="n">' + (i + 1) + "</span>" + esc(s.h)));
      s.b.forEach(function (b, bi) { sec.appendChild(block(b, M, i + "-" + bi)); });
      main.appendChild(sec);
    });
    w.appendChild(main);
    w.appendChild(el("a", "cta", "Naar het spiekbriefje van dit onderdeel &rarr;")).href = "../spiek/" + M.id + ".html";
    var rs = el("p", "small", '<a href="#" id="rs">Wis mijn zelftoets-voortgang</a>');
    w.appendChild(rs);
    rs.firstChild.onclick = function (e) { e.preventDefault(); sset(M.id + ":quiz", {}); location.reload(); };
    foot(w); up(); progress(M);
  }

  /* ---------- spiekbriefje ---------- */
  var cur, qEl, qx, SM, S;
  function vKern(m) {
    if (S.cijfers) { var bg = el("div", "big"); S.cijfers.forEach(function (c) { bg.innerHTML += "<div><b>" + c[0] + "</b><span>" + lk(c[1]) + "</span></div>"; }); m.appendChild(bg); }
    (S.kern || []).forEach(function (g) {
      var c = el("div", "card"); c.innerHTML = "<h2>" + esc(g[0]) + "</h2>" + g[1].map(function (r) { return '<div class="row"><div class="tag">' + r[0] + '</div><div class="v">' + lk(r[1]) + "</div></div>"; }).join("");
      m.appendChild(c);
    });
  }
  function vTab(m) {
    (S.tabel || []).forEach(function (t) {
      var c = el("div", "card"); c.appendChild(el("h2", "", esc(t[0])));
      var d = el("div", "tw");
      d.innerHTML = "<table><tr>" + t[1].map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr>" + t[2].map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + lk(x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
      c.appendChild(d); m.appendChild(c);
    });
  }
  function vCheck(m) {
    m.appendChild(el("div", "mn", esc(S.checkTitel || "Loop dit af bij elke situatie. Mist er een stap, dan is het antwoord vaak fout.")));
    var card = el("div", "card"), st = sget(SM.id + ":chk", {});
    S.check.forEach(function (c, i) {
      var r = el("div", "chk"); r.setAttribute("role", "checkbox"); r.tabIndex = 0; r.setAttribute("aria-checked", st[i] ? "true" : "false");
      r.innerHTML = '<div class="box">&#10003;</div><div class="t"><b>' + (i + 1) + ". " + lk(c[0]) + "</b><small>" + lk(c[1]) + "</small></div>";
      var f = function () { st[i] = !st[i]; sset(SM.id + ":chk", st); r.setAttribute("aria-checked", st[i] ? "true" : "false"); };
      r.onclick = f; r.onkeydown = function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); f(); } };
      card.appendChild(r);
    });
    m.appendChild(card);
    var b = el("button", "btn", "Wis vinkjes"); b.onclick = function () { st = {}; sset(SM.id + ":chk", {}); draw(); }; m.appendChild(b);
  }
  function vValk(m) {
    m.appendChild(el("div", "mn", "De fouten die het vaakst worden gemaakt."));
    S.valk.forEach(function (x) { m.appendChild(el("div", "mist", "<b>" + lk(x[0]) + '</b><span class="r">' + lk(x[1]) + "</span>")); });
  }
  var bpath = [];
  function vBoom(m) {
    var B = S.boom, id = bpath.length ? bpath[bpath.length - 1] : B.start, n = B.n[id];
    m.appendChild(el("div", "mn", esc(B.titel || "Beantwoord de vragen en kom bij de uitkomst.")));
    var c = el("div", "card");
    if (bpath.length) c.appendChild(el("div", "trail", "Stap " + (bpath.length + 1)));
    if (n.q) {
      c.appendChild(el("div", "bq", lk(n.q)));
      var o = el("div", "bo");
      n.o.forEach(function (x) { var b = el("button", "", lk(x[0])); b.type = "button"; b.onclick = function () { bpath.push(x[1]); draw(); }; o.appendChild(b); });
      c.appendChild(o);
    } else {
      c.appendChild(el("div", "bres " + (n.k || "ok"), lk(n.r) + (n.w ? '<span class="w">' + lk(n.w) + "</span>" : "")));
    }
    m.appendChild(c);
    var ctl = el("div", "ctl");
    var back = el("button", "", "Een stap terug"); back.disabled = !bpath.length; back.onclick = function () { bpath.pop(); draw(); };
    var rs = el("button", "", "Opnieuw beginnen"); rs.onclick = function () { bpath = []; draw(); };
    ctl.appendChild(back); ctl.appendChild(rs); m.appendChild(ctl);
  }
  var cat = "Alle", deck = null, flip = false;
  function known() { return sget(SM.id + ":known", {}); }
  function build() {
    var kn = known();
    deck = S.flits.map(function (c, i) { return i; }).filter(function (i) { return (cat === "Alle" || S.flits[i][0] === cat) && !kn[i]; });
    for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    flip = false;
  }
  function vFlits(m) {
    if (!deck) build();
    var cats = ["Alle"].concat(S.flits.map(function (c) { return c[0]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }));
    var c = el("div", "chips");
    cats.forEach(function (k) { var b = el("button", "", esc(k)); b.setAttribute("aria-pressed", k === cat ? "true" : "false"); b.onclick = function () { cat = k; deck = null; draw(); }; c.appendChild(b); });
    m.appendChild(c);
    var kn = known(), total = S.flits.filter(function (x) { return cat === "Alle" || x[0] === cat; }).length;
    var done = S.flits.filter(function (x, i) { return (cat === "Alle" || x[0] === cat) && kn[i]; }).length;
    if (!deck.length) {
      m.appendChild(el("div", "card", "<h2>Alles gehaald in " + esc(cat === "Alle" ? "alle onderdelen" : cat) + "</h2><p>Je hebt alle " + total + " kaarten als bekend gemarkeerd.</p>"));
      var r = el("button", "btn", "Begin opnieuw"); r.onclick = function () { sset(SM.id + ":known", {}); deck = null; draw(); }; m.appendChild(r); return;
    }
    m.appendChild(el("p", "small", done + " van " + total + " bekend · nog " + deck.length + " te gaan"));
    var ci = deck[0], cd = S.flits[ci];
    var b = el("button", "fl", '<div class="small" style="margin-bottom:6px;font-weight:700;text-transform:uppercase">' + esc(cd[0]) + '</div><div class="q">' + lk(cd[1]) + "</div>" + (flip ? '<div class="a">' + lk(cd[2]) + "</div>" : '<div class="hint">Denk eerst. Tik voor het antwoord.</div>'));
    b.onclick = function () { flip = !flip; draw(); };
    m.appendChild(b);
    var ctl = el("div", "ctl");
    var no = el("button", "", "Nog niet"); no.onclick = function () { deck.push(deck.shift()); flip = false; draw(); };
    var yes = el("button", "go", "Wist ik"); yes.onclick = function () { var k2 = known(); k2[ci] = true; sset(SM.id + ":known", k2); deck.shift(); flip = false; draw(); };
    ctl.appendChild(no); ctl.appendChild(yes); m.appendChild(ctl);
    var rs = el("p", "small", '<a href="#">Wis voortgang</a>'); rs.style.textAlign = "center"; m.appendChild(rs);
    rs.firstChild.onclick = function (e) { e.preventDefault(); sset(SM.id + ":known", {}); deck = null; draw(); };
  }
  function index() {
    var I = [], M = SM;
    (S.kern || []).forEach(function (g) { g[1].forEach(function (r) { I.push(["Kern: " + g[0], strip(r[0]), strip(r[1])]); }); });
    (S.tabel || []).forEach(function (t) { t[2].forEach(function (r) { I.push(["Tabel: " + t[0], strip(r[0]), strip(r.slice(1).join(" · "))]); }); });
    (S.cijfers || []).forEach(function (c) { I.push(["Getal", strip(c[0]), strip(c[1])]); });
    (S.check || []).forEach(function (c) { I.push(["Checklist", strip(c[0]), strip(c[1])]); });
    (S.valk || []).forEach(function (c) { I.push(["Valkuil", strip(c[0]), strip(c[1])]); });
    (S.flits || []).forEach(function (c) { I.push(["Flitskaart: " + c[0], strip(c[1]), strip(c[2])]); });
    return I;
  }
  function hl(t, terms) {
    var out = esc(t);
    terms.forEach(function (w) { out = out.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
    return out;
  }
  function vSearch(m, qv) {
    var I = index(), terms = qv.toLowerCase().split(/\s+/).filter(Boolean);
    var hits = I.filter(function (e) { var h = (e[0] + " " + e[1] + " " + e[2]).toLowerCase(); return terms.every(function (w) { return h.indexOf(w) > -1; }); });
    m.appendChild(el("p", "small", hits.length + " resultaten voor &ldquo;" + esc(qv) + "&rdquo;"));
    var card = el("div", "card");
    if (!hits.length) card.innerHTML = "<p>Niets gevonden. Probeer een korter woord.</p>";
    hits.slice(0, 40).forEach(function (e) { card.innerHTML += '<div class="res"><div class="sec">' + esc(e[0]) + "</div><b>" + hl(e[1], terms) + "</b><span>" + hl(e[2], terms) + "</span></div>"; });
    m.appendChild(card);
  }
  function tabsOf() {
    var t = [["kern", "Kern"]];
    if (S.boom) t.push(["boom", "Beslisboom"]);
    if (S.tabel) t.push(["tabel", "Tabellen"]);
    if (S.check) t.push(["check", "Checklist"]);
    if (S.valk) t.push(["valk", "Valkuilen"]);
    if (S.flits) t.push(["flits", "Flits"]);
    return t;
  }
  function draw() {
    var nav = $("tabs"); nav.innerHTML = "";
    tabsOf().forEach(function (t) {
      var b = el("button", "", t[1]); b.setAttribute("role", "tab"); b.setAttribute("aria-selected", t[0] === cur ? "true" : "false");
      b.onclick = function () { qEl.value = ""; qx.style.display = "none"; cur = t[0]; sset(SM.id + ":tab", cur); draw(); window.scrollTo(0, 0); };
      nav.appendChild(b);
    });
    var m = $("m"); m.innerHTML = "";
    var qv = qEl.value.trim();
    if (qv) return vSearch(m, qv);
    ({ kern: vKern, boom: vBoom, tabel: vTab, check: vCheck, valk: vValk, flits: vFlits })[cur](m);
  }
  function spiek(root, M) {
    SM = M; S = M.spiek;
    var w = header(root, M, "spiek");
    var sb = el("div", "sb", '<input id="q" type="search" placeholder="Zoek in dit spiekbriefje" autocomplete="off" aria-label="Zoeken"><button id="qx" aria-label="Wis zoekopdracht" style="display:none">&times;</button>');
    w.appendChild(sb);
    var nav = el("nav", "tabs"); nav.id = "tabs"; nav.setAttribute("role", "tablist"); w.appendChild(nav);
    var m = el("main"); m.id = "m"; w.appendChild(m);
    var pa = el("div"); pa.id = "pa"; w.appendChild(pa);
    foot(w);
    qEl = $("q"); qx = $("qx");
    var saved = sget(M.id + ":tab", "kern"); cur = tabsOf().some(function (t) { return t[0] === saved; }) ? saved : "kern";
    qEl.addEventListener("input", function () { qx.style.display = qEl.value ? "block" : "none"; draw(); });
    qx.onclick = function () { qEl.value = ""; qx.style.display = "none"; draw(); qEl.focus(); };
    pa.appendChild(el("h2", "", esc(M.titel) + " · spiekbriefje"));
    vKern(pa); vTab(pa); if (S.valk) vValk(pa);
    draw(); up();
  }

  /* ---------- hub ---------- */
  function hubSearch(box, qv) {
    var terms = qv.toLowerCase().split(/\s+/).filter(Boolean), hits = [];
    mods().forEach(function (M) {
      var S2 = M.spiek || {};
      function add(sec, a, b, mode) { var h = (M.titel + " " + sec + " " + a + " " + b).toLowerCase(); if (terms.every(function (w) { return h.indexOf(w) > -1; })) hits.push([M, sec, a, b, mode]); }
      (S2.kern || []).forEach(function (g) { g[1].forEach(function (r) { add("Spiek · " + g[0], strip(r[0]), strip(r[1]), "spiek"); }); });
      (S2.tabel || []).forEach(function (t) { t[2].forEach(function (r) { add("Spiek · " + t[0], strip(r[0]), strip(r.slice(1).join(" · ")), "spiek"); }); });
      (S2.flits || []).forEach(function (c) { add("Flits", strip(c[1]), strip(c[2]), "spiek"); });
      (S2.valk || []).forEach(function (c) { add("Valkuil", strip(c[0]), strip(c[1]), "spiek"); });
      (M.leren || []).forEach(function (s) { s.b.forEach(function (b) { if (b[0] === "p" || b[0] === "tip" || b[0] === "truc" || b[0] === "let") add("Leren · " + s.h, strip(b[1]).slice(0, 70), strip(b[1]), "leren"); }); });
    });
    box.innerHTML = "";
    box.appendChild(el("p", "small", hits.length + " resultaten voor &ldquo;" + esc(qv) + "&rdquo;"));
    var card = el("div", "card");
    if (!hits.length) card.innerHTML = "<p>Niets gevonden. Probeer een korter woord, bijvoorbeeld &lsquo;24 uur&rsquo; of &lsquo;lijst II&rsquo;.</p>";
    hits.slice(0, 30).forEach(function (h) {
      var M = h[0], t = h[3].length > 220 ? h[3].slice(0, 220) + "…" : h[3];
      card.innerHTML += '<div class="res"><div class="sec">' + esc(M.titel) + " · " + esc(h[1]) + '</div><b><a href="' + h[4] + "/" + M.id + '.html">' + hl(h[2], terms) + "</a></b><span>" + hl(t, terms) + "</span></div>";
    });
    box.appendChild(card);
  }
  function hub(root) {
    var w = el("div", "wrap wide");
    var hero = el("div", "hero");
    hero.innerHTML = '<div class="crumb"><span class="rk">Voor de politieagent</span></div><h1>Politiehandboek</h1><p class="sub">Per onderdeel een leerdocument om te begrijpen en een spiekbriefje om op straat te gebruiken. Met beslisbomen, flitskaarten, zelftoetsen en tips en trucs.</p>';
    w.appendChild(hero);
    var route = el("div", "route");
    [1, 2, 3, 4].forEach(function (r) { route.innerHTML += '<div class="r' + r + '"><b>' + r + ". " + REEKS[r][0] + "</b><span>" + REEKS[r][1] + "</span></div>"; });
    w.appendChild(route);
    w.appendChild(el("p", "small", "De volgorde is bewust zo gekozen: eerst het fundament (wat mag, wanneer, waarom), dan de praktijk op straat, dan de bijzondere wetten, en tot slot het vastleggen en verantwoorden. Wie de reeksen op volgorde doorneemt, kan bij elk onderdeel terugvallen op wat eerder is behandeld."));
    var sb = el("div", "sb", '<input id="hq" type="search" placeholder="Zoek in alle onderdelen, bijv. 9 uur, lijst II, wapenstok, heterdaad" autocomplete="off" aria-label="Zoeken in het hele handboek"><button id="hx" aria-label="Wis zoekopdracht" style="display:none">&times;</button>');
    w.appendChild(sb);
    var sres = el("div"); sres.id = "sres"; w.appendChild(sres);
    var grid = el("div"); grid.id = "grid"; w.appendChild(grid);
    var all = mods();
    [1, 2, 3, 4].forEach(function (r) {
      var list = all.filter(function (m) { return m.reeks === r; });
      if (!list.length) return;
      var g = el("div", "r" + r);
      g.appendChild(el("div", "gr", "<h2>Reeks " + r + " · " + REEKS[r][0] + "</h2><span>" + REEKS[r][1] + "</span>"));
      var mg = el("div", "mods");
      list.forEach(function (M) {
        var c = el("div", "mod");
        c.innerHTML = '<span class="nr">ONDERDEEL ' + M.nr + "</span><h3>" + esc(M.titel) + "</h3><p>" + esc(M.kort) + '</p><div class="bt"><a class="fill" href="leren/' + M.id + '.html">Leerdocument</a><a href="spiek/' + M.id + '.html">Spiekbriefje</a></div>';
        mg.appendChild(c);
      });
      g.appendChild(mg); grid.appendChild(g);
    });
    var ex = el("div", "card"); ex.style.marginTop = "22px";
    ex.innerHTML = '<h2>Ook handig</h2><p class="small" style="margin:0">Het spiekbriefje Geweldsbeheersing (Ambtsinstructie, geweldmiddelen, melden) staat al klaar: <a href="https://claude.ai/artifact/BECvh8b3iBHfo51kS6zb8x" target="_blank" rel="noopener">openen</a>. Dat onderdeel is hier niet opnieuw gemaakt.</p>';
    w.appendChild(ex);
    foot(w);
    root.appendChild(w);
    var hq = $("hq"), hx = $("hx");
    function run() { var v = hq.value.trim(); hx.style.display = hq.value ? "block" : "none"; grid.style.display = v ? "none" : ""; sres.innerHTML = ""; if (v) hubSearch(sres, v); }
    hq.addEventListener("input", run); hx.onclick = function () { hq.value = ""; run(); hq.focus(); };
    up();
  }

  /* ---------- start ---------- */
  function start() {
    var root = $("app"), mode = window.MODE;
    if (mode === "hub") return hub(root);
    var M = mods()[0];
    if (mode === "leren") leren(root, M); else spiek(root, M);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
