/* SpeedPassport — SpeedApp gamification
   Shared data model + storage helpers used by both index.html (customer)
   and staff.html (PIC/booth console).

   Flow direction matches the BRD (SSU-IT-BRD v1.0), which intentionally
   reverses the old GT Passport model: the booth holds a static QR (kept
   hidden by PIC, revealed only after PIC verifies the activity), and the
   CUSTOMER scans it in-app, with a geofence check as an added safeguard.
   See README.md for what's simulated vs real in this front-end-only demo.

   Persistence note: "users" and "active reveals" (the booth-QR-is-live
   records) live in localStorage on the current browser, synced live
   across tabs with the storage event + BroadcastChannel. Open index.html
   and staff.html side by side to see the full loop. */

const SW = (() => {
  const LS_USERS = "sw_users";
  const LS_CURRENT = "sw_current_gtid";
  const LS_REVEALS = "sw_active_reveals";
  const LS_LOG = "sw_scan_log";

  const channel = ("BroadcastChannel" in window) ? new BroadcastChannel("sw-passport") : null;

  // Passport works across every offline event Speedwork runs — each event
  // gets its own stamp progress. Order here is oldest first; IMOS 2026 is
  // the one currently running and the only one with a live booth/geofence.
  const EVENTS = [
    { id: "giias2026", name: "GIIAS 2026", subtitle: "Gaikindo Indonesia International Auto Show", dateLabel: "Jun 2026", active: false },
    { id: "prj2026", name: "PRJ 2026", subtitle: "Pekan Raya Jakarta", dateLabel: "Jul 2026", active: false },
    {
      id: "imos2026", name: "IMOS 2026", subtitle: "Indonesia Motor Show", dateLabel: "Sep 2026 · Berlangsung", active: true,
      // ICE BSD City, Tangerang — sample venue coordinate for the geofence
      // demo. Radius is generous (300m) so the demo is usable indoors
      // where GPS accuracy is poor; a real deployment would tune this per
      // booth, per BRD 4.2-D ("radius threshold to be confirmed").
      boothLocation: { lat: -6.3008, lng: 106.6486, radiusM: 300 },
    },
  ];

  // The nine SpeedPassport missions, transcribed from the Figma handoff
  // (components/Passport.jsx instance states + README's mission-key
  // list). `badge` points at the real sticker artwork extracted from the
  // design file (components/assets/*.png) — not a placeholder.
  const STAMPS = [
    { id: 1, key: "daftar speedapp", name: "Daftar SpeedApp", desc: "Selesaikan pendaftaran akun & lengkapi profil kamu di SpeedApp.", badge: "daftar-speedapp.png", reward: { type: "digital", detail: "+50 SpeedPoint", vendor: "SpeedApp" } },
    { id: 2, key: "konsultasi ban", name: "Konsultasi Ban", desc: "Konsultasi kondisi & rekomendasi ban bersama tim GT Radial di booth.", badge: "konsultasi-ban.png", reward: { type: "digital", detail: "+100 SpeedPoint", vendor: "GT Radial" } },
    { id: 3, key: "main video", name: "Main di Video Booth", desc: "Rekam video seru di booth AI photo/video dan bagikan momennya.", badge: "main-video.png", reward: { type: "digital", detail: "+50 SpeedPoint", vendor: "SpeedApp" } },
    { id: 4, key: "follow ig", name: "Follow Instagram", desc: "Follow akun Instagram resmi Speedwork/GT Radial.", badge: "follow-ig.png", reward: { type: "digital", detail: "+30 SpeedPoint", vendor: "SpeedApp" } },
    { id: 5, key: "join komunitas", name: "Join Komunitas", desc: "Gabung ke komunitas SpeedApp langsung dari booth.", badge: "join-komunitas.png", reward: { type: "digital", detail: "+30 SpeedPoint", vendor: "SpeedApp" } },
    { id: 6, key: "mini games", name: "Mini Games", desc: "Mainkan mini game berhadiah di booth event.", badge: "mini-games.png", reward: { type: "physical", detail: "Merchandise Speedwork", vendor: "Speedwork" } },
    { id: 7, key: "survey", name: "Isi Survey", desc: "Bantu isi survey kepuasan layanan di booth.", badge: "survey.png", reward: { type: "digital", detail: "+50 SpeedPoint", vendor: "SpeedApp" } },
    { id: 8, key: "half set", name: "Pembelian Half-Set", desc: "Selesaikan transaksi pembelian ban half-set di booth/bengkel.", badge: "half-set.png", reward: { type: "physical", detail: "Voucher servis + merchandise", vendor: "GT Radial" } },
    { id: 9, key: "full set", name: "Pembelian Full-Set", desc: "Selesaikan transaksi pembelian ban full-set di booth/bengkel.", badge: "full-set.png", reward: { type: "physical", detail: "Paket merchandise eksklusif", vendor: "GT Radial" } },
  ];

  // Slight rotation per stamp cell, so the board reads like stamps
  // actually pressed onto a passport page rather than a tidy grid —
  // matches the transform matrices on Passport.jsx's IconSpeedStamp
  // instances (each one sits a few degrees off-axis).
  const STAMP_ROTATIONS = [-4, 3, -2, 5, -3, 2, -5, 4, -2];

  const NAMES = ["Dian Anggraeni", "Wandi Kafri", "Rizky Pratama", "Sarah Amelia", "Budi Santoso", "Putri Lestari"];

  function uid() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function genGtid() {
    return "SW.ID-" + Math.floor(10000000 + Math.random() * 89999999);
  }

  function loadUsers() {
    let users;
    try { users = JSON.parse(localStorage.getItem(LS_USERS)) || {}; }
    catch (e) { users = {}; }
    let changed = false;
    Object.values(users).forEach(u => { if (migrateUserEvents(u)) changed = true; });
    if (changed) localStorage.setItem(LS_USERS, JSON.stringify(users));
    return users;
  }

  // Self-heals accounts from an earlier shape of this demo (flat
  // user.stamps, or an events map missing an event added later) so a
  // stale account never hard-crashes the passport screen.
  function migrateUserEvents(user) {
    if (!user.events) {
      const events = {};
      EVENTS.forEach(ev => { events[ev.id] = blankStamps(); });
      if (user.stamps) {
        Object.keys(user.stamps).forEach(k => {
          if (events[getActiveEvent().id][k] !== undefined) events[getActiveEvent().id][k] = user.stamps[k];
        });
        delete user.stamps;
      }
      STAMPS.forEach(s => { events["giias2026"][s.id] = true; });
      STAMPS.forEach((s, i) => { events["prj2026"][s.id] = i < 7; });
      user.events = events;
      return true;
    }
    let changed = false;
    EVENTS.forEach(ev => {
      if (!user.events[ev.id]) { user.events[ev.id] = blankStamps(); changed = true; }
    });
    return changed;
  }
  function saveUsers(users) {
    localStorage.setItem(LS_USERS, JSON.stringify(users));
    broadcast({ type: "users" });
  }

  function getCurrentGtid() { return localStorage.getItem(LS_CURRENT); }
  function setCurrentGtid(gtid) { localStorage.setItem(LS_CURRENT, gtid); }
  function clearCurrentGtid() { localStorage.removeItem(LS_CURRENT); }

  function getCurrentUser() {
    const gtid = getCurrentGtid();
    if (!gtid) return null;
    const users = loadUsers();
    return users[gtid] || null;
  }

  function getEvent(eventId) { return EVENTS.find(e => e.id === eventId) || null; }
  function getActiveEvent() { return EVENTS.find(e => e.active) || EVENTS[EVENTS.length - 1]; }

  function blankStamps() {
    const stamps = {};
    STAMPS.forEach(s => stamps[s.id] = false);
    return stamps;
  }

  function createUser(name) {
    const users = loadUsers();
    const gtid = genGtid();

    const events = {};
    EVENTS.forEach(ev => { events[ev.id] = blankStamps(); });

    // Seed realistic history so a fresh demo account has something under
    // "Riwayat Event" right away: GIIAS fully wrapped, PRJ mostly done.
    // The active event starts fresh except stamp 1, satisfied by signup.
    STAMPS.forEach(s => { events["giias2026"][s.id] = true; });
    STAMPS.forEach((s, i) => { events["prj2026"][s.id] = i < 7; });
    const active = getActiveEvent();
    if (events[active.id]) events[active.id][1] = true;

    users[gtid] = {
      gtid,
      name: name && name.trim() ? name.trim() : NAMES[Math.floor(Math.random() * NAMES.length)],
      joinedAt: Date.now(),
      events,
      installDismissed: false,
      notifOn: false,
    };
    saveUsers(users);
    setCurrentGtid(gtid);
    return users[gtid];
  }

  function updateUser(gtid, patch) {
    const users = loadUsers();
    if (!users[gtid]) return null;
    users[gtid] = Object.assign({}, users[gtid], patch);
    saveUsers(users);
    return users[gtid];
  }

  function setStamp(gtid, eventId, stampId, done) {
    const users = loadUsers();
    if (!users[gtid]) return null;
    if (!users[gtid].events[eventId]) users[gtid].events[eventId] = blankStamps();
    users[gtid].events[eventId][stampId] = done;
    saveUsers(users);
    const ev = getEvent(eventId);
    appendLog(`Stamp ${stampId} (${stampName(stampId)}) diklaim oleh ${users[gtid].name} — ${ev ? ev.name : eventId}`);
    return users[gtid];
  }

  function stampName(id) {
    const s = STAMPS.find(x => x.id === Number(id));
    return s ? s.name : "Stamp";
  }
  function getStamp(id) {
    return STAMPS.find(x => x.id === Number(id)) || null;
  }

  function stampCount(user, eventId) {
    if (!user) return 0;
    const stamps = user.events && user.events[eventId];
    if (!stamps) return 0;
    return Object.values(stamps).filter(Boolean).length;
  }

  // ---- geofencing (BRD 4.2-D: accept a stamp claim only within radius) ----

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function checkGeofence(eventId, coords) {
    const ev = getEvent(eventId);
    if (!ev || !ev.boothLocation) return { supported: false, ok: true, distanceM: null };
    const { lat, lng, radiusM } = ev.boothLocation;
    const distanceM = Math.round(haversineMeters(coords.latitude, coords.longitude, lat, lng));
    return { supported: true, ok: distanceM <= radiusM, distanceM, radiusM };
  }

  // ---- active reveals: PIC "holds" the booth QR, reveals it only after
  // verifying the activity, customer's in-app scanner claims it ----

  function loadReveals() {
    let list;
    try { list = JSON.parse(localStorage.getItem(LS_REVEALS)) || []; }
    catch (e) { list = []; }
    const now = Date.now();
    const fresh = list.filter(r => r.expiresAt > now);
    if (fresh.length !== list.length) localStorage.setItem(LS_REVEALS, JSON.stringify(fresh));
    return fresh;
  }
  function saveReveals(list) {
    localStorage.setItem(LS_REVEALS, JSON.stringify(list));
    broadcast({ type: "reveals" });
  }

  function startReveal(eventId, stampId, durationMs) {
    const list = loadReveals().filter(r => !(r.eventId === eventId && r.stampId === stampId));
    const ev = getEvent(eventId);
    const reveal = {
      id: uid(),
      eventId, stampId,
      eventName: ev ? ev.name : eventId,
      stampName: stampName(stampId),
      token: `SW-BOOTH|${eventId}|${stampId}|${Date.now()}|${uid()}`,
      ts: Date.now(),
      expiresAt: Date.now() + (durationMs || 90000),
    };
    list.push(reveal);
    saveReveals(list);
    appendLog(`PIC me-reveal QR booth untuk stamp ${stampId} (${stampName(stampId)}) — ${reveal.eventName}`);
    return reveal;
  }

  function cancelReveal(id) {
    saveReveals(loadReveals().filter(r => r.id !== id));
  }

  function getActiveRevealForEvent(eventId) {
    return loadReveals().find(r => r.eventId === eventId) || null;
  }

  // Customer's scanner "detects" whatever booth QR is currently revealed
  // for the active event and claims it — this is the simulated stand-in
  // for real camera QR decoding (see README).
  function claimReveal(revealId, gtid, name) {
    const list = loadReveals();
    const reveal = list.find(r => r.id === revealId);
    if (!reveal) return null;
    saveReveals(list.filter(r => r.id !== revealId));
    setStamp(gtid, reveal.eventId, reveal.stampId, true);
    appendLog(`${name} berhasil scan QR booth & klaim stamp ${reveal.stampId} — ${reveal.eventName}`);
    return reveal;
  }

  function appendLog(text) {
    let log = [];
    try { log = JSON.parse(localStorage.getItem(LS_LOG)) || []; } catch (e) {}
    log.unshift({ text, ts: Date.now() });
    log = log.slice(0, 30);
    localStorage.setItem(LS_LOG, JSON.stringify(log));
    broadcast({ type: "log" });
  }
  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LS_LOG)) || []; }
    catch (e) { return []; }
  }

  function broadcast(msg) {
    if (channel) channel.postMessage(msg);
  }
  function onSync(cb) {
    window.addEventListener("storage", () => cb());
    if (channel) channel.onmessage = () => cb();
  }

  // ---- fake-but-authentic-looking QR renderer (visual only) ----
  // Deterministic module grid seeded from the token string, drawn with
  // real QR-style finder patterns in the three corners. Not a scannable
  // standard QR — see README.md.

  function seededRand(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function drawFakeQr(canvas, token, color) {
    const N = 25;
    const cell = 8;
    canvas.width = N * cell;
    canvas.height = N * cell;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color || "#019872";

    const rand = seededRand(token);
    const grid = [];
    for (let y = 0; y < N; y++) {
      grid.push([]);
      for (let x = 0; x < N; x++) grid[y].push(rand() > 0.55 ? 1 : 0);
    }

    function finder(gx, gy) {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const border = x === 0 || x === 6 || y === 0 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          grid[gy + y][gx + x] = (border || core) ? 1 : 0;
        }
      }
    }
    finder(0, 0);
    finder(N - 7, 0);
    finder(0, N - 7);

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (grid[y][x]) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
      }
    }
  }

  // ---- inline icon set (stroke-style, currentColor) — UI chrome only ----

  const ICONS = {
    passport: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>',
    area: '<path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>',
    gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 16l-5.5-5.5L6 19"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="12" r="2.2"/><path d="M6 16.2c.6-1.6 1.6-2.3 2.5-2.3s1.9.7 2.5 2.3M14 9.5h5M14 13h5M14 16h3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0v5l1.5 3h-15L6 14V9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    download: '<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    scan: '<path d="M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2M20 7V5a1 1 0 0 0-1-1h-2M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M4 12h16"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.4-2.4A2 2 0 0 1 11.1 3.6h1.8a2 2 0 0 1 1.7 1L16 7"/><circle cx="12" cy="13.5" r="3.4"/>',
    location: '<path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.6 12.2A2 2 0 0 0 9.5 18h8a2 2 0 0 0 1.9-1.4L21 8H6"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5L12 12l8-4.5M12 12v9"/>',
  };

  function icon(name, cls) {
    return `<svg class="ic ${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  }

  // ---- full-color illustrated icon set for the homepage menu grid /
  // area / gallery — not the stamps, which use the real badge artwork ----

  const COLOR_ICONS = {
    tire: `
      <circle cx="20" cy="20" r="16" fill="#26282b"/>
      <circle cx="20" cy="20" r="16" fill="none" stroke="#0e0f10" stroke-width="2"/>
      <circle cx="20" cy="20" r="10.5" fill="#c6cbce"/>
      <circle cx="20" cy="20" r="4.4" fill="#8a9096"/>
      <g fill="#9aa0a5"><rect x="18.6" y="10" width="2.8" height="7" rx="1.2"/><rect x="18.6" y="23" width="2.8" height="7" rx="1.2"/><rect x="10" y="18.6" width="7" height="2.8" rx="1.2"/><rect x="23" y="18.6" width="7" height="2.8" rx="1.2"/></g>
      <circle cx="20" cy="20" r="2" fill="#e04b3a"/>`,
    oil: `
      <path d="M13 4h14l-2 8H15l-2-8z" fill="#e04b3a"/>
      <path d="M12 12h16l2 20a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3l2-20z" fill="#019872"/>
      <rect x="15" y="19" width="10" height="9" rx="1.5" fill="#fff"/>
      <path d="M17 23h6" stroke="#019872" stroke-width="2" stroke-linecap="round"/>`,
    wrench: `
      <g transform="rotate(45 20 20)">
        <rect x="17" y="2" width="6" height="15" rx="2.5" fill="#e04b3a"/>
        <rect x="18.3" y="2" width="3.4" height="15" rx="1.5" fill="#f38272"/>
        <rect x="17" y="17" width="6" height="17" rx="2" fill="#c8ccd0"/>
      </g>
      <g transform="rotate(-40 20 20)">
        <rect x="17.2" y="8" width="5.6" height="26" rx="2.5" fill="#4b6672"/>
        <path d="M14 4a6 6 0 0 0 6 6 6 6 0 0 0 6-6 6 6 0 0 1-1.8 8.3 6 6 0 0 1-8.4-1.8A6 6 0 0 1 14 4z" fill="#6f8b98"/>
      </g>`,
    garage: `
      <path d="M4 18V10l16-6 16 6v8" fill="#019872"/>
      <rect x="4" y="18" width="32" height="18" fill="#00664c"/>
      <rect x="9" y="23" width="8" height="13" fill="#fff"/>
      <rect x="23" y="23" width="8" height="13" fill="#fff"/>`,
    passport: `
      <rect x="7" y="4" width="26" height="32" rx="3" fill="#019872"/>
      <rect x="7" y="4" width="26" height="32" rx="3" fill="none" stroke="#007c5f" stroke-width="1.5"/>
      <circle cx="20" cy="16" r="6" fill="none" stroke="#fbf6e8" stroke-width="1.6"/>
      <circle cx="20" cy="16" r="2.4" fill="#fbf6e8"/>
      <rect x="12" y="26" width="16" height="2.2" rx="1.1" fill="#fbf6e8" opacity=".85"/>
      <rect x="15" y="30" width="10" height="2.2" rx="1.1" fill="#fbf6e8" opacity=".6"/>`,
    area: `
      <path d="M20 4c7 0 12.5 5.4 12.5 12.5C32.5 26 20 37 20 37S7.5 26 7.5 16.5C7.5 9.4 13 4 20 4z" fill="#e04b3a"/>
      <path d="M20 4c7 0 12.5 5.4 12.5 12.5C32.5 26 20 37 20 37S7.5 26 7.5 16.5C7.5 9.4 13 4 20 4z" fill="none" stroke="#a8291d" stroke-width="1.4"/>
      <circle cx="20" cy="16.5" r="5.4" fill="#fff"/>
      <circle cx="20" cy="16.5" r="2.4" fill="#e04b3a"/>`,
    gallery: `
      <rect x="4" y="8" width="32" height="26" rx="3" fill="#fff" stroke="#d8cca0" stroke-width="1.5"/>
      <rect x="6" y="10" width="28" height="22" rx="2" fill="#cfeede"/>
      <circle cx="14" cy="18" r="3.2" fill="#ffd23f"/>
      <path d="M6 30l8.5-8.5a2 2 0 0 1 2.8 0L24 28l3-3a2 2 0 0 1 2.8 0L34 29v3H6z" fill="#019872"/>`,
    trophy: `
      <path d="M13 6h14v9a7 7 0 0 1-14 0V6z" fill="#ffd23f"/>
      <path d="M13 8H7a4 4 0 0 0 4 7" fill="none" stroke="#ffd23f" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M27 8h6a4 4 0 0 1-4 7" fill="none" stroke="#ffd23f" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="17.5" y="21" width="5" height="6" fill="#e0a92a"/>
      <path d="M11 34c0-3 4-5 9-5s9 2 9 5" fill="#e0a92a"/>
      <path d="M20 8l1.4 3 3.3.4-2.4 2.3.6 3.3-2.9-1.6-2.9 1.6.6-3.3-2.4-2.3 3.3-.4z" fill="#fff2c2"/>`,
  };

  function colorIcon(name, cls) {
    return `<svg class="ic-color ${cls || ""}" viewBox="0 0 40 40">${COLOR_ICONS[name] || ""}</svg>`;
  }

  function stampBadgeUrl(filename) {
    return "assets/stamps/" + filename;
  }

  return {
    EVENTS, STAMPS, STAMP_ROTATIONS,
    getEvent, getActiveEvent, getStamp,
    loadUsers, saveUsers, getCurrentGtid, setCurrentGtid, clearCurrentGtid, getCurrentUser,
    createUser, updateUser, setStamp, stampName, stampCount,
    checkGeofence,
    loadReveals, startReveal, cancelReveal, getActiveRevealForEvent, claimReveal,
    appendLog, loadLog, onSync, drawFakeQr, icon, colorIcon, stampBadgeUrl,
  };
})();
