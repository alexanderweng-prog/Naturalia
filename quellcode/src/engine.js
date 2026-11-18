const $id = id => document.getElementById(id);
const nextFrame = f => requestAnimationFrame(() => requestAnimationFrame(f));
const nf = (host, f) => nextFrame(() => { if (host.isConnected) f(); });
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const sl = (id, label, min, max, step, val, unit) =>
  `<label class="sl"><span class="sll">${label}: <b class="mono" id="${id}v"></b> ${unit}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
const brow = (name, id, vid) =>
  `<div class="brow"><span class="bname">${name}</span><div class="btrack"><div class="bfill" id="${id}"></div></div><b class="mono bval" id="${vid}"></b></div>`;
// Zahl weich hochzählen lassen
function tween(from, to, ms, cb) {
  if (reduced() || from === to) { cb(to); return; }
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / ms);
    cb(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- Speicher ---------- */
// Das aktive Reich (Kapitel). Wird mit loadChapter() gewechselt; jedes Reich speichert unter seinem alten Schlüssel weiter.
let STATIONS = [], LEVELS = [], TOPIC = {}, SIMS = {}, REALM = null, KEY = '', CARD = 'Zauberbuch';
const CACHE = {};
function chapterData(id) {
  if (!CACHE[id]) {
    const d = CHAPTERS[id]();
    const r = REALMS.find(x => x.id === id);
    // Ränge: XP-Schwellen bleiben wie im Kapitel, die Namen kommen aus dem Reich
    d.LEVELS = d.LEVELS.map((lv, i) => ({ xp: lv.xp, name: r.ranks[i] || lv.name, pw: RANK_PW[i] || lv.pw }));
    CACHE[id] = d;
  }
  return CACHE[id];
}
function defaults() { return { xp: 0, streak: 0, lastDay: null, stars: {}, items: {}, rounds: 0, lessons: {}, nick: null, challenges: {}, classCode: '', weekKey: 0, weekXp: 0, introDone: false, realName: '', trophies: {}, trophySeen: {}, perfect: 0, reviews: 0 }; }
let memoryOnly = null;
function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return Object.assign(defaults(), JSON.parse(raw));
  } catch (e) { /* Speicher nicht verfügbar */ }
  return defaults();
}
function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { memoryOnly = true; }
}
let state = defaults();

/* ---------- Heldenprofil: gilt in allen Reichen ---------- */
const PROFILE_KEY = 'halingen-naturalia-profil-v1';
let profile = (() => {
  let p = null;
  try { const raw = window.localStorage.getItem(PROFILE_KEY); if (raw) p = JSON.parse(raw); } catch (e) { /* ohne Speicher */ }
  p = Object.assign({ nick: '', classCode: '', realName: '', introDone: false, worldTrophies: {} }, p || {});
  if (!p.nick || !p.classCode) {
    // Bestehender Fortschritt aus den alten Einzel-Apps: Name und Klasse übernehmen
    REALMS.forEach(r => {
      try {
        const raw = window.localStorage.getItem(r.storeKey); if (!raw) return;
        const s = JSON.parse(raw);
        if (!p.nick && s.nick) p.nick = s.nick;
        if (!p.classCode && s.classCode) p.classCode = s.classCode;
        if (!p.realName && s.realName) p.realName = s.realName;
      } catch (e) { /* ignorieren */ }
    });
  }
  if (!p.nick) p.nick = newNick();
  return p;
})();
function saveProfile() { try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { memoryOnly = true; } }
saveProfile();

function loadChapter(id) {
  const d = chapterData(id);
  REALM = REALMS.find(x => x.id === id);
  STATIONS = d.STATIONS; LEVELS = d.LEVELS; TOPIC = d.TOPIC; SIMS = d.SIMS || {};
  KEY = TOPIC.storeKey; CARD = 'Zauberbuch';
  if (!TOPIC.audio) TOPIC.audio = { dir: TOPIC.id, files: false };
  WATTI_TIPS = (REALM.tips || []).concat(TOPIC.tips || [], ELIXA_TIPS);
  tipI = 0;
  state = load();
  // Ein Heldenname und eine Gilde für alle Reiche
  state.nick = profile.nick;
  state.realName = profile.realName;
  state.introDone = state.introDone || profile.introDone;
  if (profile.classCode && state.classCode !== profile.classCode) state.classCode = profile.classCode;
  save();
  BE.board = null; BE.boardAt = 0; BE.school = null; BE.schoolAt = 0; BE.classes = null; BE.classesAt = 0; BE.status = '';
  R = null; L = null;
}
// Kennzahlen eines Reichs direkt aus dem Speicher lesen (für die Weltkarte)
function realmStats(r) {
  let s = {};
  try { const raw = window.localStorage.getItem(r.storeKey); if (raw) s = JSON.parse(raw) || {}; } catch (e) { /* ohne Speicher */ }
  const d = chapterData(r.id), stars = s.stars || {}, lessons = s.lessons || {}, xp = s.xp || 0;
  let lv = 0; d.LEVELS.forEach((l, i) => { if (xp >= l.xp) lv = i; });
  return {
    xp, lv, lvName: d.LEVELS[lv].name, rounds: s.rounds || 0, stars, lessons, stations: d.STATIONS,
    passed: d.STATIONS.filter(st => (stars[st.id] || 0) >= 1).length,
    starSum: d.STATIONS.reduce((a, st) => a + (stars[st.id] || 0), 0),
    trophies: Object.keys(s.trophies || {}).length, weekXp: s.weekXp || 0
  };
}

/* ---------- Spielregeln ---------- */
function dayIdx() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
function streakNow() {
  if (state.lastDay === null) return 0;
  return (dayIdx() - state.lastDay) > 2 ? 0 : state.streak;
}
function touchStreak() {
  const t = dayIdx();
  if (state.lastDay === null) state.streak = 1;
  else {
    const diff = t - state.lastDay;
    if (diff === 0) { /* heute schon gezählt */ }
    else if (diff <= 2) state.streak += 1; // ein freier Tag ist erlaubt (Schonfrist)
    else state.streak = 1;
  }
  state.lastDay = t;
}
/* ---------- Trophäen ---------- */
const allSt = f => STATIONS.every(st => f(st));
const TROPHIES = [
  { id: 'start', icon: '\u{1F5DD}', name: 'Der erste Schlüssel', how: 'Schliesse deine erste Runde ab.', test: s => s.rounds >= 1 },
  { id: 'lektion', icon: '\u{1F4DC}', name: 'Entrollte Schrift', how: 'Lies eine Schriftrolle bis zum Ende.', test: s => Object.keys(s.lessons).length >= 1 },
  { id: 'lektionen', icon: '\u{1F4DA}', name: 'Hüter der Bibliothek', how: 'Lies alle Schriftrollen dieses Reichs.', test: s => allSt(st => s.lessons[st.id]) },
  { id: 'perfekt', icon: '\u{1F3F9}', name: 'Elfenpfeil', how: 'Löse eine Runde fehlerlos beim ersten Versuch.', test: s => s.perfect >= 1 },
  { id: 'perfekt3', icon: '\u{1F48E}', name: 'Drei Kristalle', how: 'Löse drei Runden fehlerlos.', test: s => s.perfect >= 3 },
  { id: 'stern3', icon: '\u2B50', name: 'Sternenkrone', how: 'Hole in einer Quest drei Sterne.', test: s => STATIONS.some(st => (s.stars[st.id] || 0) >= 3) },
  { id: 'alle1', icon: '\u{1F5FA}', name: 'Kartograf', how: 'Bestehe jede Quest mit mindestens einem Stern.', test: s => allSt(st => (s.stars[st.id] || 0) >= 1) },
  { id: 'alle3', icon: '\u{1F31F}', name: 'Sternenhimmel', how: 'Hole in allen Quests drei Sterne.', test: s => allSt(st => (s.stars[st.id] || 0) >= 3) },
  { id: 'serie3', icon: '\u{1F525}', name: 'Ewige Flamme', how: 'Halte deine Flamme 3 Tage am Brennen.', test: () => streakNow() >= 3 },
  { id: 'serie7', icon: '\u{1F409}', name: 'Drachenatem', how: 'Halte deine Flamme 7 Tage am Brennen.', test: () => streakNow() >= 7 },
  { id: 'stufe3', icon: '\u{1F9EA}', name: 'Erstes Elixier', how: 'Erreiche Rang 3.', test: s => levelOf(s.xp) >= 2 },
  { id: 'stufe6', icon: '\u{1F451}', name: 'Krone des Reichs', how: 'Erreiche Rang 6.', test: s => levelOf(s.xp) >= 5 },
  { id: 'auffrischen', icon: '\u{1F52E}', name: 'Kristallkugel', how: 'Schliesse drei Runden an der Erinnerungsquelle ab.', test: s => s.reviews >= 3 },
  { id: 'challenge', icon: '\u2694\uFE0F', name: 'Herausforderer', how: 'Kämpfe in einem Duell (Challenge).', test: s => Object.keys(s.challenges).length >= 1 },
  { id: 'challenge6', icon: '\u{1F3C6}', name: 'Duellmeister', how: 'Gewinne ein Duell fehlerlos (6 von 6).', test: s => Object.keys(s.challenges).some(k => s.challenges[k].c === 6) },
  { id: 'klasse', icon: '\u{1F6E1}', name: 'Gildenwappen', how: 'Tritt einer Gilde (Klasse) bei.', test: s => !!s.classCode },
  { id: 'runden10', icon: '\u{1F396}', name: 'Veteran', how: 'Schliesse 10 Runden ab.', test: s => s.rounds >= 10 }
];
function checkTrophies() {
  const fresh = [];
  TROPHIES.forEach(t => { if (!state.trophies[t.id] && t.test(state)) { state.trophies[t.id] = Date.now(); fresh.push(t); } });
  return fresh;
}
const newTrophyHtml = list => (list && list.length) ? list.map(t => `<div class="fb good"><div class="fbt"><span aria-hidden="true">${t.icon}</span> Neues Artefakt: ${t.name}</div><p class="small">${t.how}</p></div>`).join('') : '';
function trophyBar() {
  const n = TROPHIES.filter(t => state.trophies[t.id]).length, fresh = TROPHIES.filter(t => state.trophies[t.id] && !state.trophySeen[t.id]).length;
  return `<button class="trophybar" data-act="trophies"><span class="ticon" aria-hidden="true">\u{1F3FA}</span><span class="tb"><b>Schatzkammer</b><small>${n} von ${TROPHIES.length} Artefakten gefunden</small></span>${fresh ? `<span class="tnew">${fresh} neu</span>` : ''}</button>`;
}
function viewTrophies() {
  const n = TROPHIES.filter(t => state.trophies[t.id]).length;
  return `
  <main class="wrap">
    <div class="rtop"><button class="btn sm" data-act="home">Zurück ins Reich</button><span class="mono small">${n} von ${TROPHIES.length}</span></div>
    <h2 class="sumh">Schatzkammer: ${REALM.name}</h2>
    <p class="small">Artefakte findest du, indem du lernst, übst und dranbleibst. Versiegelte Artefakte zeigen dir, was du dafür tun musst.</p>
    <div class="tgrid">${TROPHIES.map(t => { const got = !!state.trophies[t.id]; return `<div class="trophy ${got ? 'got' : 'locked'}"><span class="ticon" aria-hidden="true">${got ? t.icon : '\u{1F512}'}</span><b>${t.name}</b><small>${t.how}</small>${got ? '<span class="tdone">gefunden</span>' : ''}</div>`; }).join('')}</div>
  </main>`;
}

function bumpXp(n) {
  const wk = Math.floor((dayIdx() + 3) / 7);
  if (state.weekKey !== wk) { state.weekKey = wk; state.weekXp = 0; }
  state.xp += n; state.weekXp += n;
}
function levelOf(xp) {
  let l = 0;
  LEVELS.forEach((lv, i) => { if (xp >= lv.xp) l = i; });
  return l;
}
function starsFor(c) { return c >= 6 ? 3 : c === 5 ? 2 : c === 4 ? 1 : 0; }
function stationUnlocked(s) {
  if (s.nr === 1) return true;
  const prev = STATIONS[s.nr - 2];
  return (state.stars[prev.id] || 0) >= 1;
}
function mastered(t) { const it = state.items[t.id]; return !!it && it.box >= 2; }
function reviewPool() {
  const pool = [];
  STATIONS.forEach(s => { if (state.stars[s.id] !== undefined) s.items.forEach(t => pool.push(t)); });
  return pool;
}
function dueCount() {
  const now = Date.now();
  return reviewPool().filter(t => { const it = state.items[t.id]; return !it || it.due <= now; }).length;
}
function stationOf(tpl) { return STATIONS.find(s => s.items.some(t => t.id === tpl.id)); }

/* ---------- Runde ---------- */
let R = null;
let ui = { screen: 'home', formulas: false, confirmReset: false, chCode: '', chErr: '', clsErr: '', anim: true };

function inst(tpl, retry) {
  const d = tpl.make();
  if (d.type === 'mc') d.shown = shuffle(d.options.map((t, i) => ({ t, ok: i === 0 })));
  return { tpl, d, retry: !!retry, attempts: 0, done: false, sel: null, input: '', fb: null, firstLogged: false };
}
function buildChallenge(code) {
  const m = /^([1-6])-/.exec(code); const N = m ? +m[1] : 6;
  RNG = seeded(TOPIC.id + ':' + code);
  try {
    const used = new Set(), picks = [];
    for (let i = 0; i < 6; i++) {
      const st = STATIONS[i % N];
      const pool = st.items.filter(t => !used.has(t.id));
      const t = rnd(pool.length ? pool : st.items);
      used.add(t.id); picks.push(t);
    }
    return shuffle(picks).map(t => inst(t));
  } finally { RNG = Math.random; }
}
function startRound(what, code) {
  if (what === 'challenge') {
    R = { mode: 'challenge', code, st: null, queue: buildChallenge(code), i: 0, results: [], xp: 0, base: 6, t0: Date.now() };
    ui.screen = 'round'; ui.formulas = false;
    render();
    return;
  }
  let tpls, st = null;
  if (what === 'review') {
    const now = Date.now();
    tpls = reviewPool().map(t => {
      const it = state.items[t.id] || { box: 0, due: 0 };
      return { t, k: (it.due <= now ? 0 : 1) * 10 + it.box + Math.random() };
    }).sort((a, b) => a.k - b.k).slice(0, ROUND_SIZE).map(x => x.t);
    tpls = shuffle(tpls);
  } else {
    st = STATIONS.find(s => s.id === what);
    tpls = shuffle(st.items);
  }
  R = { mode: what === 'review' ? 'review' : 'station', st, queue: tpls.map(t => inst(t)), i: 0, results: [], xp: 0, base: tpls.length };
  ui.screen = 'round'; ui.formulas = false;
  render();
}
function logFirst(q, ok) {
  if (q.retry || q.firstLogged) return;
  q.firstLogged = true;
  R.results.push({ id: q.tpl.id, ok, topic: q.tpl.topic });
  if (!ok && R.mode !== 'challenge') R.queue.push(inst(q.tpl, true));
}
function parseNum(s) {
  s = String(s).trim().replace(/[\s\u202F\u2019']/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
  return parseFloat(s);
}
function answerMC(i) {
  const q = R.queue[R.i];
  if (q.done) return;
  const ok = q.d.shown[i].ok;
  q.sel = i; q.done = true;
  logFirst(q, ok);
  if (ok) {
    const gain = q.retry ? 3 : 10; R.xp += gain;
    q.fb = { kind: 'good', title: q.retry ? 'Richtig. Diesmal hast du ihn besiegt.' : 'Richtig.', body: q.d.explain, xp: gain };
  } else {
    q.fb = { kind: 'bad', title: 'Nicht ganz.', body: q.d.explain + (q.retry || R.mode === 'challenge' ? '' : '<br><br>Diese Frage kehrt am Ende der Runde zurück.') };
  }
  render('fb');
}
function checkNum() {
  const q = R.queue[R.i];
  if (q.done) return;
  const el = document.getElementById('ans');
  q.input = el ? el.value : q.input;
  const x = parseNum(q.input);
  if (isNaN(x)) { q.fb = { kind: 'warn', title: 'Gib eine Zahl ein.', body: 'Zum Beispiel 120 oder 2,5.' }; render('keep'); return; }
  const d = q.d;
  const ok = Math.abs(x - d.ans) <= Math.max(Math.abs(d.ans) * d.tolRel, d.tolAbs, 1e-9);
  if (ok) {
    q.done = true;
    logFirst(q, q.attempts === 0);
    const gain = q.retry ? 3 : (q.attempts === 0 ? 10 : 5); R.xp += gain;
    q.fb = { kind: 'good', title: q.attempts === 0 ? 'Richtig.' : 'Richtig im zweiten Versuch.', body: d.explain, xp: gain };
  } else if (q.attempts === 0 && R.mode !== 'challenge') {
    q.attempts = 1;
    logFirst(q, false);
    q.fb = { kind: 'warn', title: 'Noch nicht.', body: 'Tipp: ' + d.hint + '<br>Du hast noch einen Versuch.' };
  } else {
    q.done = true;
    logFirst(q, false);
    q.fb = { kind: 'bad', title: 'Nicht ganz.', body: 'Richtig wäre ' + fmt(d.ans, 2) + ' ' + d.unit + '.<br>' + d.explain };
  }
  render('fb');
}
function nextQ() {
  R.i += 1;
  if (R.i >= R.queue.length) finishRound(); else render();
}
function finishRound() {
  const before = state.xp;
  const lvBefore = levelOf(before);
  const c = R.results.slice(0, R.base).filter(r => r.ok).length;
  const stars = starsFor(c);
  let bonus = 0;
  if (R.mode === 'station') bonus = stars === 3 ? 20 : stars === 2 ? 10 : stars === 1 ? 5 : 0;
  else if (R.mode === 'challenge') bonus = c === 6 ? 20 : c >= 4 ? 10 : 0;
  else bonus = c >= 5 ? 10 : 0;
  // Karteikasten aktualisieren
  const now = Date.now();
  R.results.forEach(r => {
    const it = state.items[r.id] || { box: 0, due: 0 };
    it.box = r.ok ? Math.min(4, it.box + 1) : 0;
    it.due = now + INTERVALS[it.box] * 86400000;
    state.items[r.id] = it;
  });
  if (R.mode === 'station') state.stars[R.st.id] = Math.max(state.stars[R.st.id] || 0, stars);
  let chInfo = null;
  if (R.mode === 'challenge') {
    const t = Math.max(1, Math.round((Date.now() - R.t0) / 1000));
    const prev = state.challenges[R.code] || null;
    if (!prev) state.challenges[R.code] = { c, t };
    chInfo = { code: R.code, c, t, prev, line: `${state.nick} \u00B7 ${c} von 6 \u00B7 ${t} s \u00B7 Code ${R.code}` };
  }
  const gained = R.xp + bonus;
  bumpXp(gained);
  state.rounds += 1;
  if (c === R.base) state.perfect = (state.perfect || 0) + 1;
  if (R.mode === 'review') state.reviews = (state.reviews || 0) + 1;
  touchStreak();
  const newTrophies = checkTrophies();
  save();
  R.summary = {
    c, stars, bonus, gained, base: R.base, ch: chInfo,
    levelUp: levelOf(state.xp) > lvBefore ? levelOf(state.xp) : null, newTrophies,
    missed: R.results.filter(r => !r.ok).map(r => r.topic)
  };
  if (R.mode === 'challenge') { BE.chBoard = null; BE.chStatus = ''; BE.chClasses = null; BE.chClsStatus = ''; }
  ui.screen = 'summary';
  render();
  if (state.classCode) pushProgress();
  if (R.mode === 'challenge') afterChallenge(chInfo);
}

/* ---------- Darstellung ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const starTxt = n => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);

function formulaCard() {
  const rows = TOPIC.formulas;
  return `<section class="card formulas" aria-label="${CARD}">
    <div class="tag">${CARD}</div>
    <table>${rows.map(r => `<tr><th scope="row">${r[0]}</th><td><span class="mono b">${r[1]}</span><br><span class="mono m">${r[2]}</span></td></tr>`).join('')}</table>
  </section>`;
}

/* ---------- QR-Lernstand: Verschlüsselung (WebCrypto) ----------
   Hybridverfahren: Die Schüler-App kennt nur den ÖFFENTLICHEN Schlüssel der Lehrperson.
   Pro Code wird ein neues Schlüsselpaar erzeugt (ECDH P-256), daraus per HKDF ein AES-GCM-Schlüssel
   abgeleitet und der Lernstand verschlüsselt. Nur der private Schlüssel der Prüf-App kann ihn öffnen.
   Format: "LQ1." + base64url( [Version, Komprimiert] + 65 Byte Absender-Schlüssel + 12 Byte IV + Chiffrat )   */
const LQ = (() => {
  const te = new TextEncoder(), td = new TextDecoder();
  const b64u = {
    enc(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec(str) { let s = str.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  };
  async function pipe(u8, stream) {
    const w = stream.writable.getWriter(); w.write(u8); w.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }
  const deflate = u8 => (typeof CompressionStream === 'undefined' ? Promise.resolve(null) : pipe(u8, new CompressionStream('deflate-raw')));
  const inflate = u8 => pipe(u8, new DecompressionStream('deflate-raw'));
  const ALGO = { name: 'ECDH', namedCurve: 'P-256' };
  async function aesKey(secretBits, usage) {
    const hk = await crypto.subtle.importKey('raw', secretBits, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode('leistung-qr-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }
  return {
    b64u,
    randomId(n) { return b64u.enc(crypto.getRandomValues(new Uint8Array(n))); },
    // Lehrperson: Schlüsselpaar erzeugen. publicKey = Text für config.js, privateJwk bleibt in der Prüf-App.
    async generateTeacherKeys() {
      const kp = await crypto.subtle.generateKey(ALGO, true, ['deriveBits']);
      return { publicKey: b64u.enc(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
    },
    async encrypt(teacherPublicKey, obj) {
      const raw = te.encode(JSON.stringify(obj));
      let body = raw, flag = 0;
      const z = await deflate(raw);
      if (z && z.length < raw.length) { body = z; flag = 1; }
      const pub = await crypto.subtle.importKey('raw', b64u.dec(teacherPublicKey), ALGO, false, []);
      const eph = await crypto.subtle.generateKey(ALGO, true, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256);
      const key = await aesKey(bits, 'encrypt');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const header = new Uint8Array([1, flag]);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, body));
      const ephRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
      const out = new Uint8Array(2 + 65 + 12 + ct.length);
      out.set(header, 0); out.set(ephRaw, 2); out.set(iv, 67); out.set(ct, 79);
      return 'LQ1.' + b64u.enc(out);
    },
    async decrypt(token, privateJwk) {
      if (typeof token !== 'string' || token.slice(0, 4) !== 'LQ1.') throw new Error('Das ist kein Lernstand-Code dieser App.');
      let data;
      try { data = b64u.dec(token.slice(4).trim()); } catch (e) { throw new Error('Der Code ist beschädigt.'); }
      if (data.length < 80 || data[0] !== 1) throw new Error('Unbekannte Version oder beschädigter Code.');
      const header = data.slice(0, 2), ephRaw = data.slice(2, 67), iv = data.slice(67, 79), ct = data.slice(79);
      try {
        const priv = await crypto.subtle.importKey('jwk', privateJwk, ALGO, false, ['deriveBits']);
        const eph = await crypto.subtle.importKey('raw', ephRaw, ALGO, false, []);
        const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: eph }, priv, 256);
        const key = await aesKey(bits, 'decrypt');
        let body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: header }, key, ct));
        if (header[1] === 1) body = await inflate(body);
        return JSON.parse(td.decode(body));
      } catch (e) {
        throw new Error('Der Code lässt sich mit deinem Schlüssel nicht öffnen. Er wurde verändert oder gehört zu einem anderen Schlüssel.');
      }
    }
  };
})();


/* ---------- Backend (optional): Klassenwertung über Supabase ---------- */
const CFG = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
const BE = { client: null, board: null, boardAt: 0, loading: false, status: '', chBoard: null, chStatus: '', pushing: false, pushAgain: false };
function beInit() {
  try {
    if (CFG.supabaseUrl && CFG.supabaseKey && window.supabase && window.supabase.createClient) {
      BE.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    }
  } catch (e) { BE.client = null; }
}
const weekKey = () => Math.floor((dayIdx() + 3) / 7); // Wochen beginnen am Montag
// Schulcode aus config.js: trennt die Wertung der Schule von anderen Schulen. Leer = keine Schulwertung.
const schoolCode = () => { const s = String(CFG.schoolCode || '').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 20); return s.length >= 3 ? s : ''; };
// Klassen oder Gruppen, die im Duell verglichen werden (leer = alle Klassen der Schule)
const duelArr = () => { const a = String(ui.duelInput || '').split(/[,;\s]+/).map(x => x.toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 20)).filter(x => x.length >= 3); return a.length ? a.slice(0, 8) : null; };
let authP = null;
function ensureAuth() {
  if (!authP) {
    authP = (async () => {
      const s = await BE.client.auth.getSession();
      if (s && s.data && s.data.session) return;
      const r = await BE.client.auth.signInAnonymously();
      if (r.error) throw r.error;
    })().catch(e => { authP = null; throw e; });
  }
  return authP;
}
async function rpc(name, args) {
  await ensureAuth();
  const r = await BE.client.rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
const wait = ms => new Promise(res => setTimeout(res, ms));

async function pushProgress() {
  if (!BE.client || !state.classCode) return;
  if (BE.pushing) { BE.pushAgain = true; return; }
  BE.pushing = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const wk = weekKey();
        await rpc('submit_progress', {
          p_topic: TOPIC.id, p_class: state.classCode, p_nick: state.nick, p_week: wk,
          p_week_xp: state.weekKey === wk ? state.weekXp : 0,
          p_total_xp: state.xp, p_level: levelOf(state.xp) + 1, p_school: schoolCode()
        });
        BE.status = ''; BE.boardAt = 0; BE.schoolAt = 0; BE.classesAt = 0;
        break;
      } catch (e) {
        if (attempt === 0 && /zu schnell/.test(String(e && e.message))) { await wait(3500); continue; }
        BE.status = 'Dein Punktestand konnte gerade nicht an die Gilde gesendet werden.';
        break;
      }
    }
  } finally {
    BE.pushing = false;
    if (BE.pushAgain) { BE.pushAgain = false; pushProgress(); }
  }
  paintBoard();
}
async function loadBoard(force) {
  if (!BE.client || !state.classCode || BE.loading) return;
  if (!force && BE.boardAt && Date.now() - BE.boardAt < 20000) { paintBoard(); return; }
  BE.loading = true;
  try {
    const rows = await rpc('leaderboard', { p_topic: TOPIC.id, p_class: state.classCode, p_week: weekKey() });
    BE.board = { rows, n: rows.length ? rows[0].n_players : 0, total: rows.length ? rows[0].total_week_xp : 0 };
    BE.boardAt = Date.now(); BE.status = '';
  } catch (e) { BE.status = 'Die Rangliste konnte gerade nicht geladen werden.'; }
  BE.loading = false;
  paintBoard();
}
async function loadSchool(force) {
  if (!BE.client || !schoolCode() || !state.classCode || BE.loadingS) return;
  if (!force && BE.schoolAt && Date.now() - BE.schoolAt < 20000) { paintBoard(); return; }
  BE.loadingS = true;
  try { BE.school = await rpc('school_leaderboard', { p_topic: TOPIC.id, p_school: schoolCode(), p_week: weekKey() }); BE.schoolAt = Date.now(); BE.status = ''; }
  catch (e) { BE.status = 'Die Schulwertung konnte gerade nicht geladen werden.'; }
  BE.loadingS = false;
  paintBoard();
}
async function loadClasses(force) {
  if (!BE.client || !schoolCode() || !state.classCode || BE.loadingC) return;
  if (!force && BE.classesAt && Date.now() - BE.classesAt < 20000) { paintBoard(); return; }
  BE.loadingC = true;
  try { BE.classes = await rpc('class_ranking', { p_topic: TOPIC.id, p_school: schoolCode(), p_week: weekKey(), p_codes: duelArr() }); BE.classesAt = Date.now(); BE.status = ''; }
  catch (e) { BE.status = 'Der Klassenvergleich konnte gerade nicht geladen werden.'; }
  BE.loadingC = false;
  paintBoard();
}
async function afterChallenge(ch) {
  if (!BE.client || !state.classCode) return;
  BE.chBoard = null; BE.chStatus = ''; BE.chClasses = null; BE.chClsStatus = '';
  try {
    if (!ch.prev) await rpc('submit_challenge', { p_topic: TOPIC.id, p_class: state.classCode, p_code: ch.code, p_nick: state.nick, p_correct: ch.c, p_seconds: Math.max(8, ch.t), p_school: schoolCode() });
    BE.chBoard = await rpc('challenge_ranking', { p_topic: TOPIC.id, p_class: state.classCode, p_code: ch.code });
  } catch (e) { BE.chStatus = 'Die Rangliste zu dieser Challenge konnte gerade nicht geladen werden.'; }
  paintChBoard();
  if (schoolCode()) {
    try { BE.chClasses = await rpc('class_challenge_ranking', { p_topic: TOPIC.id, p_school: schoolCode(), p_code: ch.code, p_codes: duelArr() }); BE.chClsStatus = ''; }
    catch (e) { BE.chClsStatus = 'Der Klassenvergleich konnte gerade nicht geladen werden.'; }
    paintChBoard();
  }
}
async function joinClass() {
  const el = $id('clscode');
  const code = normCode(el ? el.value : '');
  if (code.length < 3) { ui.clsErr = 'Der Klassencode braucht mindestens 3 Zeichen.'; render('keep'); return; }
  ui.clsErr = '';
  state.classCode = code; save();
  profile.classCode = code; saveProfile();
  BE.board = null; BE.boardAt = Date.now();
  render('keep');
  await pushProgress();
  loadBoard(true);
}
async function leaveClass(wipe) {
  if (BE.client && (state.classCode || wipe)) { try { await rpc('leave_class', { p_topic: TOPIC.id }); } catch (e) { /* offline: Zeile bleibt, Lehrperson kann sie löschen */ } }
  state.classCode = ''; save();
  if (!wipe) {
    // Die Gilde gilt in allen Reichen: überall austreten
    profile.classCode = ''; saveProfile();
    for (const r of REALMS) {
      if (r.id === TOPIC.id) continue;
      let s = null;
      try { s = JSON.parse(window.localStorage.getItem(r.storeKey) || 'null'); } catch (e) { s = null; }
      if (!s || !s.classCode) continue;
      if (BE.client) { try { await rpc('leave_class', { p_topic: r.id }); } catch (e) { /* offline */ } }
      s.classCode = '';
      try { window.localStorage.setItem(r.storeKey, JSON.stringify(s)); } catch (e) { /* ohne Speicher */ }
    }
  }
  BE.board = null; BE.boardAt = 0; BE.school = null; BE.schoolAt = 0; BE.classes = null; BE.classesAt = 0; ui.bt = 'class';
}

function boardHtml() {
  const b = BE.board;
  if (!b) return '<p class="small">Rangliste wird geladen …</p>';
  if (!b.rows.length) return '<p class="small">Diese Woche hat noch niemand Punkte. Spiele eine Runde, dann erscheinst du hier.</p>';
  const per = Number(CFG.weeklyGoalPerPlayer) || 100;
  const goal = Math.max(per, b.n * per), pct = Math.min(100, Math.round(b.total / goal * 100));
  let prev = 0;
  const rows = b.rows.map(r => {
    const gap = prev && r.rank > prev + 1 ? '<li class="gap" aria-hidden="true">\u2026</li>' : '';
    prev = r.rank;
    return gap + `<li class="${r.is_me ? 'me' : ''}"><span class="rk mono">${r.rank}</span><span class="nm">${esc(r.nick)}${r.is_me ? ' (du)' : ''}</span><span class="mono">${r.week_xp} XP</span></li>`;
  }).join('');
  const me = b.rows.find(r => r.is_me);
  return `<ol class="board">${rows}</ol>
    <p class="small">${me ? `Du bist Platz ${me.rank} von ${b.n}.` : ''} Gezeigt werden die Top 5 und dein eigener Platz. Die Wertung gilt von Montag bis Sonntag.</p>
    <div class="goal"><div class="small">Gildenziel diese Woche: <b class="mono">${b.total} von ${goal} XP</b></div>
    <div class="xpbar light" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Gildenziel"><div style="width:${pct}%"></div></div></div>`;
}
function chBoardHtml() {
  if (BE.chStatus) return `<p class="small">${BE.chStatus}</p>`;
  if (!BE.chBoard) return '<p class="small">Rangliste wird geladen …</p>';
  const rows = BE.chBoard, n = rows.length ? rows[0].n_players : 0;
  let prev = 0;
  const li = rows.map(r => {
    const gap = prev && r.rank > prev + 1 ? '<li class="gap" aria-hidden="true">\u2026</li>' : '';
    prev = r.rank;
    return gap + `<li class="${r.is_me ? 'me' : ''}"><span class="rk mono">${r.rank}</span><span class="nm">${esc(r.nick)}${r.is_me ? ' (du)' : ''}</span><span class="mono">${r.correct}/6 \u00B7 ${r.seconds} s</span></li>`;
  }).join('');
  return `<div class="tag">Rangliste dieser Gilde (${n} ${n === 1 ? 'Ergebnis' : 'Ergebnisse'})</div><ol class="board">${li}</ol>`;
}
const people = n => n + (n === 1 ? ' Person' : ' Personen');
function schoolHtml() {
  const rows = BE.school;
  if (!rows) return '<p class="small">Schulwertung wird geladen …</p>';
  if (!rows.length) return '<p class="small">Diese Woche hat in der Schule noch niemand Punkte.</p>';
  const n = rows[0].n_players; let prev = 0;
  const li = rows.map(r => {
    const gap = prev && r.rank > prev + 1 ? '<li class="gap" aria-hidden="true">\u2026</li>' : '';
    prev = r.rank;
    return gap + `<li class="${r.is_me ? 'me' : ''}"><span class="rk mono">${r.rank}</span><span class="nm">${esc(r.nick)}${r.is_me ? ' (du)' : ''}<small>${esc(r.class_code)}</small></span><span class="mono">${r.week_xp} XP</span></li>`;
  }).join('');
  const me = rows.find(r => r.is_me);
  return `<ol class="board">${li}</ol><p class="small">${me ? `Du bist Platz ${me.rank} von ${n}. ` : ''}Schulinterne Wertung: Top 10 und dein Platz. Gezeigt werden nur Heldennamen und der Klassencode.</p>`;
}
function classesHtml() {
  const rows = BE.classes;
  const form = `<div class="ansrow chrow"><input id="duelcodes" class="numin" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="80" placeholder="Duell: z. B. KL-7A, KL-7B" aria-label="Klassen oder Gruppen für das Duell" value="${esc(ui.duelInput || '')}"><button class="btn sm" data-act="duelgo">Vergleichen</button></div>
    <p class="small">Leer lassen: alle Klassen und Gruppen der Schule. Oder gib zwei bis acht Klassencodes ein.</p>`;
  if (!rows) return form + '<p class="small">Klassenvergleich wird geladen …</p>';
  if (!rows.length) return form + '<p class="small">Für diese Auswahl gibt es diese Woche noch keine Punkte.</p>';
  let prev = 0;
  const li = rows.map(r => {
    const gap = prev && r.rank > prev + 1 ? '<li class="gap" aria-hidden="true">\u2026</li>' : '';
    prev = r.rank;
    return gap + `<li class="${r.is_mine ? 'me' : ''}"><span class="rk mono">${r.rank}</span><span class="nm">${esc(r.class_code)}${r.is_mine ? ' (deine Gilde)' : ''}<small>${people(r.n_players)}${r.n_players < 3 ? ' \u00B7 wenige Teilnehmende' : ''}</small></span><span class="mono">${fmt(Number(r.avg_xp), 1)} XP pro Person</span></li>`;
  }).join('');
  return form + `<ol class="board">${li}</ol><p class="small">Verglichen werden die Wochenpunkte pro Person. So haben grosse und kleine Klassen oder Gruppen die gleiche Chance.</p>`;
}
function chClsHtml() {
  if (!BE.client || !schoolCode() || !state.classCode) return '';
  if (BE.chClsStatus) return `<p class="small">${BE.chClsStatus}</p>`;
  if (!BE.chClasses) return '<p class="small">Klassenvergleich wird geladen …</p>';
  const rows = BE.chClasses;
  if (!rows.length) return '';
  let prev = 0;
  const li = rows.map(r => {
    const gap = prev && r.rank > prev + 1 ? '<li class="gap" aria-hidden="true">\u2026</li>' : '';
    prev = r.rank;
    return gap + `<li class="${r.is_mine ? 'me' : ''}"><span class="rk mono">${r.rank}</span><span class="nm">${esc(r.class_code)}${r.is_mine ? ' (deine Gilde)' : ''}<small>${people(r.n_players)}</small></span><span class="mono">${fmt(Number(r.avg_correct), 1)}/6 \u00B7 ${fmt(Number(r.avg_seconds), 0)} s</span></li>`;
  }).join('');
  return `<div class="tag">Gildenduell bei diesem Duell</div><ol class="board">${li}</ol><p class="small">Verglichen werden die Durchschnitte pro Person. Spielen mehrere Klassen denselben Code, siehst du, wer vorn liegt.</p>`;
}
function boardTabHtml() { return !schoolCode() ? boardHtml() : ui.bt === 'school' ? schoolHtml() : ui.bt === 'duel' ? classesHtml() : boardHtml(); }
function tabsHtml() {
  if (!schoolCode()) return '';
  const t = [['class', 'Gilde'], ['school', 'Schule'], ['duel', 'Gildenduell']];
  return `<div class="seg3" role="group" aria-label="Wertung">${t.map(x => `<button class="btn sm${(ui.bt || 'class') === x[0] ? ' on' : ''}" data-act="bt" data-t="${x[0]}">${x[1]}</button>`).join('')}</div>`;
}
function paintBoard() {
  const el = $id('board'); if (el) el.innerHTML = boardTabHtml();
  const st = $id('bestatus'); if (st) st.textContent = BE.status;
}
function paintChBoard() {
  const el = $id('chboard'); if (el) el.innerHTML = chBoardHtml();
  const ec = $id('chcls'); if (ec) ec.innerHTML = chClsHtml();
}
function classCard() {
  if (!BE.client) return '';
  if (!state.classCode) {
    return `<article class="card clsc" style="--i:7">
      <div class="tag">Meine Gilde</div>
      <h3>Gildenwertung (Klasse)</h3>
      <p class="small">Gib den Klassencode ein, den du von deiner Lehrperson bekommst. Er gilt für alle Reiche. Dann siehst du die Wochenwertung deiner Gilde. Gespeichert werden nur dein Heldenname und dein Punktestand.</p>
      <div class="ansrow chrow"><input id="clscode" class="numin mono" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="Klassencode" aria-label="Klassencode"></div>
      ${ui.clsErr ? `<p class="errtxt" role="alert">${ui.clsErr}</p>` : ''}
      <button class="btn btn-primary block" data-act="joinclass">Der Gilde beitreten</button>
    </article>`;
  }
  return `<article class="card clsc" style="--i:7">
      <div class="tag">Meine Gilde</div>
      <h3>Gilde ${esc(state.classCode)}</h3>
      ${tabsHtml()}
      <div id="board">${boardTabHtml()}</div>
      <p class="errtxt" id="bestatus" role="status">${BE.status || ''}</p>
      <div class="btnrow"><button class="btn sm" data-act="refreshboard">Aktualisieren</button><button class="btn sm" data-act="leaveclass">Gilde verlassen</button></div>
      <p class="small">Beim Verlassen werden deine Daten in allen Reichen auf dem Server gelöscht.</p>
    </article>`;
}


/* ---------- Maskottchen Watti und Lernhilfen ---------- */
const scStyle = nr => `--sc:var(--st-${nr})`;
function watti(lvl, mood, cls) {
  return `<div class="watti ${cls || ''}" data-mood="${mood || 'happy'}" style="--lvl:${Math.max(14, Math.min(100, Math.round(lvl)))}%" aria-hidden="true"><div class="cap"></div><div class="body"><div class="fill"></div><div class="face"><div class="eyes"><i class="eye"></i><i class="eye"></i></div><b class="mouth"></b></div></div></div>`;
}
const ELIXA_TIPS = ['Erst die Schriftrolle, dann die Prüfung. Das lohnt sich.', 'Fehler sind keine Niederlage. Sie kehren zurück, bis du sie besiegst.', 'Eine Runde pro Tag hält deine Flamme am Brennen.', 'Tipp: Schau bei Aufgaben zuerst, welche Einheit gesucht ist.'];
let WATTI_TIPS = ELIXA_TIPS;
let tipI = 0;
function introCard() {
  return `<article class="card intro" style="--i:0"><div class="tag">Der Weg der Heldin, des Helden</div>
    <div class="steps3"><div class="step3"><b>1</b><span>Lernen</span><small>Schriftrollen und Experimente</small></div><div class="step3"><b>2</b><span>Üben</span><small>Quests mit Tipps</small></div><div class="step3"><b>3</b><span>Duell</span><small>Gleiche Fragen für alle</small></div></div>
    <button class="btn sm" data-act="introdone">Auf ins Abenteuer</button></article>`;
}
function workedHtml(w, shown) {
  const steps = w.steps.map((s, i) => `<li class="${i <= shown ? '' : 'hid'}"><div><div class="wt">${s[0]}</div><div class="wm mono">${s[1]}</div></div></li>`).join('');
  return `<div class="worked"><div class="wgiven">${w.given}</div><ol class="wsteps">${steps}</ol><button class="btn sm" data-act="wstep" ${shown >= w.steps.length - 1 ? 'disabled' : ''}>${shown >= w.steps.length - 1 ? 'Das war es' : 'Nächster Schritt'}</button></div>`;
}
function openExplain() {
  const q = R.queue[R.i], el = $id('ans');
  if (el) q.input = el.value;
  const st = stationOf(q.tpl), idx = st.lesson.findIndex(c => c.h === q.tpl.learn);
  L = { st, i: Math.max(0, idx), dir: 1, shown: {}, sel: {}, wk: {}, fromRound: true };
  ui.screen = 'lesson'; ui.formulas = false;
  render();
}

/* ---------- Lernstand als verschlüsselter QR-Code ---------- */
const qrAvailable = () => !!(CFG.teacherKey && window.qrcode && window.crypto && window.crypto.subtle);
function lernstandPayload() {
  const wkNow = Math.floor((dayIdx() + 3) / 7);
  return {
    v: 1, tp: TOPIC.id, i: Math.floor(Date.now() / 1000), id: LQ.randomId(8),
    n: state.nick, r: (state.realName || '').trim(), k: state.classCode || '',
    x: state.xp, w: state.weekKey === wkNow ? state.weekXp : 0, l: levelOf(state.xp) + 1, ro: state.rounds, st: streakNow(),
    s: STATIONS.map(st => (state.stars[st.id] === undefined ? '-' : String(state.stars[st.id]))).join(''),
    ls: STATIONS.map(st => (state.lessons[st.id] ? '1' : '0')).join(''),
    ch: Object.keys(state.challenges).slice(-3).map(k => [k, state.challenges[k].c, state.challenges[k].t])
  };
}
async function showQr() {
  ui.screen = 'qr'; ui.qr = { state: 'loading' };
  render();
  try {
    const token = await LQ.encrypt(CFG.teacherKey, lernstandPayload());
    const q = window.qrcode(0, 'M'); q.addData(token); q.make();
    ui.qr = { state: 'ok', svg: q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }), until: Date.now() + 600000 };
  } catch (e) { ui.qr = { state: 'err' }; }
  if (ui.screen === 'qr') render('keep');
}
function qrCard() {
  if (!qrAvailable()) return '';
  return `<article class="card qrc" style="--i:9">
      <div class="tag">Mein Lernstand</div>
      <h3>QR-Siegel für die Lehrperson</h3>
      <p class="small">Dein Punktestand wird verschlüsselt in einen QR-Code gepackt. Nur die Prüf-App deiner Lehrperson kann ihn lesen. Es wird nichts hochgeladen.</p>
      <div class="ansrow chrow"><input id="realname" class="numin txtin" type="text" autocomplete="off" maxlength="30" placeholder="Dein Name (freiwillig)" value="${esc(state.realName || '')}" aria-label="Dein Name für die Lehrperson"></div>
      <p class="small">Der Name steht nur im verschlüsselten Code, nirgends sonst. Er gilt für alle Reiche.</p>
      <button class="btn btn-primary block" data-act="showqr">QR-Siegel anzeigen</button>
    </article>`;
}
function viewQr() {
  const q = ui.qr || { state: 'loading' };
  const body = q.state === 'ok' ? `<div class="qrbox" id="qrbox" role="img" aria-label="QR-Code mit deinem verschlüsselten Lernstand">${q.svg}</div><p class="countdown">Gültig noch <b class="mono" id="qrleft">10:00</b></p>`
    : q.state === 'err' ? '<p class="errtxt" role="alert">Der Code konnte nicht erzeugt werden. Dein Browser unterstützt die Verschlüsselung vielleicht nicht.</p>' : '<p class="small">Code wird erzeugt …</p>';
  return `
  <main class="wrap qrscreen">
    <section class="card">
      <div class="tag">Mein Lernstand \u00B7 ${esc(REALM.name)}</div>
      <h2 class="sumh">QR-Siegel</h2>
      ${body}
      <p class="small">Zeige den Code deiner Lehrperson. Er ist verschlüsselt: Nur die Prüf-App deiner Lehrperson kann ihn lesen. Es wird nichts hochgeladen. Wenn der Code abläuft, erzeugst du einfach einen neuen.</p>
    </section>
    <button class="btn btn-primary block" data-act="showqr">Neuen Code erzeugen</button>
    <button class="btn block" data-act="home">Zurück</button>
  </main>`;
}

/* ---------- Lektion ---------- */
let L = null;
function startLesson(id) {
  const st = STATIONS.find(s => s.id === id);
  L = { st, i: 0, dir: 1, shown: {}, sel: {}, wk: {}, fromRound: false };
  ui.screen = 'lesson'; ui.formulas = false;
  render();
}
function lessonGo(d) {
  const n = L.st.lesson.length;
  L.i = Math.max(0, Math.min(n - 1, L.i + d)); L.dir = d;
  render();
}
function finishLesson() {
  const id = L.st.id, first = !state.lessons[id], lvB = levelOf(state.xp);
  let gain = 0;
  if (first) { state.lessons[id] = true; gain = 15; bumpXp(gain); touchStreak(); save(); pushProgress(); }
  L.gain = gain; L.levelUp = levelOf(state.xp) > lvB;
  L.newTrophies = checkTrophies(); save();
  ui.screen = 'lessondone';
  render();
}

/* ---------- Challenge ---------- */
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 20);
function startChallenge() {
  const el = $id('chcode');
  const code = normCode(el ? el.value : ui.chCode);
  ui.chCode = code;
  if (code.length < 3) { ui.chErr = 'Der Code braucht mindestens 3 Zeichen, zum Beispiel 4-DRACHE.'; render('keep'); return; }
  ui.chErr = '';
  startRound('challenge', code);
}

/* ---------- Animationen ---------- */
function countUp(el, to, pre, suf) {
  tween(0, to, 900, v => { el.textContent = pre + Math.round(v) + suf; });
}
function confetti(host) {
  if (!host || reduced()) return;
  const cols = ['var(--pop-yellow)', 'var(--pop-pink)', 'var(--pop-cyan)', 'var(--pop-green)', 'var(--primary)'];
  const box = document.createElement('div');
  box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 44; i++) {
    const s = document.createElement('span');
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 140;
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', (Math.sin(a) * d - 60) + 'px');
    s.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    s.style.background = cols[i % cols.length];
    s.style.animationDelay = (Math.random() * 120) + 'ms';
    box.appendChild(s);
  }
  host.appendChild(box);
  setTimeout(() => { if (box.parentNode) box.parentNode.removeChild(box); }, 1700);
}

/* ---------- Weltkarte Naturalia ---------- */
// Nachthimmel im Kopfbereich: Sterne mit festen Positionen
const SKY = [['6%', '18%', 3, 0], ['14%', '62%', 2, 1.2], ['23%', '30%', 4, 2.1], ['31%', '80%', 2, .4], ['39%', '12%', 3, 1.7], ['47%', '48%', 2, 2.8],
  ['56%', '22%', 3, .9], ['63%', '70%', 2, 2.3], ['71%', '10%', 4, 1.4], ['78%', '42%', 2, .2], ['86%', '76%', 3, 1.9], ['93%', '26%', 2, 2.6]];
function skyHtml() {
  return `<span class="moon" aria-hidden="true"></span>` + SKY.map(p => `<span class="spark" aria-hidden="true" style="--x:${p[0]};--y:${p[1]};--s:${p[2]}px;--d:${p[3]}s"></span>`).join('');
}
function nextRealmLink() {
  const i = REALMS.findIndex(r => r.id === TOPIC.id), n = REALMS[i + 1];
  return n ? ` · Nächstes Reich: <button class="linkbtn" data-act="realm" data-id="${n.id}">${n.icon} ${n.name}</button>` : '';
}
function worldTotals() {
  const per = REALMS.map(r => ({ r, st: realmStats(r) }));
  const tot = per.reduce((a, x) => ({
    xp: a.xp + x.st.xp, passed: a.passed + x.st.passed, stars: a.stars + x.st.starSum, all: a.all + x.st.stations.length,
    tr: a.tr + x.st.trophies, started: a.started + (x.st.rounds > 0 ? 1 : 0), done: a.done + (x.st.passed === x.st.stations.length ? 1 : 0)
  }), { xp: 0, passed: 0, stars: 0, all: 0, tr: 0, started: 0, done: 0 });
  return { per, tot };
}
const SAGAS = [
  { id: 'aufbruch', icon: '\u{1F9ED}', name: 'Aufbruch', how: 'Spiele in einem Reich deine erste Runde.', ok: t => t.started >= 1 },
  { id: 'grenze', icon: '\u{1F6B6}', name: 'Grenzgänger', how: 'Betritt drei verschiedene Reiche und spiele dort.', ok: t => t.started >= 3 },
  { id: 'welten', icon: '\u{1F30D}', name: 'Weltenwanderer', how: 'Spiele in allen Reichen, die schon entdeckt sind.', ok: t => t.started >= REALMS.length },
  { id: 'befreit', icon: '\u{1F3F0}', name: 'Reich befreit', how: 'Bestehe in einem Reich jede Quest mit mindestens einem Stern.', ok: t => t.done >= 1 },
  { id: 'sterne', icon: '\u{1F31F}', name: 'Sternensammler', how: 'Sammle insgesamt 30 Sterne.', ok: t => t.stars >= 30 },
  { id: 'tausend', icon: '✨', name: 'Tausend Funken', how: 'Erreiche 1000 XP über alle Reiche.', ok: t => t.xp >= 1000 },
  { id: 'legende', icon: '\u{1F451}', name: 'Lebende Legende', how: 'Erreiche 9000 XP über alle Reiche.', ok: t => t.xp >= 9000 },
  { id: 'hort', icon: '\u{1F4B0}', name: 'Drachenhort', how: 'Finde 30 Artefakte in den Reichen.', ok: t => t.tr >= 30 }
];
function heroRank(xp) { let i = 0; HERO_RANKS.forEach((h, k) => { if (xp >= h.xp) i = k; }); return i; }
function mapHtml(per) {
  const pts = REALMS.map(r => r.map);
  // Weg durch alle Reiche: Catmull-Rom als Bézierkurve
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  const next = per.find(x => x.st.passed < x.st.stations.length);
  const nodes = per.map((x, i) => {
    const r = x.r, st = x.st, done = st.passed === st.stations.length, started = st.rounds > 0 || Object.keys(st.lessons).length > 0;
    const cls = done ? ' done' : started ? ' started' : '';
    return `<button class="mapnode${cls}${next && next.r.id === r.id ? ' nextup' : ''}" data-act="realm" data-id="${r.id}" style="--x:${r.map[0]}%;--y:${r.map[1]}%;--rc:${r.color};--i:${i}" aria-label="${esc(r.name)}: ${st.passed} von ${st.stations.length} Quests bestanden">
      <span class="mn-icon" aria-hidden="true">${r.icon}</span>
      <span class="mn-label"><b>${r.name}</b><small class="mono">${'★'.repeat(Math.min(3, Math.floor(st.starSum / 6)))}${st.passed}/${st.stations.length}</small></span>
    </button>`;
  }).join('');
  // Dekoration am Rand, gleichmässig über die Höhe verteilt
  const DECO = ['\u{1F332}', '\u{1F3D4}️', '\u{1F344}', '\u{1F333}', '\u{1FAA8}', '\u{1F332}', '\u{1F33E}', '\u{1F3D5}️'];
  const deco = REALMS.map((r, i) => `<span class="deco" style="--x:${i % 2 ? 7 : 93}%;--y:${r.map[1]}%" aria-hidden="true">${DECO[i % DECO.length]}</span>`).join('');
  // Regionen: eigene Zeile mit Beschriftung vor dem ersten Reich jeder Gruppe
  const grps = MAP_LABELS.map(g => `<span class="mapgrp" style="--y:${mapY(g.s)}%">${REALM_GROUPS[g.grp]}</span>`).join('');
  return `<div class="worldmap" role="group" aria-label="Weltkarte von Naturalia" style="--mh:${Math.round(MAP_SLOTS * 60)}px">
    <svg class="mapsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="coast" d="M0 2.5 C 18 1, 30 3.5, 44 2 S 78 0.5, 100 3 L 100 0 L 0 0 Z"/>
      <path class="road-shadow" d="${d}"/><path class="road" d="${d}"/>
    </svg>
    <span class="compass" aria-hidden="true">✦<small>N</small></span>
    ${deco}${grps}
    ${nodes}
  </div>`;
}
function realmListHtml(per) {
  return Object.keys(REALM_GROUPS).map(g => {
    const items = per.filter(x => x.r.grp === g);
    if (!items.length) return '';
    return `<h3 class="grp">${REALM_GROUPS[g]}</h3><div class="path">${items.map((x, i) => {
      const r = x.r, st = x.st, pct = Math.round(st.passed / st.stations.length * 100);
      const segs = st.stations.map(q => `<i class="${(st.stars[q.id] || 0) >= 1 ? 'g' : ''}"></i>`).join('');
      const list = st.stations.map(q => {
        const n = st.stars[q.id] || 0;
        return `<li><button class="stlink" data-act="goquest" data-id="${r.id}" data-st="${q.id}"><span class="stn">${ROMAN[q.nr - 1]}</span><span class="stt"><b>${esc(q.title)}</b><small>${esc(q.sub)}</small></span><span class="mono sts" aria-label="${n} von 3 Sternen">${'★'.repeat(n)}${'☆'.repeat(3 - n)}${st.lessons[q.id] ? ' \u{1F4DC}' : ''}</span></button></li>`;
      }).join('');
      return `<details class="card bk" style="--sc:${r.color};--i:${i}">
        <summary><span class="bnum" aria-hidden="true">${r.icon}</span><span class="btxt"><span class="tag">${r.code ? r.code.replace('_', '.') + ' ' : 'Vertiefung · '}${esc(chapterData(r.id).TOPIC.title)}</span><span class="btitle">${r.name}</span><span class="bsegs" aria-hidden="true">${segs}</span></span><span class="bcnt mono">${st.passed}/${st.stations.length}</span></summary>
        <div class="bkbody">
          <p class="small"><i>${esc(r.lore)}</i></p>
          <p class="small"><b>Rang ${st.lv + 1}: ${st.lvName}</b> · <span class="mono">${st.xp} XP</span> · ${st.trophies} Artefakte · ${pct} % der Quests bestanden</p>
          <ul class="stlist">${list}</ul>
          <button class="btn btn-primary block" data-act="realm" data-id="${r.id}">${st.rounds ? 'Ins Reich zurückkehren' : 'Reich betreten'}</button>
        </div>
      </details>`;
    }).join('')}</div>`;
  }).join('');
}
function viewWorld() {
  const { per, tot } = worldTotals();
  const hr = heroRank(tot.xp), cur = HERO_RANKS[hr], nxt = HERO_RANKS[hr + 1];
  const pct = nxt ? Math.round((tot.xp - cur.xp) / (nxt.xp - cur.xp) * 100) : 100;
  const sagas = SAGAS.map(t => { const ok = t.ok(tot); return `<div class="trophy ${ok ? 'got' : 'locked'}"><span class="ticon" aria-hidden="true">${ok ? t.icon : '\u{1F512}'}</span><b>${t.name}</b><small>${t.how}</small>${ok ? '<span class="tdone">erzählt</span>' : ''}</div>`; }).join('');
  const nSaga = SAGAS.filter(t => t.ok(tot)).length;
  const fog = FOG_REALMS.map(f => `<li><span class="mono">${f[0].replace('_', '.')}</span> ${esc(f[1])}</li>`).join('');
  const initW = ui.anim ? 0 : pct;
  return `
  <header class="top worldtop">
    ${skyHtml()}
    <div class="topbar">
      <span class="tag inv">Natur und Technik · Lernwelt</span>
      <span class="tag inv">${esc(profile.nick)}</span>
    </div>
    <div class="hero"><div class="herotxt"><div class="sigil" aria-hidden="true">\u{1F3F0}</div><h1>Naturalia</h1><p class="lead">${REALMS.length} Reiche voller Rätsel aus Natur und Technik. Wähle ein Reich, lies die Schriftrollen und bestehe die Quests.</p><p class="bubble" id="bubble" aria-live="polite"></p></div>
      <button class="wbtn" data-act="poke" aria-label="Elixa anstupsen">${watti(Math.max(14, tot.all ? tot.passed / tot.all * 100 : 0), 'happy', 'big')}</button></div>
    <div class="stats">
      <div class="stat"><span class="k">Heldenrang</span><span class="v">${cur.name}</span><span class="mono s">${nxt ? 'nächster bei ' + nxt.xp : 'höchster Rang'}</span></div>
      <div class="stat"><span class="k">Erfahrung</span><span class="v mono" data-count="${tot.xp}" data-suffix=" XP">${tot.xp} XP</span><span class="mono s">alle Reiche</span></div>
      <div class="stat"><span class="k">Quests</span><span class="v mono">${tot.passed}/${tot.all}</span><span class="mono s">bestanden</span></div>
    </div>
    <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Fortschritt zum nächsten Heldenrang"><div data-w="${pct}" style="width:${initW}%"></div></div>
  </header>
  <main class="wrap worldmain">
    <div class="row"><h2>Die Weltkarte</h2><span class="small mono">${tot.tr} Artefakte</span></div>
    <p class="small">Tippe auf ein Reich, um es zu betreten. Der leuchtende Ort ist dein nächstes Ziel. Du darfst aber jedes Reich jederzeit besuchen.</p>
    ${mapHtml(per)}
    <div class="row"><h2>Die Reiche</h2></div>
    <p class="small">Jedes Reich gehört zu einem Kapitel im Lehrplan und hat sechs Quests. Tippe auf eine Quest, um direkt ihre Schriftrolle zu öffnen.</p>
    ${realmListHtml(per)}
    <div class="row"><h2>Sagen von Naturalia</h2><span class="small mono">${nSaga} von ${SAGAS.length}</span></div>
    <p class="small">Sagen erzählen von Taten über alle Reiche hinweg.</p>
    <div class="tgrid">${sagas}</div>
    ${FOG_REALMS.length ? `<details class="card fogcard"><summary><b>Nebelreiche</b> <span class="small">· noch unerforscht (${FOG_REALMS.length})</span></summary>
      <p class="small">Diese Kapitel haben noch keine Lern-App. Sobald eine entsteht, lichtet sich der Nebel.</p><ul class="foglist">${fog}</ul></details>` : ''}
    <footer class="foot">
      <div class="logochip"><img src="logo.png" alt="Sekundarschule Halingen"></div>
      <p class="small"><a href="nut.html">Lernlandkarte NuT</a> · Selbsteinschätzung zu allen Kompetenzen</p>
      <p class="small">Dein Fortschritt wird nur auf diesem Gerät im Browser gespeichert. Dein Heldenname <b class="mono">${esc(profile.nick)}</b> gilt in allen Reichen.</p>
    </footer>
  </main>`;
}
function enterRealm(id, push) {
  audioStop();
  if (!REALMS.some(r => r.id === id)) return;
  loadChapter(id);
  ui.screen = 'home'; ui.formulas = false; ui.confirmReset = false; ui.chErr = ''; ui.clsErr = ''; ui.bt = 'class';
  if (push !== false) { try { history.pushState({ realm: id }, '', '#reich-' + id); } catch (e) { /* ohne Verlauf */ } }
  render();
}
function goWorld(fromPop) {
  audioStop();
  ui.screen = 'world'; R = null; L = null; ui.confirmReset = false;
  if (!fromPop) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ohne Verlauf */ } }
  render();
}

/* ---------- Ansichten ---------- */
function viewHome() {
  const lv = levelOf(state.xp);
  const cur = LEVELS[lv], nxt = LEVELS[lv + 1];
  const pct = nxt ? Math.round((state.xp - cur.xp) / (nxt.xp - cur.xp) * 100) : 100;
  const sn = streakNow();
  const diff = state.lastDay === null ? null : dayIdx() - state.lastDay;
  let streakNote = 'Eine Runde pro Tag hält deine Flamme am Brennen. Ein freier Tag ist erlaubt.';
  if (sn > 0 && diff >= 1) streakNote = diff === 1 ? 'Spiel heute eine Runde, dann brennt deine Flamme weiter.' : 'Deine Flamme flackert: Spiel heute eine Runde, sonst erlischt sie.';
  if (sn === 0 && state.lastDay !== null) streakNote = 'Deine Flamme ist erloschen. Mit einer Runde entzündest du sie neu.';

  const due = dueCount();
  let nudge = null;
  for (const s0 of STATIONS) {
    if (!state.lessons[s0.id]) { nudge = 'learn:' + s0.id; break; }
    if (state.stars[s0.id] === undefined) { nudge = 'start:' + s0.id; break; }
  }
  const cards = STATIONS.map((s, idx) => {
    const canPractice = stationUnlocked(s) || !!state.lessons[s.id];
    const stars = state.stars[s.id];
    const done = stars !== undefined;
    const learned = !!state.lessons[s.id];
    const mcount = s.items.filter(mastered).length;
    const segs = s.items.map(t => `<span class="seg${mastered(t) ? ' on' : ''}"></span>`).join('');
    return `<article class="card st" style="--i:${idx};${scStyle(s.nr)}">
      <div class="num" aria-hidden="true"><span>${ROMAN[s.nr - 1]}</span></div>
      <div class="stbody">
        <div class="tag">Quest ${s.nr}</div>
        <h3>${s.title}</h3>
        <div class="mono sub">${s.sub}</div>
        <div class="mast" role="img" aria-label="${mcount} von ${s.items.length} Aufgabentypen sicher">${segs}</div>
        <div class="starsrow"><span class="stars" aria-label="${stars || 0} von 3 Sternen">${starTxt(stars || 0)}</span><span class="small">${learned ? 'Schriftrolle gelesen' : 'Schriftrolle versiegelt'} · ${done ? 'geübt' : canPractice ? 'noch nicht geübt' : 'Üben nach der Schriftrolle'}</span></div>
      </div>
      <div class="acts"><button class="btn ${learned ? '' : 'btn-primary'}${nudge === 'learn:' + s.id ? ' nudge' : ''}" data-act="learn" data-st="${s.id}"><span aria-hidden="true">\u{1F4DC}</span> Lernen</button><button class="btn ${learned && !done ? 'btn-primary' : ''}${nudge === 'start:' + s.id ? ' nudge' : ''}" data-act="start" data-st="${s.id}" ${canPractice ? '' : 'disabled'}><span aria-hidden="true">⚔️</span> Üben</button></div>
    </article>`;
  }).join('');

  const rev = reviewPool().length ? `<article class="card review" style="--i:6">
      <div class="stbody">
        <div class="tag">Erinnerungsquelle</div>
        <h3>Auffrischen</h3>
        <p class="small">${due > 0 ? `${due} Aufgabentypen drohen zu verblassen. Gemischte Runde aus allen Quests, die du schon gespielt hast.` : 'Die Quelle ruht. Aufgaben kehren nach ein paar Tagen von selbst zurück.'}</p>
      </div>
      <button class="btn ${due > 0 ? 'btn-primary' : ''}" data-act="review"><span aria-hidden="true">\u{1F52E}</span> Runde starten</button>
    </article>` : '';

  const chKeys = Object.keys(state.challenges).slice(-3).reverse();
  const chal = `<article class="card chal" style="--i:8">
      <div class="tag">Duell (Challenge)</div>
      <h3>Gleiche Fragen, fairer Kampf</h3>
      <p class="small">Alle mit demselben Code bekommen dieselben 6 Fragen. Deine Lehrperson kann einen Code an die Tafel schreiben, oder du forderst jemanden heraus. Eine Ziffer vorne (zum Beispiel 3-ABCD) beschränkt die Fragen auf die Quests 1 bis 3.</p>
      <div class="ansrow chrow"><input id="chcode" class="numin mono" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="z. B. 4-DRACHE" value="${esc(ui.chCode || '')}" aria-label="Challenge-Code"><button class="btn" data-act="rcode">Zufall</button></div>
      ${ui.chErr ? `<p class="errtxt" role="alert">${ui.chErr}</p>` : ''}
      <button class="btn btn-primary block" data-act="challenge"><span aria-hidden="true">⚔️</span> Duell beginnen</button>
      <p class="small nickrow">Dein Heldenname: <span class="mono b">${esc(state.nick)}</span> <button class="btn sm" data-act="nick">Neu würfeln</button></p>
      ${chKeys.length ? `<ul class="chlist">${chKeys.map(k => `<li><span class="mono">${esc(k)}</span>: ${state.challenges[k].c} von 6 in ${state.challenges[k].t} s</li>`).join('')}</ul>` : ''}
    </article>`;

  const initW = ui.anim ? 0 : pct;
  return `
  <header class="top realmtop" style="--realm:${REALM.color}">
    ${skyHtml()}
    <div class="topbar">
      <button class="btn sm backmap" data-act="world"><span aria-hidden="true">\u{1F5FA}</span> Weltkarte</button>
      <span class="tag inv">${REALM.code ? REALM.code.replace('_', '.') + ' · ' : ''}${esc(TOPIC.title)}</span>
    </div>
    <div class="hero"><div class="herotxt"><div class="sigil" aria-hidden="true">${REALM.icon}</div><h1 class="${REALM.name.length > 14 ? 'long' : ''}">${REALM.name}</h1><p class="lead">${REALM.lore}</p><p class="bubble" id="bubble" aria-live="polite"></p></div>
      <button class="wbtn" data-act="poke" aria-label="Elixa anstupsen">${watti(pct, 'happy', 'big')}</button></div>
    <div class="stats">
      <div class="stat"><span class="k">Rang ${lv + 1}</span><span class="v">${cur.name}</span><span class="mono s">${cur.pw}</span></div>
      <div class="stat"><span class="k">Erfahrung</span><span class="v mono" data-count="${state.xp}" data-suffix=" XP">${state.xp} XP</span><span class="mono s">${nxt ? 'bis ' + nxt.xp : 'Höchster Rang'}</span></div>
      <div class="stat"><span class="k">Flamme</span><span class="v mono">${sn} ${sn === 1 ? 'Tag' : 'Tage'}</span><span class="mono s">Schonfrist 1 Tag</span></div>
    </div>
    <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Fortschritt zum nächsten Rang"><div data-w="${pct}" style="width:${initW}%"></div></div>
  </header>
  <main class="wrap">
    <p class="small streaknote">${streakNote}</p>
    <p class="small chapline">Lehrplan: <b>${REALM.code ? REALM.code.replace('_', '.') + ' ' : ''}${esc(TOPIC.title)}</b> · ${esc(TOPIC.lead)}</p>
    ${trophyBar()}
    <div class="row"><h2>Dein Questpfad</h2><button class="btn sm" data-act="formulas"><span aria-hidden="true">\u{1F4D6}</span> ${ui.formulas ? CARD + ' zu' : CARD}</button></div>
    ${ui.formulas ? formulaCard() : ''}
    ${state.introDone ? '' : introCard()}
    <div class="path questpath">${cards}${rev}${classCard()}${qrCard()}${chal}</div>
    <footer class="foot">
      <p class="small"><button class="linkbtn" data-act="world">Zur Weltkarte</button>${nextRealmLink()}</p>
      <p class="small">Dein Fortschritt wird nur auf diesem Gerät im Browser gespeichert${memoryOnly ? ' (Speichern ist hier gerade nicht möglich, der Fortschritt geht beim Schliessen verloren)' : ''}. Der Heldenname ist nirgends sonst hinterlegt.</p>
      <button class="btn sm" data-act="reset">${ui.confirmReset ? 'Sicher? Nochmals tippen zum Löschen' : 'Fortschritt in diesem Reich zurücksetzen'}</button>
    </footer>
  </main>`;
}

function viewRound() {
  const q = R.queue[R.i], d = q.d;
  const last = R.i === R.queue.length - 1;
  const pct = Math.round(R.i / R.queue.length * 100);
  const label = R.mode === 'review' ? 'Erinnerungsquelle' : R.mode === 'challenge' ? 'Duell \u00B7 ' + R.code : `Quest ${R.st.nr} \u00B7 ${R.st.title}`;
  let body = '';
  if (d.type === 'mc') {
    body = `<div class="opts" role="group" aria-label="Antworten">` + d.shown.map((o, i) => {
      let cls = 'opt';
      if (q.done) { if (o.ok) cls += ' good'; else if (q.sel === i) cls += ' bad'; }
      return `<button class="${cls}" style="--i:${i}" data-act="opt" data-i="${i}" ${q.done ? 'disabled' : ''}><span class="ltr mono" aria-hidden="true">${'ABCD'[i]}</span><span>${o.t}</span></button>`;
    }).join('') + `</div>`;
  } else {
    const err = q.fb && (q.fb.kind === 'warn' || q.fb.kind === 'bad') ? ' err' : '';
    body = `<label class="sr" for="ans">Deine Antwort in ${d.unit}</label>
      <div class="ansrow"><input id="ans" class="numin mono${err}" type="text" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Zahl" value="${esc(q.input)}" ${q.done ? 'disabled' : ''}><span class="unitl mono">${d.unit}</span></div>
      <p class="small">Dezimalzahlen mit Komma oder Punkt.</p>
      ${q.done ? '' : `<button class="btn btn-primary block" data-act="check">${q.attempts ? 'Nochmals prüfen' : 'Prüfen'}</button>`}`;
  }
  const canExplain = q.fb && (q.fb.kind === 'bad' || q.fb.kind === 'warn') && q.fb.title !== 'Gib eine Zahl ein.' && R.mode !== 'challenge' && q.tpl.learn;
  const fb = q.fb ? `<div class="fb ${q.fb.kind}" role="status" aria-live="polite">${q.fb.xp ? `<span class="xppop">+${q.fb.xp} XP</span>` : ''}<div class="fbt">${q.fb.title}</div><div class="fbb">${q.fb.body}</div>${canExplain ? '<button class="btn sm fbx" data-act="explain">Erklärung ansehen</button>' : ''}</div>` : '';
  const mood = !q.fb ? 'happy' : q.fb.kind === 'good' ? 'cheer' : q.fb.kind === 'bad' ? 'sad' : 'think';
  const nxt = q.done ? `<button class="btn btn-primary block" data-act="next">${last ? 'Ergebnis ansehen' : 'Weiter'}</button>` : '';
  return `
  <main class="wrap round">
    <div class="rtop">
      <button class="btn sm" data-act="quit">Rückzug</button>
      <span class="mono small">Frage ${Math.min(R.i + 1, R.queue.length)} von ${R.queue.length}</span>
      ${TOPIC.audio ? `<button class="btn sm" id="tbtn" data-act="tonaus">${profile.audioOff ? 'Ton aus' : 'Ton an'}</button>` : ''}
      <button class="btn sm" data-act="formulas">${ui.formulas ? CARD + ' zu' : CARD}</button>
    </div>
    <div class="xpbar light" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Fortschritt in dieser Runde"><div style="width:${pct}%"></div></div>
    ${ui.formulas ? formulaCard() : ''}
    <section class="card qcard" style="${R.st ? scStyle(R.st.nr) : '--sc:var(--primary)'}">
      ${watti(pct, mood, 'mini')}
      <div class="tags"><span class="tag">${label}</span>${d.type === 'num' && q.tpl.ext ? '<span class="badge">Erweiterung</span>' : ''}${q.retry ? '<span class="badge warn">Zweiter Anlauf</span>' : ''}${R.mode === 'challenge' ? '<span class="badge warn">Sanduhr läuft, 1 Versuch</span>' : ''}</div>
      <h2 class="q">${d.q}</h2>
      ${body}
    </section>
    ${fb}
    ${nxt}
  </main>`;
}

function viewSummary() {
  const s = R.summary;
  const lv = LEVELS[levelOf(state.xp)];
  if (R.mode === 'challenge') {
    const ch = s.ch;
    const headline = ch.c === 6 ? 'Makellos gesiegt.' : ch.c >= 4 ? 'Gut gekämpft.' : 'Das nächste Duell gewinnst du.';
    return `
  <main class="wrap summary">
    <section class="card">
      <div class="sumw">${watti(100, ch.c >= 4 ? 'cheer' : 'think', 'big')}</div>
      <div class="tag">Duell \u00B7 Code ${esc(ch.code)}</div>
      <h2 class="sumh">${headline}</h2>
      <p class="lead2"><span class="mono b">${ch.c} von 6</span> richtig in <span class="mono b">${ch.t} s</span>.</p>
      <div class="resline mono" id="resline">${esc(ch.line)}</div>
      <button class="btn sm" data-act="copy">Ergebnis kopieren</button>
      <p class="small" id="copymsg" aria-live="polite"></p>
      <p class="small">${ch.prev ? `Dein erster Versuch mit diesem Code: ${ch.prev.c} von 6 in ${ch.prev.t} s. Für den Vergleich zählt der erste Versuch.` : 'Das ist dein erster Versuch mit diesem Code. Er zählt für den Vergleich.'}</p>
      <p class="small">So wird verglichen: Wer mehr richtig hat, liegt vorne. Bei gleich vielen richtigen Antworten gewinnt die kürzere Zeit.</p>
      ${BE.client && state.classCode ? `<div id="chboard" class="chboard">${chBoardHtml()}</div>` : ''}
      ${BE.client && state.classCode && schoolCode() ? `<div id="chcls" class="chboard">${chClsHtml()}</div>` : ''}
      ${BE.client && !state.classCode ? '<p class="small">Tritt auf dem Questpfad einer Gilde (Klasse) bei, dann siehst du hier die Rangliste deiner Gilde.</p>' : ''}
      <div class="gain"><span class="mono b">+${s.gained} XP</span><span class="small">${s.bonus ? `davon ${s.bonus} Bonus` : 'kein Bonus'}</span></div>
      ${s.levelUp !== null ? `<div class="fb good"><div class="fbt">Neuer Rang: ${lv.name} \u00B7 ${lv.pw}</div></div>` : ''}
      ${newTrophyHtml(s.newTrophies)}
      ${s.missed.length ? `<div class="miss"><div class="tag">Das solltest du nochmals anschauen</div><ul>${[...new Set(s.missed)].map(t => `<li>${t}</li>`).join('')}</ul></div>` : ''}
    </section>
    <button class="btn block" data-act="challenge-again" data-code="${esc(ch.code)}">Übungskampf mit diesem Code (zählt nicht)</button>
    <button class="btn block" data-act="home">Zurück ins Reich</button>
  </main>`;
  }
  const stationNext = R.mode === 'station' && R.st.nr < STATIONS.length ? STATIONS[R.st.nr] : null;
  const canNext = !!stationNext;
  const headline = R.mode === 'station'
    ? (s.stars === 3 ? 'Glorreich! Alles sitzt.' : s.stars >= 1 ? 'Quest bestanden.' : 'Noch nicht bezwungen.')
    : 'Runde beendet.';
  const sub = R.mode === 'station' && s.stars === 0 ? 'Für den ersten Stern brauchst du mindestens 4 von 6 beim ersten Versuch. Lies die Schriftrolle nochmals, dann klappt es.' : '';
  const stars = R.mode === 'station' ? `<div class="bigstars" aria-label="${s.stars} von 3 Sternen">${[0, 1, 2].map(i => `<span class="${i < s.stars ? 'on' : ''}" style="--d:${i * 220}ms">${i < s.stars ? '\u2605' : '\u2606'}</span>`).join('')}</div>` : '';
  return `
  <main class="wrap summary">
    <section class="card">
      <div class="sumw">${watti(100, R.mode === 'station' && s.stars === 0 ? 'think' : 'cheer', 'big')}</div>
      <div class="tag">${R.mode === 'station' ? 'Quest ' + R.st.nr + ' \u00B7 ' + R.st.title : 'Erinnerungsquelle'}</div>
      <h2 class="sumh">${headline}</h2>
      ${stars}
      <p class="lead2"><span class="mono b">${s.c} von ${s.base}</span> beim ersten Versuch richtig.</p>
      ${sub ? `<p class="small">${sub}</p>` : ''}
      <div class="gain"><span class="mono b" data-count="${s.gained}" data-prefix="+" data-suffix=" XP">+${s.gained} XP</span><span class="small">${s.bonus ? `davon ${s.bonus} Bonus` : 'kein Bonus in dieser Runde'}</span></div>
      <p class="small">Flamme: <span class="mono b">${streakNow()} ${streakNow() === 1 ? 'Tag' : 'Tage'}</span></p>
      ${s.levelUp !== null ? `<div class="fb good"><div class="fbt">Neuer Rang: ${lv.name} \u00B7 ${lv.pw}</div></div>` : ''}
      ${newTrophyHtml(s.newTrophies)}
      ${s.missed.length ? `<div class="miss"><div class="tag">Diese Gegner kehren zurück</div><ul>${[...new Set(s.missed)].map(t => `<li>${t}</li>`).join('')}</ul></div>` : ''}
    </section>
    ${canNext ? `<button class="btn btn-primary block" data-act="learn" data-st="${stationNext.id}">Weiter zu Quest ${stationNext.nr}: Schriftrolle lesen</button>` : ''}
    ${R.mode === 'station' ? `<button class="btn block" data-act="start" data-st="${R.st.id}">Diese Quest nochmals</button>` : `<button class="btn block" data-act="review">Noch eine Runde an der Quelle</button>`}
    ${R.mode === 'station' && s.stars === 0 ? `<button class="btn block" data-act="learn" data-st="${R.st.id}">Schriftrolle nochmals lesen</button>` : ''}
    <button class="btn block" data-act="home">Zurück ins Reich</button>
  </main>`;
}

function viewLesson() {
  const n = L.st.lesson.length, c = L.st.lesson[L.i], last = L.i === n - 1;
  let extra = '';
  if (c.check) {
    if (!L.shown[L.i]) L.shown[L.i] = shuffle(c.check.options.map((t, i) => ({ t, ok: i === 0 })));
    const sel = L.sel[L.i], done = sel !== undefined, sh = L.shown[L.i];
    extra = `<h3 class="q">${c.check.q}</h3><div class="opts" role="group" aria-label="Antworten">` + sh.map((o, i) => {
      let cls = 'opt';
      if (done) { if (o.ok) cls += ' good'; else if (sel === i) cls += ' bad'; }
      return `<button class="${cls}" data-act="lopt" data-i="${i}" ${done ? 'disabled' : ''}><span class="ltr mono" aria-hidden="true">${'ABCD'[i]}</span><span>${o.t}</span></button>`;
    }).join('') + `</div>`;
    if (done) extra += `<div class="fb ${sh[sel].ok ? 'good' : 'bad'}" role="status" aria-live="polite"><div class="fbt">${sh[sel].ok ? 'Richtig.' : 'Nicht ganz.'}</div><div class="fbb">${c.check.explain}</div></div>`;
  }
  const canNext = !c.check || L.sel[L.i] !== undefined;
  const goals = L.i === 0 && L.st.goals ? `<div class="goals"><div class="tag">Diese Fähigkeiten erlangst du</div><ul>${L.st.goals.map(g => `<li>${g}</li>`).join('')}</ul></div>` : '';
  const worked = c.worked ? workedHtml(c.worked, L.wk[L.i] || 0) : '';
  const lastAct = last ? (L.fromRound ? 'backround' : 'lfinish') : 'lnext';
  const lastLbl = last ? (L.fromRound ? 'Zurück zur Aufgabe' : 'Schriftrolle abschliessen') : 'Weiter';
  const dots = L.st.lesson.map((_, i) => `<span class="dot${i <= L.i ? ' on' : ''}"></span>`).join('');
  return `
  <main class="wrap round">
    <div class="rtop">
      <button class="btn sm" data-act="${L.fromRound ? 'backround' : 'home'}">${L.fromRound ? 'Zurück zur Aufgabe' : 'Zurück ins Reich'}</button>
      <span class="mono small">Seite ${L.i + 1} von ${n}</span>
    </div>
    <div class="dots" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${L.i + 1}" aria-label="Fortschritt in der Schriftrolle">${dots}</div>
    <section class="card qcard lcard scroll ${L.dir > 0 ? 'fromR' : 'fromL'}" style="${scStyle(L.st.nr)}">
      <div class="tags"><span class="tag">\u{1F4DC} Schriftrolle \u00B7 Quest ${L.st.nr} \u00B7 ${L.st.title}</span></div>
      <h2 class="lh">${c.h}</h2>
      ${goals}
      ${c.body ? `<div class="lbody">${c.body}</div>` : ''}
      ${worked}
      ${c.sim ? '<div id="sim" class="simhost"></div>' : ''}
      ${extra}
      ${TOPIC.audio && (c.w || cardSpeech(c)) ? `<div class="audio">${watti(46, 'happy', 'mini2')}<button class="btn sm" id="vbtn" data-act="vorlesen">${AUD.playing ? 'Stopp' : 'Vorlesen'}</button><button class="btn sm" id="tbtn" data-act="tonaus">${profile.audioOff ? 'Ton aus' : 'Ton an'}</button></div>` : ''}
    </section>
    <div class="navrow">
      <button class="btn" data-act="lprev" ${L.i === 0 ? 'disabled' : ''}>Zurück</button>
      <button class="btn btn-primary" data-act="${lastAct}" ${canNext ? '' : 'disabled'}>${lastLbl}</button>
    </div>
  </main>`;
}

function viewLessonDone() {
  const s = L.st, lv = LEVELS[levelOf(state.xp)];
  return `
  <main class="wrap summary">
    <section class="card">
      <div class="sumw">${watti(100, 'cheer', 'big')}</div>
      <div class="tag">Quest ${s.nr} \u00B7 ${s.title}</div>
      <h2 class="sumh">Schriftrolle gelesen.</h2>
      <p class="lead2">${L.gain ? `<span class="mono b" data-count="${L.gain}" data-prefix="+" data-suffix=" XP">+${L.gain} XP</span> für die Schriftrolle.` : 'Die Punkte für diese Schriftrolle gab es schon beim ersten Mal.'}</p>
      <p class="small">Jetzt beweist du dein Wissen in der Quest.</p>
      ${newTrophyHtml(L.newTrophies)}
      ${L.levelUp ? `<div class="fb good"><div class="fbt">Neuer Rang: ${lv.name} \u00B7 ${lv.pw}</div></div>` : ''}
    </section>
    <button class="btn btn-primary block" data-act="start" data-st="${s.id}"><span aria-hidden="true">\u2694\uFE0F</span> Jetzt üben</button>
    <button class="btn block" data-act="learn" data-st="${s.id}">Schriftrolle nochmals lesen</button>
    <button class="btn block" data-act="home">Zurück ins Reich</button>
  </main>`;
}

function afterRender() {
  if (ui.screen === 'home' && checkTrophies().length) save();
  if (ui.qrTimer) { clearInterval(ui.qrTimer); ui.qrTimer = null; }
  if (ui.screen === 'qr' && ui.qr && ui.qr.state === 'ok') {
    const tick = () => {
      const left = Math.max(0, Math.round((ui.qr.until - Date.now()) / 1000)), el = $id('qrleft');
      if (el) el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (left <= 0) { clearInterval(ui.qrTimer); ui.qrTimer = null; const bx = $id('qrbox'); if (bx) bx.innerHTML = '<p class="errtxt">Abgelaufen. Erzeuge einen neuen Code.</p>'; }
    };
    tick(); ui.qrTimer = setInterval(tick, 1000);
  }
  document.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
    if (ui.anim) countUp(el, to, pre, suf); else el.textContent = pre + to + suf;
  });
  if (ui.screen === 'home' && BE.client && state.classCode) loadBoard();
  if (ui.anim) document.querySelectorAll('[data-w]').forEach(el => nextFrame(() => { el.style.width = el.dataset.w + '%'; }));
  if (ui.screen === 'lesson') {
    const c = L.st.lesson[L.i];
    if (c.sim) { const host = $id('sim'); if (host && c.sim === 'phet') phetSim(host, c); else if (host && SIMS[c.sim]) SIMS[c.sim](host); }
  }
  if (ui.screen === 'summary' && ui.anim && R && R.summary) {
    const s = R.summary;
    if ((R.mode === 'station' && s.stars === 3) || (R.mode === 'challenge' && s.c === 6) || s.levelUp !== null) confetti(document.querySelector('.summary .card'));
  }
}

/* ---------- Audio (nur Themen mit TOPIC.audio): Vorlesen und Lob, Ersatz durch Browser-Stimme ---------- */
const AUD = { el: null, tok: 0, playing: false };
const FB_OK = [['fb-ok-1', 'Richtig, super gemacht!'], ['fb-ok-2', 'Genau so! Das sitzt.'], ['fb-ok-3', 'Stark, weiter so!']];
function audioSetTalk(on) { document.querySelectorAll('.watti').forEach(w => w.classList.toggle('talk', on)); }
function audioUpdateBtn() { const b = $id('vbtn'); if (b) b.textContent = AUD.playing ? 'Stopp' : 'Vorlesen'; }
function audioStop() {
  AUD.tok++;
  if (AUD.el) { try { AUD.el.pause(); } catch (e) { /* egal */ } AUD.el = null; }
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* egal */ }
  AUD.playing = false; audioSetTalk(false); audioUpdateBtn();
}
function audioPlay(path, text) {
  audioStop();
  const my = AUD.tok;
  AUD.playing = true; audioSetTalk(true); audioUpdateBtn();
  const fin = () => { if (my !== AUD.tok) return; AUD.el = null; AUD.playing = false; audioSetTalk(false); audioUpdateBtn(); };
  const speak = () => {
    if (my !== AUD.tok) return;
    if (!text || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return fin();
    const parts = speechChunks(text); let k = 0;
    const next = () => {
      if (my !== AUD.tok) return;
      if (k >= parts.length) return fin();
      try { const u = new SpeechSynthesisUtterance(parts[k++]); u.lang = 'de-DE'; u.onend = next; u.onerror = fin; window.speechSynthesis.speak(u); } catch (e) { fin(); }
    };
    next();
  };
  if (!path) { speak(); return; }
  try {
    const a = new Audio(path); AUD.el = a; a.onended = fin; a.onerror = speak;
    const pr = a.play(); if (pr && pr.catch) pr.catch(speak);
  } catch (e) { speak(); }
}
const SP_SUB = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const SP_UNITS = { 'kWh': 'Kilowattstunden', 'kJ': 'Kilojoule', 'kW': 'Kilowatt', 'MW': 'Megawatt', 'mW': 'Milliwatt', 'W': 'Watt', 'J': 'Joule', 'kN': 'Kilonewton', 'N': 'Newton', 'kV': 'Kilovolt', 'mV': 'Millivolt', 'V': 'Volt', 'mA': 'Milliampere', 'A': 'Ampere', 'kΩ': 'Kiloohm', 'Ω': 'Ohm', 'kHz': 'Kilohertz', 'Hz': 'Hertz', 'hPa': 'Hektopascal', 'Pa': 'Pascal', 'mol': 'Mol', 'kg': 'Kilogramm', 'mg': 'Milligramm', 'g': 'Gramm', 'km/h': 'Kilometer pro Stunde', 'm/s': 'Meter pro Sekunde', 'km': 'Kilometer', 'dm': 'Dezimeter', 'cm': 'Zentimeter', 'mm': 'Millimeter', 'm': 'Meter', 'mL': 'Milliliter', 'ml': 'Milliliter', 'L': 'Liter', 'min': 'Minuten', 's': 'Sekunden', 'h': 'Stunden', 'kcal': 'Kilokalorien' };
const SP_UNIT_RE = new RegExp('(\\d(?:[.,]\\d+)?)\\s*(' + Object.keys(SP_UNITS).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|') + ')(?![A-Za-zÄÖÜäöüß0-9])', 'g');
function speechClean(html) {
  let t = String(html || '');
  t = t.replace(/<\s*br\s*\/?>/gi, '. ').replace(/<\/(p|li|div|h\d|tr)>/gi, '. ').replace(/<\/(td|th)>/gi, ', ');
  t = t.replace(/<sub>\s*([0-9]+)\s*<\/sub>/gi, (m, d) => ' ' + [...d].map(x => SP_SUB[+x]).join(' ') + ' ');
  t = t.replace(/<sup>\s*([^<]*)<\/sup>/gi, (m, d) => ' hoch ' + d.replace(/[−-]/g, 'minus ').replace(/\+/g, 'plus ') + ' ');
  t = t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, 'und').replace(/&lt;/g, ' kleiner als ').replace(/&gt;/g, ' grösser als ').replace(/&[a-z]+;/g, ' ');
  t = t.replace(/(km|dm|cm|mm|m)²/g, (m, u) => 'Quadrat' + ({ km: 'kilometer', dm: 'dezimeter', cm: 'zentimeter', mm: 'millimeter', m: 'meter' })[u]).replace(/(km|dm|cm|mm|m)³/g, (m, u) => 'Kubik' + ({ km: 'kilometer', dm: 'dezimeter', cm: 'zentimeter', mm: 'millimeter', m: 'meter' })[u]);
  t = t.replace(/(^|[^\d,.])1\/(\d+)\b/g, (m, p, d) => p + ({ 2: 'ein Halb', 3: 'ein Drittel', 4: 'ein Viertel', 5: 'ein Fünftel', 6: 'ein Sechstel', 8: 'ein Achtel', 10: 'ein Zehntel' }[d] || ('1 geteilt durch ' + d))).replace(/(\d+)\/(\d+)/g, '$1 geteilt durch $2');
  t = t.replace(/[₀-₉]+/g, m => ' ' + [...m].map(ch => SP_SUB[ch.charCodeAt(0) - 0x2080]).join(' ') + ' ');
  t = t.replace(/⁻([¹²³⁰⁴-⁹])/g, ' hoch minus $1').replace(/⁻/g, ' minus ').replace(/⁺/g, ' plus ');
  t = t.replace(/[¹²³⁰⁴-⁹]+/g, m => ' hoch ' + [...m].map(ch => ({ '¹': 'eins', '²': 'zwei', '³': 'drei', '⁰': 'null', '⁴': 'vier', '⁵': 'fünf', '⁶': 'sechs', '⁷': 'sieben', '⁸': 'acht', '⁹': 'neun' }[ch] || '')).join(' ') + ' ');
  t = t.replace(/°\s*C/g, ' Grad Celsius').replace(/°/g, ' Grad ');
  t = t.replace(SP_UNIT_RE, (m, n, u) => { let w = SP_UNITS[u]; if (n === '1') w = ({ Sekunden: 'Sekunde', Minuten: 'Minute', Stunden: 'Stunde', Kilowattstunden: 'Kilowattstunde' })[w] || w; return n + ' ' + w; });
  t = t.replace(/\bkm\/h\b/g, 'Kilometer pro Stunde').replace(/\bm\/s\b/g, 'Meter pro Sekunde');
  t = t.replace(/Ω/g, ' Ohm ');
  t = t.replace(/\bMrd\./g, 'Milliarden').replace(/\bMio\./g, 'Millionen').replace(/\bTsd\./g, 'Tausend').replace(/\bbzw\./g, 'beziehungsweise').replace(/\bz\. ?B\./g, 'zum Beispiel').replace(/\busw\./g, 'und so weiter').replace(/\bca\./g, 'circa');
  t = t.replace(/(^|[\s(])\+(\d)/g, '$1plus $2');
  t = t.replace(/\b(Newton|N)\s*\/\s*kg\b/g, 'Newton pro Kilogramm').replace(/\b(Joule|J)\s*\/\s*s\b/g, 'Joule pro Sekunde');
  t = t.replace(/ρ/g, ' Rho ').replace(/(Gramm|Kilogramm|g|kg)\s*\/\s*(Kubik\w+|Milliliter|Liter|cm³)/g, (m, a, b) => ({ g: 'Gramm', kg: 'Kilogramm' }[a] || a) + ' pro ' + b).replace(/\bMasse\s*:\s*Volumen/g, 'Masse geteilt durch Volumen');
  t = t.replace(/\s*\((J|kJ|kWh|kcal|W|kW|N|V|A)\)/g, '');
  t = t.replace(/\bkcal\b/g, 'Kilokalorien').replace(/\bkJ\b/g, 'Kilojoule').replace(/\bkWh\b/g, 'Kilowattstunden').replace(/(^|[\s(,])J(?=[\s,.;)]|$)/g, '$1Joule');
  t = t.replace(/(\d)\s*[–-]\s*(\d)/g, '$1 bis $2').replace(/ ½ /g, ' ein Halb ').replace(/½/g, ' ein Halb ').replace(/¼/g, ' ein Viertel ').replace(/¾/g, ' drei Viertel ');
  t = t.replace(/[·×]/g, ' mal ').replace(/[^.]*[→⟶][^.]*/g, seg => /Ausgangsstoff|Reaktion|Schema|Produkt|erbrenn|reagier/.test(seg) ? seg.replace(/[→⟶]/g, ' reagieren zu ') : (seg.indexOf(' + ') >= 0 ? seg.replace(/[→⟶]/g, ' ergibt ') : seg.replace(/[→⟶]/g, ' dann '))).replace(/↔/g, ' entspricht ').replace(/⇌/g, ' im Gleichgewicht mit ').replace(/α'/g, 'Alpha Strich').replace(/α/g, 'Alpha').replace(/β/g, 'Beta').replace(/γ/g, 'Gamma').replace(/Δ/g, 'Delta ').replace(/≈/g, ' ungefähr ').replace(/≠/g, ' ungleich ').replace(/≤/g, ' kleiner oder gleich ').replace(/≥/g, ' grösser oder gleich ').replace(/±/g, ' plus minus ');
  t = t.replace(/\s=\s/g, ' gleich ').replace(/=/g, ' gleich ').replace(/\s\+\s/g, ' plus ').replace(/\s[−–]\s/g, ' minus ').replace(/−/g, ' minus ').replace(/%/g, ' Prozent');
  t = t.replace(/\(\s*NT\.[^)]*\)/g, ' ');
  t = t.replace(/[★☆✓✔✗✘•▶►◆■□]/g, ' ').replace(/(\S)\s+:\s+(?=\d)/g, '$1 geteilt durch ').replace(/(gleich)\s+([A-Za-zÄÖÜäöü0-9]{1,4})\s+:\s+([A-Za-zÄÖÜäöü0-9]{1,4})(?=[\s.,;)]|$)/g, '$1 $2 geteilt durch $3').replace(/(^|[\s(])([A-Za-zÄÖÜäöü0-9]{1,4})\s+:\s+([A-Za-zÄÖÜäöü0-9]{1,4})(?=[\s.,;)]|$)(?!\s*(?:=|gleich))/g, '$1$2 geteilt durch $3').replace(/\.\s*!\s+/g, '. ').replace(/(^|\s)!\s+/g, ' ').replace(/(\d)\.(\d)/g, '$1,$2');
  t = t.replace(/[«»„“”"]/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/([.!?:])(\s*[.,;:])+/g, '$1').replace(/^[\s.]+/, '').trim();
  return t;
}
function speechChunks(text) {
  const sents = text.match(/.+?[.!?](?=\s|$)\s*|.+$/g) || [text], out = [];
  let cur = '';
  sents.forEach(s => { if (cur && (cur + s).length > 200) { out.push(cur.trim()); cur = ''; } cur += s; });
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function cardSpeech(c) {
  const parts = [c.h];
  if (L.i === 0 && L.st.goals) parts.push('Das kannst du danach: ' + L.st.goals.join('. '));
  if (c.body) parts.push(c.body);
  if (c.worked) { parts.push(c.worked.given); c.worked.steps.forEach(s => parts.push(s[0] + ': ' + s[1])); }
  if (c.check) parts.push((/^Kurz testen/.test(c.h) ? '' : 'Kurz testen. ') + c.check.q + ' Wähle die richtige Antwort.');
  else if (c.sim && !c.body) parts.push('Probiere die Simulation aus.');
  return speechClean(parts.join('. '));
}
function audioLesson() {
  const c = L.st.lesson[L.i]; if (!c) return;
  const idx = c.ai !== undefined ? c.ai : L.i, text = c.w || cardSpeech(c);
  if (TOPIC.audio.files !== false && idx >= 0) audioPlay('audio/' + TOPIC.audio.dir + '/' + L.st.id + '-c' + idx + '-w.mp3', text);
  else audioPlay(null, text);
}
function audioPraise() {
  if (!TOPIC.audio || profile.audioOff || ui.screen !== 'round' || !R) return;
  const q = R.queue[R.i];
  if (!q || !q.fb || q.fb.kind !== 'good') return;
  const f = FB_OK[Math.floor(Math.random() * FB_OK.length)];
  audioPlay('audio/' + f[0] + '.mp3', f[1]);
}

/* ---------- PhET-Simulationen (Zusatzkarten in den Schriftrollen) ---------- */
function phetSim(el, c) {
  const p = c.phet, base = 'https://phet.colorado.edu/sims/html/' + p.id + '/latest/' + p.id + '_de.html';
  el.innerHTML = '<div class="phetbox"><p class="small">Diese Simulation kommt von PhET und wird erst nach dem Tippen aus dem Internet geladen.</p><button class="btn btn-primary block" id="phetgo">Simulation starten</button><div id="phetframe"></div><p class="small phetcred">Simulation «' + p.name + '»: PhET Interactive Simulations, University of Colorado Boulder, <a href="https://phet.colorado.edu/de/simulations/' + p.id + '" target="_blank" rel="noopener">phet.colorado.edu</a>, Lizenz CC-BY 4.0.</p></div>';
  const go = el.querySelector('#phetgo');
  go.addEventListener('click', () => {
    el.querySelector('#phetframe').innerHTML = '<iframe class="phetframe" src="' + base + '" title="' + p.name + '" allowfullscreen loading="lazy"></iframe><p class="small">Es lädt nichts? Dann ist das Internet gerade nicht erreichbar oder blockiert. <a href="' + base + '" target="_blank" rel="noopener">In neuem Tab öffnen</a>.</p>';
    go.hidden = true;
  });
}

function render(mode) {
  const app = $id('app');
  if (!app) return;
  document.documentElement.style.setProperty('--realm', ui.screen === 'world' || !REALM ? '#c9a24a' : REALM.color);
  const cls = mode === 'keep' ? ' noanim' : mode === 'fb' ? ' fbmode' : ' enter';
  ui.anim = cls === ' enter';
  const html = ui.screen === 'world' ? viewWorld() : ui.screen === 'home' ? viewHome() : ui.screen === 'round' ? viewRound() : ui.screen === 'summary' ? viewSummary()
    : ui.screen === 'lesson' ? viewLesson() : ui.screen === 'qr' ? viewQr() : ui.screen === 'trophies' ? viewTrophies() : viewLessonDone();
  app.innerHTML = `<div class="view${cls}">${html}</div>`;
  afterRender();
  if (mode === 'fb') {
    if (TOPIC.audio) audioPraise();
    const el = document.querySelector('[data-act="next"]') || document.querySelector('.fb');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'end', behavior: 'smooth' });
    return;
  }
  if (mode !== 'keep') window.scrollTo(0, 0);
  if (ui.screen === 'round' && mode !== 'keep') {
    const q = R.queue[R.i];
    if (q.d.type === 'num' && !q.done) {
      const el = $id('ans');
      if (el) setTimeout(() => el.focus(), 30);
    }
  }
}

/* ---------- Eingaben ---------- */
function onAct(b) {
  const a = b.dataset.act;
  if (a === 'vorlesen') { if (AUD.playing) audioStop(); else audioLesson(); return; }
  if (a === 'tonaus') { profile.audioOff = !profile.audioOff; saveProfile(); if (profile.audioOff) audioStop(); document.querySelectorAll('#tbtn').forEach(x => { x.textContent = profile.audioOff ? 'Ton aus' : 'Ton an'; }); return; }
  audioStop();
  if (a === 'world') goWorld();
  else if (a === 'realm') enterRealm(b.dataset.id);
  else if (a === 'goquest') { enterRealm(b.dataset.id); startLesson(b.dataset.st); }
  else if (a === 'start') startRound(b.dataset.st);
  else if (a === 'review') startRound('review');
  else if (a === 'learn') startLesson(b.dataset.st);
  else if (a === 'lnext') lessonGo(1);
  else if (a === 'lprev') lessonGo(-1);
  else if (a === 'lopt') { if (L.sel[L.i] === undefined) { L.sel[L.i] = parseInt(b.dataset.i, 10); render('fb'); } }
  else if (a === 'lfinish') finishLesson();
  else if (a === 'challenge') startChallenge();
  else if (a === 'challenge-again') startRound('challenge', b.dataset.code);
  else if (a === 'rcode') {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = '6-';
    for (let i = 0; i < 4; i++) c += ch[Math.floor(Math.random() * ch.length)];
    ui.chCode = c; ui.chErr = ''; render('keep');
  }
  else if (a === 'nick') { state.nick = profile.nick = newNick(); save(); saveProfile(); render('keep'); }
  else if (a === 'copy') {
    const line = R && R.summary && R.summary.ch ? R.summary.ch.line : '';
    const say = ok => { const el = $id('copymsg'); if (el) el.textContent = ok ? 'Kopiert.' : 'Markiere den Text und kopiere ihn von Hand.'; };
    try { navigator.clipboard.writeText(line).then(() => say(true), () => say(false)); } catch (err) { say(false); }
  }
  else if (a === 'joinclass') joinClass();
  else if (a === 'leaveclass') leaveClass().then(() => render('keep'));
  else if (a === 'refreshboard') { BE.status = ''; if (ui.bt === 'school') loadSchool(true); else if (ui.bt === 'duel') loadClasses(true); else loadBoard(true); }
  else if (a === 'bt') { ui.bt = b.dataset.t; render('keep'); if (ui.bt === 'school') loadSchool(); else if (ui.bt === 'duel') loadClasses(); }
  else if (a === 'duelgo') { const el = $id('duelcodes'); ui.duelInput = el ? el.value : ''; BE.classes = null; render('keep'); loadClasses(true); }
  else if (a === 'poke') {
    const bub = $id('bubble');
    if (bub) { bub.textContent = WATTI_TIPS[tipI++ % WATTI_TIPS.length]; bub.classList.remove('show'); void bub.offsetWidth; bub.classList.add('show'); }
    const wt = document.querySelector('.hero .watti');
    if (wt) { wt.classList.remove('hop'); void wt.offsetWidth; wt.classList.add('hop'); }
  }
  else if (a === 'introdone') { state.introDone = profile.introDone = true; save(); saveProfile(); render('keep'); }
  else if (a === 'wstep') {
    const ol = document.querySelector('.wsteps'), hid = ol && ol.querySelector('li.hid');
    if (hid) { hid.classList.remove('hid'); L.wk[L.i] = (L.wk[L.i] || 0) + 1; if (hid.scrollIntoView) hid.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (ol && !ol.querySelector('li.hid')) { b.disabled = true; b.textContent = 'Das war es'; }
  }
  else if (a === 'explain') openExplain();
  else if (a === 'backround') { ui.screen = 'round'; render('keep'); window.scrollTo(0, 0); }
  else if (a === 'showqr') showQr();
  else if (a === 'opt') answerMC(parseInt(b.dataset.i, 10));
  else if (a === 'check') checkNum();
  else if (a === 'next') nextQ();
  else if (a === 'home') { ui.screen = 'home'; ui.formulas = false; render(); }
  else if (a === 'trophies') { checkTrophies(); TROPHIES.forEach(t => { if (state.trophies[t.id]) state.trophySeen[t.id] = true; }); save(); ui.screen = 'trophies'; render(); }
  else if (a === 'quit') { ui.screen = 'home'; ui.formulas = false; R = null; render(); }
  else if (a === 'formulas') {
    if (R && ui.screen === 'round') { const el = $id('ans'); if (el) R.queue[R.i].input = el.value; }
    ui.formulas = !ui.formulas; render('keep');
  }
  else if (a === 'reset') {
    if (ui.confirmReset) {
      // Nur dieses Reich zurücksetzen: Serverzeile löschen, die Gilde (Profil) bleibt
      if (BE.client) rpc('leave_class', { p_topic: TOPIC.id }).catch(() => { /* offline: Zeile bleibt, Lehrperson kann sie löschen */ });
      state = defaults(); state.nick = profile.nick; state.realName = profile.realName; state.introDone = profile.introDone; state.classCode = profile.classCode;
      save(); ui.confirmReset = false;
    }
    else ui.confirmReset = true;
    render('keep');
  }
}
// Tippen zuverlässig machen: Touch-Geräte lösen manchmal keinen Klick aus (iPhone-Safari)
let touchPos = null, lastTouchAct = 0;
document.addEventListener('touchstart', e => { const t = e.touches && e.touches[0]; touchPos = t ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
document.addEventListener('touchend', e => {
  const t = e.changedTouches && e.changedTouches[0];
  if (!touchPos || !t) return;
  const moved = Math.abs(t.clientX - touchPos.x) + Math.abs(t.clientY - touchPos.y); touchPos = null;
  if (moved > 10) return;                                   // Wischen zum Scrollen zählt nicht als Tippen
  const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!b || b.disabled) return;
  e.preventDefault(); lastTouchAct = Date.now(); onAct(b);
}, { passive: false });
document.addEventListener('click', e => {
  if (Date.now() - lastTouchAct < 700) return;             // schon über Touch behandelt
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  onAct(b);
});
document.addEventListener('input', e => {
  if (!e.target) return;
  if (e.target.id === 'chcode') ui.chCode = e.target.value;
  else if (e.target.id === 'realname') { state.realName = profile.realName = e.target.value.slice(0, 30); save(); saveProfile(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target) return;
  if (e.target.id === 'ans') { e.preventDefault(); checkNum(); }
  else if (e.target.id === 'chcode') { e.preventDefault(); startChallenge(); }
  else if (e.target.id === 'clscode') { e.preventDefault(); joinClass(); }
});



if (typeof globalThis !== 'undefined') globalThis.__lernapp = { REALMS, loadChapter, chapterData, fmt, parseNum, buildChallenge, normCode, getStations: () => STATIONS, getSims: () => SIMS, getR: () => R, getState: () => state, getProfile: () => profile };
beInit();
// Adressen: #reich-<id> öffnet ein Reich, #reich-<id>/learn-<Quest> direkt die Schriftrolle.
function route() {
  const h = String(location.hash || '');
  let m = /^#reich-([a-z0-9-]+)(?:\/learn-([a-z0-9]+))?$/.exec(h);
  if (m && REALMS.some(r => r.id === m[1])) {
    enterRealm(m[1], false);
    if (m[2] && STATIONS.some(s => s.id === m[2])) startLesson(m[2]);
    return;
  }
  // Alte Sprungadresse der Leistungs-App (index.html#learn-s1)
  m = /^#learn-([a-z0-9]+)$/.exec(h);
  if (m) {
    const r = REALMS.find(x => chapterData(x.id).STATIONS.some(s => s.id === m[1]));
    if (r) { enterRealm(r.id, false); startLesson(m[1]); return; }
  }
  goWorld(true);
}
window.addEventListener('popstate', route);
route();
})();
