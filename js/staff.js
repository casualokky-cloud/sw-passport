/* PIC / booth console — staff.html
   Implements the BRD's reversed flow: PIC holds the booth's QR hidden by
   default, verifies the activity, then reveals it for a limited window
   so the customer can scan it in-app (js/customer.js polls for this via
   SW.getActiveRevealForEvent). A manual-activation fallback and a
   physical-reward hand-off reminder are also here per BRD 4.2-C/4.2-H. */

(() => {
  const REVEAL_DURATION_MS = 90000;
  let revealTimerInterval = null;
  let currentReveal = null;

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function renderIcons() {
    qa("[data-icon]").forEach(el => {
      el.innerHTML = SW.icon(el.getAttribute("data-icon"));
      el.removeAttribute("data-icon");
    });
  }

  function toast(msg) {
    const el = q("#toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-show"), 2200);
  }

  // ---------------- reveal QR ----------------

  function initRevealPickers() {
    const eventSel = q("#reveal-event");
    eventSel.innerHTML = SW.EVENTS.slice().reverse().map(ev =>
      `<option value="${ev.id}"${ev.active ? " selected" : ""}>${ev.name}${ev.active ? " (Aktif)" : " — sudah selesai"}</option>`
    ).join("");

    const stampSel = q("#reveal-stamp");
    stampSel.innerHTML = SW.STAMPS.map(s => `<option value="${s.id}">Stamp ${s.id} — ${s.name}</option>`).join("");
  }

  function startReveal() {
    const eventId = q("#reveal-event").value;
    const stampId = Number(q("#reveal-stamp").value);
    const ev = SW.getEvent(eventId);
    if (!ev || !ev.active) {
      toast("Event ini sudah selesai — QR hanya bisa di-reveal untuk event aktif.");
      return;
    }
    currentReveal = SW.startReveal(eventId, stampId, REVEAL_DURATION_MS);
    showRevealQr(currentReveal);
    renderAll();
  }

  function showRevealQr(reveal) {
    q("#reveal-form").style.display = "none";
    q("#reveal-qr-box").style.display = "block";
    SW.drawFakeQr(q("#reveal-qr-canvas"), reveal.token, "#019872");
    tickRevealTimer(reveal);
  }

  function tickRevealTimer(reveal) {
    clearInterval(revealTimerInterval);
    const update = () => {
      const msLeft = Math.max(0, reveal.expiresAt - Date.now());
      const s = Math.ceil(msLeft / 1000);
      q("#reveal-timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      if (msLeft <= 0) {
        clearInterval(revealTimerInterval);
        hideRevealUI();
        toast("QR booth kedaluwarsa — reveal lagi jika masih dibutuhkan.");
        renderAll();
        return;
      }
      // stop early if a customer already claimed it (reveal removed from storage)
      if (!SW.loadReveals().some(r => r.id === reveal.id)) {
        clearInterval(revealTimerInterval);
        hideRevealUI();
        renderAll();
      }
    };
    update();
    revealTimerInterval = setInterval(update, 500);
  }

  function hideRevealUI() {
    clearInterval(revealTimerInterval);
    q("#reveal-form").style.display = "block";
    q("#reveal-qr-box").style.display = "none";
    currentReveal = null;
  }

  function initRevealHandlers() {
    q("#btn-reveal").addEventListener("click", startReveal);
    q("#btn-hide-reveal").addEventListener("click", () => {
      if (currentReveal) SW.cancelReveal(currentReveal.id);
      hideRevealUI();
      renderAll();
    });
  }

  // ---------------- active reveals list ----------------

  function renderPending() {
    const list = SW.loadReveals();
    q("#pending-count").textContent = list.length;
    q("#pending-empty").style.display = list.length ? "none" : "block";
    q("#pending-items").innerHTML = list.map(r => {
      const msLeft = Math.max(0, r.expiresAt - Date.now());
      const s = Math.ceil(msLeft / 1000);
      return `
      <div class="pending-item" data-reveal="${r.id}">
        <div class="pending-item__avatar">${SW.icon("scan")}</div>
        <div>
          <div class="pending-item__name">${r.eventName} — ${r.stampName}</div>
          <div class="pending-item__stamp">Kedaluwarsa dalam ${s}s</div>
        </div>
        <button class="btn btn--pill-sm pending-item__go" data-cancel-reveal="${r.id}">Batalkan</button>
      </div>`;
    }).join("");
    qa("[data-cancel-reveal]").forEach(btn => {
      btn.addEventListener("click", () => {
        SW.cancelReveal(btn.getAttribute("data-cancel-reveal"));
        if (currentReveal && currentReveal.id === btn.getAttribute("data-cancel-reveal")) hideRevealUI();
        renderAll();
      });
    });
  }

  // ---------------- manual fallback ----------------

  function renderManualPickers() {
    const users = SW.loadUsers();
    const gtidSel = q("#manual-gtid");
    const current = gtidSel.value;
    const entries = Object.values(users).sort((a, b) => b.joinedAt - a.joinedAt);
    gtidSel.innerHTML = entries.length
      ? entries.map(u => `<option value="${u.gtid}">${u.name} — ${u.gtid}</option>`).join("")
      : `<option value="">(belum ada customer terdaftar)</option>`;
    if (entries.some(u => u.gtid === current)) gtidSel.value = current;

    const eventSel = q("#manual-event");
    const eventCurrent = eventSel.value;
    eventSel.innerHTML = SW.EVENTS.slice().reverse().map(ev => `<option value="${ev.id}">${ev.name}${ev.active ? " (Aktif)" : ""}</option>`).join("");
    eventSel.value = eventCurrent || SW.getActiveEvent().id;

    const stampSel = q("#manual-stamp");
    const stampCurrent = stampSel.value;
    stampSel.innerHTML = SW.STAMPS.map(s => `<option value="${s.id}">Stamp ${s.id} — ${s.name}</option>`).join("");
    if (stampCurrent) stampSel.value = stampCurrent;

    updateHandoffNote();
  }

  function updateHandoffNote() {
    const stamp = SW.getStamp(Number(q("#manual-stamp").value));
    const note = q("#manual-handoff-note");
    if (stamp && stamp.reward.type === "physical") {
      note.style.display = "flex";
      note.textContent = `🎁 Reward fisik: ${stamp.reward.detail} (${stamp.reward.vendor}) — pastikan sudah diserahkan ke customer.`;
    } else {
      note.style.display = "none";
    }
  }

  function initManualHandlers() {
    q("#manual-stamp").addEventListener("change", updateHandoffNote);
    q("#btn-manual-activate").addEventListener("click", () => {
      const gtid = q("#manual-gtid").value;
      const eventId = q("#manual-event").value;
      const stampId = Number(q("#manual-stamp").value);
      if (!gtid) { toast("Belum ada customer terdaftar."); return; }
      SW.setStamp(gtid, eventId, stampId, true);
      const stamp = SW.getStamp(stampId);
      toast(stamp.reward.type === "physical"
        ? `Stamp diaktifkan — jangan lupa serahkan ${stamp.reward.detail}`
        : `Stamp ${stampId} diaktifkan untuk ${gtid}`);
      renderAll();
    });
  }

  // ---------------- log ----------------

  function renderLog() {
    const log = SW.loadLog();
    q("#log-empty").style.display = log.length ? "none" : "block";
    q("#log-items").innerHTML = log.map(l => `
      <div class="log-item"><b>${new Date(l.ts).toLocaleTimeString("id-ID")}</b>&nbsp; ${l.text}</div>
    `).join("");
  }

  function renderAll() {
    renderPending();
    renderManualPickers();
    renderLog();
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderIcons();
    initRevealPickers();
    initRevealHandlers();
    initManualHandlers();
    renderAll();
    setInterval(renderPending, 1000); // keep countdown/expiry fresh
    SW.onSync(renderAll);
  });
})();
