# SpeedPassport — SpeedApp gamification demo

A front-end build of **SpeedPassport**, the stamp-collection / mission
loyalty feature described in the BRD *"SpeedApp Gamification for Event"*
(PT. Speedwork Solusi Utama, SSU-IT-BRD v1.0), styled and componentised
from the real Figma design handoff (`SpeedPassport - Handoff.fig` →
`design_handoff_speedpassport/`), including the real stamp-badge artwork.

- `index.html` — the customer app: login, home (SpeedApp menu grid +
  the "Progress stamp" entry widget), the SpeedPassport board (per-event
  stamp grid + mission list), the in-app QR scanner, Area, Gallery, and
  the SW.ID tab.
- `staff.html` — the PIC/booth console: reveal the booth's QR only after
  verifying the activity, a manual-activation fallback, and a physical
  reward hand-off reminder.
- `css/style.css` — design tokens transcribed from the Figma handoff
  (`components/fig-tokens.css` + the handoff README's colour/type/radius
  tables) — brand green `#019872`/`#00AE81`/`#007C5F`, Albert Sans +
  Lexend typography, the exact spacing/radius scale.
- `js/app.js` — shared data model, the 9 SpeedPassport missions (with
  the real badge art and reward metadata), geofencing, and the
  booth-QR-reveal mechanism.
- `js/customer.js`, `js/staff.js` — per-page UI logic.
- `assets/stamps/` — the 9 real stamp badge illustrations, extracted
  directly from the Figma handoff's asset bundle (not redrawn).

## Design source

Two source documents drove this build, in order:

1. **BRD "SpeedApp Gamification for Event" (SSU-IT-BRD v1.0)** — the
   business requirements. Its most consequential requirement: the QR
   flow is *reversed* from the earlier GT Passport concept. The booth
   holds a static QR (hidden by PIC, revealed only after they verify the
   activity), and the **customer scans it in-app**, with a geofence
   check as an added safeguard (see BRD §4.2, BR-01–BR-06).
2. **The Figma handoff** (`design_handoff_speedpassport/`) — real
   colours, type, spacing, copy (Indonesian), and the actual stamp-badge
   illustrations for the homepage "Progress stamp" widget, the
   SpeedPassport board, the mission list, and the award modal. Where
   this file and an earlier assumption disagreed, the Figma file won.

## Running it

No build step or server-side code — just open `index.html` (and, in a
second tab, `staff.html`) in a browser. For the cross-tab live sync to
work they need to be served from the same origin, e.g.:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/index.html and http://localhost:8080/staff.html
```

Pushes to `main` auto-deploy to GitHub Pages via
`.github/workflows/deploy-pages.yml`.

## How the demo loop works (active event: IMOS 2026)

1. On `index.html`, agree to the terms and "Sign in with Google" (a
   simulated sign-in — it just asks for a name and creates a local
   profile with a generated `SW.ID`).
2. Open the **Passport** tab (always opens the active event) and either
   tap **"Scan QR di Booth"**, or tap a stamp then **"Scan QR di
   Booth"** from its detail sheet.
3. The scanner sheet checks your location against the event's
   configured booth coordinate (real `navigator.geolocation`, a real
   haversine-distance check against `SW.EVENTS[…].boothLocation`) and
   shows a live camera preview.
4. On `staff.html`, pick the event + stamp/activity the customer just
   completed and press **"Reveal QR ke Customer"**. The QR is now
   "live" for 90 seconds.
5. Back on `index.html`, the scanner (polling for the active reveal)
   picks it up within ~1 second, claims the stamp, and shows the
   stamp-awarded modal with the next mission — no page reload needed.
   If the stamp's reward is physical, `staff.html` reminds the PIC to
   hand over the merchandise.

## Multiple events, one passport

The passport is shared across every offline event Speedwork runs, not
just one (BRD BR-01/BR-02). `SW.EVENTS` in `js/app.js` lists them
(oldest first) — GIIAS 2026 and PRJ 2026 as history, IMOS 2026 as the
one `active: true` event with a live booth/geofence. A new demo account
is seeded with GIIAS fully completed and PRJ mostly completed. From
inside any passport, "Ganti Event" opens a switcher. A non-active
(past) event is read-only — desaturated board, a red "Event Selesai"
ribbon, no scan button.

## What's simplified (this is a prototype, not production)

- **No backend, no real Google OAuth, no real OTP/email flow.**
  Everything lives in `localStorage` on the current browser, synced
  across tabs with the `storage` event + `BroadcastChannel`. Clearing
  site data resets the demo. The BRD's mandatory-email + OTP
  registration requirement (§4.1) is a backend-dependent prerequisite
  not built here.
- **The QR codes are visual only.** Deterministically generated from a
  token string with real finder-pattern corners so they *look*
  scannable, but they're not a standards-compliant QR and can't be
  decoded by a real scanner — there was no network access available to
  vendor a QR encode/decode library for this build. The scanner's
  camera preview is real (`getUserMedia`); "detecting" a QR is
  simulated by polling the shared local reveal record, not real
  computer vision.
- **Geofencing is real geolocation + real distance math**, but against
  one hardcoded sample coordinate per event (`boothLocation` in
  `SW.EVENTS`), not a live admin-configured booth radius.
- **Reward/vendor data (BR-03/BR-04) is hardcoded per stamp** in
  `SW.STAMPS`, not pulled from a vendor database. Digital rewards say
  they credit SpeedPoint but don't touch a real wallet.
- **No Admin Dashboard yet** (BRD §4.3 / BR-05) — event/stamp/vendor
  configuration and CSV export (BR-06) aren't built. Today, adding the
  next event means editing `SW.EVENTS` directly and flipping which one
  is `active`.
- **Home only shows the SpeedPassport-relevant slice of SpeedApp**
  (menu grid + the progress-stamp widget) — the full e-commerce
  homepage from the Figma handoff (promo carousel, vehicle
  recommendations, best sellers, brand picks, nearby workshops,
  Speedbuzz feed) is out of scope for this gamification-focused build.
- **Area / Gallery data is sample content**, not real branch listings
  or media.
