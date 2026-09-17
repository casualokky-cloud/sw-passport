/* Customer app logic — index.html */

(() => {
  const NAV_ITEMS = [
    { screen: "screen-passport", icon: "passport", label: "Passport" },
    { screen: "screen-area", icon: "area", label: "Area" },
    { screen: "screen-gallery", icon: "gallery", label: "Gallery" },
    { screen: "screen-profile", icon: "id", label: "SW.ID" },
  ];

  const BRANCHES = [
    { name: "Speedwork Autocare — Kelapa Gading", addr: "Jl. Boulevard Raya Blok QJ 1, Kelapa Gading, Jakarta Utara", tag: "Booth IMOS 2026" },
    { name: "Speedwork Autocare — BSD City", addr: "Jl. Pahlawan Seribu, BSD City, Tangerang Selatan", tag: "Bengkel Mitra" },
    { name: "Speedwork Autocare — Bandung", addr: "Jl. Soekarno Hatta No. 456, Bandung", tag: "Bengkel Mitra" },
    { name: "Speedwork Autocare — Surabaya", addr: "Jl. HR Muhammad No. 88, Surabaya", tag: "Bengkel Mitra" },
  ];

  const GALLERY_ITEMS = [
    { icon: "tire", label: "Katalog Ban Terbaru" },
    { icon: "wrench", label: "Video Edukasi Servis" },
    { badge: "main-video.png", label: "Keseruan Booth" },
    { icon: "trophy", label: "Galeri Pemenang" },
  ];

  let activeStampSheet = null; // stamp id currently open in the sheet
  let currentEventId = null; // which event's passport is currently open
  let scanPollTimer = null;
  let cameraStream = null;
  let coverAutoTimer = null;
  let coverIsOpen = false; // has the passport cover already played its open animation this visit

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function renderIcons(root) {
    qa("[data-icon]", root || document).forEach(el => {
      el.innerHTML = SW.icon(el.getAttribute("data-icon"));
      el.removeAttribute("data-icon");
    });
    qa("[data-icon-color]", root || document).forEach(el => {
      el.innerHTML = SW.colorIcon(el.getAttribute("data-icon-color"));
      el.removeAttribute("data-icon-color");
    });
  }

  function initials(name) {
    return (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  }

  function toast(msg) {
    const el = q("#toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-show"), 2200);
  }

  function eventBadge(ev, count, total) {
    if (ev.active) return `<span class="stampitem__badge is-active">Aktif</span>`;
    if (count >= total) return `<span class="stampitem__badge is-complete">Selesai</span>`;
    return `<span class="stampitem__badge">${count}/${total}</span>`;
  }

  // ---------------- navigation ----------------

  function buildBottomNavs() {
    qa("[data-nav]").forEach(nav => {
      nav.innerHTML = NAV_ITEMS.map(item => `
        <button data-go="${item.screen}">
          ${SW.icon(item.icon)}
          <span>${item.label}</span>
        </button>
      `).join("");
    });
  }

  function initGoDelegation() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-go]");
      if (!btn) return;
      const target = btn.getAttribute("data-go");
      if (target === "screen-passport") openEventPassport(SW.getActiveEvent().id);
      else goTo(target);
    });
  }

  function openEventPassport(eventId) {
    currentEventId = eventId;
    goTo("screen-passport");
  }

  function goTo(screenId) {
    qa(".screen").forEach(s => s.classList.toggle("is-active", s.id === screenId));
    qa("[data-nav] button").forEach(btn => {
      btn.classList.toggle("is-active", btn.getAttribute("data-go") === screenId);
    });
    if (screenId === "screen-home") renderHome();
    if (screenId === "screen-passport") { renderPassport(); armCoverAutoOpen(); }
    if (screenId === "screen-area") renderArea();
    if (screenId === "screen-gallery") renderGallery();
    if (screenId === "screen-profile") renderProfile();
    q(".screen__scroll", q("#" + screenId))?.scrollTo?.(0, 0);
  }

  function openOverlay(id) { q("#" + id).classList.add("is-open"); }
  function closeOverlay(id) { q("#" + id).classList.remove("is-open"); }
  function closeAllOverlays() { qa(".overlay").forEach(o => o.classList.remove("is-open")); }

  // ---------------- login ----------------

  function initLogin() {
    const check = q("#tnc-check");
    const btn = q("#btn-google");
    check.addEventListener("change", () => { btn.disabled = !check.checked; });
    q("#tnc-link").addEventListener("click", () => openOverlay("overlay-tnc"));

    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const existing = SW.getCurrentUser();
      if (existing) { goTo("screen-home"); return; }
      let name = window.prompt("Simulasi Sign in with Google\n\nMasukkan nama kamu:", "");
      const user = SW.createUser(name);
      toast(`Selamat datang, ${user.name.split(" ")[0]}!`);
      goTo("screen-home");
    });
  }

  // ---------------- home ----------------

  function requireUser() {
    const u = SW.getCurrentUser();
    if (!u) { goTo("screen-login"); return null; }
    return u;
  }

  function renderHome() {
    const u = requireUser();
    if (!u) return;

    q("#home-avatar").textContent = initials(u.name);
    q("#home-name").textContent = u.name;
    q("#home-gtid").textContent = u.gtid;

    const total = SW.STAMPS.length;
    const activeEvent = SW.getActiveEvent();
    const done = SW.stampCount(u, activeEvent.id);
    q("#home-progress-num").textContent = `${done} dari ${total}`;
    const fillEl = q("#home-progress-fill");
    fillEl.style.width = `${Math.round((done / total) * 100)}%`;
    if (done === 0) fillEl.style.background = "var(--progress-start)";
    else if (done < total) fillEl.style.background = `linear-gradient(90deg, var(--progress-start), var(--progress-mid))`;
    else fillEl.style.background = `linear-gradient(90deg, var(--progress-start), var(--progress-mid), var(--progress-full))`;

    q("#banner-install").classList.toggle("is-dismissed", !!u.installDismissed);
    q("#banner-notif").classList.toggle("is-dismissed", !!u.notifOn);

    const history = SW.EVENTS.filter(ev => !ev.active).slice().reverse();
    q("#event-history-list").innerHTML = history.map(ev => {
      const c = SW.stampCount(u, ev.id);
      return `
        <div class="stampitem" data-event="${ev.id}">
          <div class="stampitem__num">${SW.colorIcon("passport")}</div>
          <div>
            <div class="stampitem__name">${ev.name}</div>
            <div class="stampitem__desc">${ev.subtitle} · ${ev.dateLabel}</div>
          </div>
          ${eventBadge(ev, c, total)}
        </div>`;
    }).join("") || `<div class="empty-hint">Belum ada riwayat event.</div>`;
    qa("[data-event]", q("#event-history-list")).forEach(el => {
      el.addEventListener("click", () => openEventPassport(el.getAttribute("data-event")));
    });
  }

  function initHomeHandlers() {
    q("#profile-card").addEventListener("click", () => goTo("screen-profile"));
    q("#open-passport").addEventListener("click", () => openEventPassport(SW.getActiveEvent().id));
    q("#btn-notif-bell").addEventListener("click", () => toast("Belum ada notifikasi baru"));
    q("#btn-cart").addEventListener("click", () => toast("Keranjang kosong"));

    q("#btn-install").addEventListener("click", () => {
      const u = SW.getCurrentUser();
      SW.updateUser(u.gtid, { installDismissed: true });
      toast("SpeedApp ditambahkan ke layar utama (simulasi).");
      renderHome();
    });
    q("#btn-install-skip").addEventListener("click", () => {
      const u = SW.getCurrentUser();
      SW.updateUser(u.gtid, { installDismissed: true });
      renderHome();
    });
    q("#btn-notif").addEventListener("click", () => {
      const u = SW.getCurrentUser();
      SW.updateUser(u.gtid, { notifOn: true });
      toast("Notifikasi diaktifkan.");
      renderHome();
    });
  }

  // ---------------- passport (stamp board + mission list) ----------------

  function renderPassport() {
    const u = requireUser();
    if (!u) return;
    if (!currentEventId) currentEventId = SW.getActiveEvent().id;
    const ev = SW.getEvent(currentEventId) || SW.getActiveEvent();

    q("#passport-topbar-title").textContent = ev.name;
    q("#passport-book-event").textContent = ev.name;
    q("#passport-book-sub").textContent = ev.active
      ? "Tap stamp untuk info lebih lanjut"
      : `${ev.subtitle} · ${ev.dateLabel}`;
    q("#passport-cover-name").textContent = u.name;

    const total = SW.STAMPS.length;
    const done = SW.stampCount(u, ev.id);
    q("#passport-progress-num").textContent = `${done} dari ${total}`;
    const heroFill = q("#passport-progress-fill");
    heroFill.style.width = `${Math.round((done / total) * 100)}%`;
    if (done === 0) heroFill.style.background = "var(--progress-start)";
    else if (done < total) heroFill.style.background = `linear-gradient(90deg, var(--progress-start), var(--progress-mid))`;
    else heroFill.style.background = `linear-gradient(90deg, var(--progress-start), var(--progress-mid), var(--progress-full))`;

    const statusBanner = q("#event-status-banner");
    q("#passport-board").classList.toggle("is-closed", !ev.active);
    q("#passport-ribbon").style.display = ev.active ? "none" : "block";
    q("#open-scanner").style.display = ev.active ? "flex" : "none";
    if (ev.active) {
      statusBanner.style.display = "none";
    } else {
      statusBanner.style.display = "flex";
      q("#event-status-text").textContent = `Event ${ev.name} sudah selesai — ini riwayat stempel kamu.`;
    }

    buildStampGrid(u, ev);
    buildMissionList(u, ev);
  }

  function buildStampGrid(u, ev) {
    const stamps = u.events[ev.id];
    const grid = q("#stamp-grid");
    const nextStamp = ev.active ? SW.STAMPS.find(s => !stamps[s.id]) : null;
    grid.innerHTML = SW.STAMPS.map((s, i) => {
      const done = !!stamps[s.id];
      const isNext = !done && nextStamp && nextStamp.id === s.id;
      const rot = SW.STAMP_ROTATIONS[i % SW.STAMP_ROTATIONS.length];
      return `
        <div class="stamp-cell${done ? " is-done" : ""}${isNext ? " is-next" : ""}" data-stamp="${s.id}" style="--i:${i}; --rot:${rot}deg">
          <div class="stamp-cell__badge">
            <img src="${SW.stampBadgeUrl(s.badge)}" alt="${s.name}">
            <div class="stamp-cell__check">${SW.icon("check")}</div>
          </div>
          <div class="stamp-cell__label">${s.name}</div>
        </div>`;
    }).join("");
    qa("[data-stamp]", grid).forEach(el => {
      el.addEventListener("click", () => openStampSheet(Number(el.getAttribute("data-stamp"))));
    });
  }

  function buildMissionList(u, ev) {
    const stamps = u.events[ev.id];
    const list = q("#mission-list");
    list.innerHTML = SW.STAMPS.map(s => {
      const done = !!stamps[s.id];
      return `
        <div class="mission-item${done ? " is-done" : ""}" data-stamp="${s.id}">
          <div class="mission-item__badge"><img src="${SW.stampBadgeUrl(s.badge)}" alt=""></div>
          <div>
            <div class="mission-item__title">${s.name}</div>
            <div class="mission-item__stamp">Stamp ${s.id}</div>
          </div>
          <div class="mission-item__check">${SW.icon("check")}</div>
        </div>`;
    }).join("");
    qa("[data-stamp]", list).forEach(el => {
      el.addEventListener("click", () => openStampSheet(Number(el.getAttribute("data-stamp"))));
    });
  }

  function initViewTabs() {
    q("#btn-toggle-missions").addEventListener("click", () => {
      const isList = q("#mission-list").style.display === "flex";
      switchView(isList ? "map" : "list");
    });
    q("#btn-passport-next").addEventListener("click", (e) => {
      e.stopPropagation();
      openCoverAndReveal();
    });
    q("#passport-cover").addEventListener("click", () => openCoverAndReveal());
  }

  // ---------------- passport cover "book opens automatically" animation ----------------

  function armCoverAutoOpen() {
    clearTimeout(coverAutoTimer);
    coverIsOpen = false;
    if (q("#mission-list").style.display === "flex") return; // already viewing the mission list
    const cover = q("#passport-cover");
    cover.classList.remove("is-opening");
    cover.style.display = "block";
    coverAutoTimer = setTimeout(openCoverAndReveal, 900);
  }

  function openCoverAndReveal() {
    clearTimeout(coverAutoTimer);
    const cover = q("#passport-cover");
    if (coverIsOpen || cover.classList.contains("is-opening")) return;
    coverIsOpen = true;
    cover.classList.add("is-opening");
    setTimeout(() => {
      cover.style.display = "none";
      q("#passport-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 680);
  }

  function switchView(view) {
    q("#btn-toggle-missions").setAttribute("aria-expanded", view === "list" ? "true" : "false");
    q("#passport-cover").style.display = (view === "map" && !coverIsOpen) ? "block" : "none";
    q("#passport-wrap").style.display = view === "map" ? "block" : "none";
    const ev = SW.getEvent(currentEventId);
    q("#open-scanner").style.display = (view === "map" && ev && ev.active) ? "flex" : "none";
    q("#mission-list").style.display = view === "list" ? "flex" : "none";
  }

  // ---------------- mission detail sheet ----------------

  function openStampSheet(stampId) {
    const u = requireUser();
    if (!u) return;
    const ev = SW.getEvent(currentEventId) || SW.getActiveEvent();
    const s = SW.getStamp(stampId);
    activeStampSheet = stampId;

    q("#stampdetail-icon").innerHTML = `<img src="${SW.stampBadgeUrl(s.badge)}" alt="">`;
    q("#stampdetail-title").textContent = `Stamp ${s.id} — ${s.name}`;
    q("#stampdetail-desc").textContent = s.desc;

    const rewardEl = q("#stampdetail-reward");
    rewardEl.classList.toggle("is-physical", s.reward.type === "physical");
    rewardEl.textContent = s.reward.type === "physical"
      ? `🎁 Reward fisik: ${s.reward.detail} (${s.reward.vendor})`
      : `✨ ${s.reward.detail}`;

    const done = !!u.events[ev.id][stampId];
    q("#stampdetail-todo").style.display = (!done && ev.active) ? "block" : "none";
    q("#stampdetail-done").style.display = done ? "block" : "none";
    q("#stampdetail-closed").style.display = (!done && !ev.active) ? "block" : "none";

    openOverlay("overlay-stamp");
  }

  // ---------------- scanner: customer scans the booth's revealed QR ----------------

  function openScanner() {
    const u = SW.getCurrentUser();
    const ev = SW.getEvent(currentEventId) || SW.getActiveEvent();
    if (!u || !ev.active) return;
    closeOverlay("overlay-stamp");
    openOverlay("overlay-scanner");
    resetScannerUI();
    checkGeofenceForScanner(ev);
  }

  function resetScannerUI() {
    q("#scanner-view").classList.remove("is-live");
    q("#scanner-idle").style.display = "flex";
    q("#btn-start-scanner").style.display = "flex";
    q("#btn-start-scanner").innerHTML = `${SW.icon("scan")} Mulai Scan`;
  }

  function checkGeofenceForScanner(ev) {
    const statusEl = q("#geo-status");
    const textEl = q("#geo-status-text");
    statusEl.className = "geo-status is-checking";
    textEl.textContent = "Memeriksa lokasi kamu…";

    if (!("geolocation" in navigator)) {
      statusEl.className = "geo-status is-warn";
      textEl.textContent = "Lokasi tidak didukung browser ini — PIC bisa aktivasi manual jika perlu.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const res = SW.checkGeofence(ev.id, pos.coords);
        if (!res.supported) {
          statusEl.className = "geo-status is-ok";
          textEl.textContent = "Lokasi terverifikasi.";
        } else if (res.ok) {
          statusEl.className = "geo-status is-ok";
          textEl.textContent = `Kamu berada di area booth (±${res.distanceM}m).`;
        } else {
          statusEl.className = "geo-status is-warn";
          textEl.textContent = `Kamu ${res.distanceM}m dari booth (radius ${res.radiusM}m) — dekati lokasi booth untuk scan.`;
        }
      },
      () => {
        statusEl.className = "geo-status is-warn";
        textEl.textContent = "Izin lokasi ditolak/tidak tersedia — PIC bisa aktivasi manual jika perlu.";
      },
      { timeout: 8000 }
    );
  }

  async function startScanner() {
    const box = q("#scanner-view");
    const btn = q("#btn-start-scanner");
    if (cameraStream) return;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      q("#scanner-video").srcObject = cameraStream;
      box.classList.add("is-live");
      btn.innerHTML = `${SW.icon("scan")} Mencari QR…`;
    } catch (err) {
      box.classList.add("is-live");
      q("#scanner-idle").style.display = "none";
      btn.innerHTML = `${SW.icon("scan")} Mencari QR… (kamera tidak tersedia)`;
    }
    armScanPoll();
  }

  function armScanPoll() {
    const u = SW.getCurrentUser();
    const ev = SW.getEvent(currentEventId) || SW.getActiveEvent();
    clearInterval(scanPollTimer);
    scanPollTimer = setInterval(() => {
      const reveal = SW.getActiveRevealForEvent(ev.id);
      if (!reveal) return;
      const claimed = SW.claimReveal(reveal.id, u.gtid, u.name);
      if (claimed) {
        clearInterval(scanPollTimer);
        scanPollTimer = null;
        stopCamera();
        closeOverlay("overlay-scanner");
        showSuccess(claimed.stampId);
        renderPassport();
        renderHome();
      }
    }, 700);
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    clearInterval(scanPollTimer);
    scanPollTimer = null;
  }

  function showSuccess(stampId) {
    const u = SW.getCurrentUser();
    const ev = SW.getEvent(currentEventId) || SW.getActiveEvent();
    const s = SW.getStamp(stampId);
    q("#success-seal").innerHTML = `<img src="${SW.stampBadgeUrl(s.badge)}" alt="">`;

    const stamps = u.events[ev.id];
    const next = SW.STAMPS.find(x => !stamps[x.id]);
    const card = q("#next-stamp-card");
    if (next) {
      card.style.display = "flex";
      q("#next-stamp-badge").innerHTML = `<img src="${SW.stampBadgeUrl(next.badge)}" alt="">`;
      q("#next-stamp-name").textContent = next.name;
    } else {
      card.style.display = "none";
    }
    openOverlay("overlay-success");
  }

  // ---------------- event switcher ----------------

  function initEventSwitcher() {
    q("#btn-switch-event").addEventListener("click", () => {
      const u = SW.getCurrentUser();
      if (!u) return;
      const total = SW.STAMPS.length;
      q("#event-switch-list").innerHTML = SW.EVENTS.slice().reverse().map(ev => {
        const c = SW.stampCount(u, ev.id);
        return `
          <div class="stampitem${ev.id === currentEventId ? " is-current" : ""}" data-switch-event="${ev.id}">
            <div class="stampitem__num">${SW.colorIcon("passport")}</div>
            <div>
              <div class="stampitem__name">${ev.name}</div>
              <div class="stampitem__desc">${ev.subtitle} · ${ev.dateLabel}</div>
            </div>
            ${eventBadge(ev, c, total)}
          </div>`;
      }).join("");
      qa("[data-switch-event]", q("#event-switch-list")).forEach(el => {
        el.addEventListener("click", () => {
          closeAllOverlays();
          openEventPassport(el.getAttribute("data-switch-event"));
        });
      });
      openOverlay("overlay-events");
    });
  }

  // ---------------- overlay handlers ----------------

  function initOverlayHandlers() {
    qa("[data-close-overlay]").forEach(btn => {
      btn.addEventListener("click", () => { stopCamera(); closeAllOverlays(); });
    });
    qa(".overlay").forEach(ov => {
      ov.addEventListener("click", (e) => { if (e.target === ov) { stopCamera(); closeAllOverlays(); } });
    });
    q("#btn-show-qr").addEventListener("click", openScanner);
    q("#open-scanner").addEventListener("click", openScanner);
    q("#btn-start-scanner").addEventListener("click", startScanner);
  }

  // ---------------- area / gallery ----------------

  function renderArea() {
    q("#branch-list").innerHTML = BRANCHES.map(b => `
      <div class="branch-card">
        <div class="branch-card__pin">${SW.colorIcon("area")}</div>
        <div>
          <div class="branch-card__name">${b.name}</div>
          <div class="branch-card__addr">${b.addr}</div>
          <span class="branch-card__tag">${b.tag}</span>
        </div>
      </div>
    `).join("");
  }

  function renderGallery() {
    q("#gallery-grid").innerHTML = GALLERY_ITEMS.map(g => `
      <div class="gallery-tile">
        ${g.badge ? `<img src="${SW.stampBadgeUrl(g.badge)}" alt="" style="width:56px;height:56px;object-fit:contain">` : SW.colorIcon(g.icon)}
        <span>${g.label}</span>
      </div>
    `).join("");
  }

  // ---------------- profile ----------------

  function renderProfile() {
    const u = requireUser();
    if (!u) return;
    q("#profile-avatar").textContent = initials(u.name);
    q("#profile-name").textContent = u.name;
    q("#profile-gtid").textContent = u.gtid;
    q("#profile-stamps").textContent = `${SW.stampCount(u, SW.getActiveEvent().id)}/${SW.STAMPS.length}`;
    q("#profile-since").textContent = new Date(u.joinedAt).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
    SW.drawFakeQr(q("#profile-qr"), `SW-ID|${u.gtid}`, "#019872");
  }

  function initProfileHandlers() {
    q("#btn-logout").addEventListener("click", () => {
      SW.clearCurrentGtid();
      q("#tnc-check").checked = false;
      q("#btn-google").disabled = true;
      goTo("screen-login");
    });
  }

  // ---------------- live sync across tabs ----------------

  function initSync() {
    SW.onSync(() => {
      const u = SW.getCurrentUser();
      if (!u) return;
      const activeScreen = q(".screen.is-active")?.id;
      if (activeScreen === "screen-home") renderHome();
      if (activeScreen === "screen-passport") renderPassport();
      if (activeScreen === "screen-profile") renderProfile();
      if (q("#overlay-stamp").classList.contains("is-open") && activeStampSheet != null) {
        openStampSheet(activeStampSheet);
      }
    });
  }

  // ---------------- boot ----------------

  document.addEventListener("DOMContentLoaded", () => {
    renderIcons();
    buildBottomNavs();
    initGoDelegation();
    initLogin();
    initHomeHandlers();
    initViewTabs();
    initEventSwitcher();
    initOverlayHandlers();
    initProfileHandlers();
    initSync();

    const u = SW.getCurrentUser();
    goTo(u ? "screen-home" : "screen-login");
  });
})();
