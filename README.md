# 🏎 Pit Wall: CBSE Class X race strategy

An F1-themed study tracker for the CBSE Class X board exams (Feb–Mar 2027). It shows how many
"laps" (days) are left, plans each day's study "stints", and turns **red** when the plan stops
fitting the hours available. Every number is recalculated the moment you log progress or change
a setting.

**No install, no build, no server code.** It's a static website: HTML, CSS and plain JavaScript modules.

## Run it on your computer

```bash
cd xplanner
python -m http.server 8000
# open http://localhost:8000
```
(Opening `index.html` by double-click won't work, because browsers block JS modules on `file://`.)

## Put it online (GitHub Pages, free)

1. Create a GitHub repo (e.g. `pitwall`) and push this folder (see `.gitignore`; personal files stay out).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)` → Save.
3. After about a minute it's live at `https://<username>.github.io/pitwall/`.
4. On the phone, open that link → browser menu → **Add to Home screen**. It now opens like an app and works offline.

## How it works

| F1 term | Meaning |
|---|---|
| Lights Out | first board paper (Maths, 17 Feb 2027) |
| Laps to go | days left |
| Stint | one study block (25–75 min) |
| Tyre: soft / medium / hard | chapter difficulty → default hours |
| Garage → Out-lap → Flying lap → 🏁 | not started → learning → practising → done |
| Delta | hours of margin (+) or deficit (−) against the plan |
| Box box | red alert: what to fix and by how much |
| DRS | extra stints/hours needed to close a gap |
| Safety Car | a changed day (sick, school exam, pre-board) set in Calendar |
| Parc Fermé | revision-only days before the first paper (default 21) |
| Purple day | personal best day |

**The maths** (`js/engine.js`, pure functions):
- *Work left* = for every board chapter, remaining learning hours (by status and logged time, never below 10% until done) + revision laps not yet done. After 5+ logged hours in a subject, its estimates calibrate to your real pace.
- *Feasibility* = earliest-deadline-first: everything due by each paper must fit in the hours before it, and all new chapters must fit before Parc Fermé. The worst ratio sets the flag: 🟩 ≤ 0.90 · 🟨 ≤ 1.05 · 🟥 above, or 2 weak days in a row, or a subject projected to finish after its paper.
- *Today's stints* = today's hours split across subjects by (work left ÷ hours until that paper) × weakness from the report card, then turned into concrete chapter blocks. During the exam window, everything goes to the next paper.

## Daily use

1. **Race Control** → do the stints → tap **Log** after each (or ⏱ Start stint and *Stop & log*).
2. When a chapter is finished, set status 🏁 in the log form. Later revisions: log type *Revise* and tick "count as revision lap".
3. **Sectors** → mark what school has already finished; edit hours/difficulty; add or remove chapters.
4. **Calendar** → tap a day for sick days, pre-boards, holidays.
5. **Strategy Wall** → weekday/weekend hours, Parc Fermé days, revision laps, report card marks, livery.
6. **Team Radio** → WhatsApp summary to parents; **back up weekly** (share the .json to Google Drive/WhatsApp).

## Your data

- Stored only in this browser (LocalStorage). Different phone/laptop = different data. Move it with **Team Radio → backup** then **Import** (Merge or Replace).
- Clearing browser data deletes it. That's why the app nags for a weekly backup.
- The repo contains **no personal data**: name and marks are entered on first run.

## Re-skin it

Edit **`css/theme.css`**: every colour/font is a variable there. Liveries (Strategy Wall) override the accent colour.

## For developers

```
index.html              shell + tab bar
css/theme.css           design tokens (safe to edit)
css/app.css             components
js/app.js               boot, router, event delegation, recompute loop
js/engine.js            plan maths: pure, no DOM
js/store.js             the only LocalStorage access; schemaVersion + migrate()
js/seed-syllabus.js     GENERATED from syllabus-2026-27.yaml
js/ui/*.js              one file per screen + log/share/notify sheets
sw.js, manifest.webmanifest, icons/   installable PWA, offline
tools/gen_seed.py       regenerate the seed: python tools/gen_seed.py (needs pyyaml)
tools/test-engine.mjs   node tools/test-engine.mjs  (engine + store tests)
tools/smoke.html        loads DEMO data into your browser (overwrites!) for testing
tools/clicktest.html    drives the UI in an iframe and prints PASS/FAIL
```
Changed the file list? Bump `VERSION` in `sw.js` so phones pick up the new version.

Syllabus source: CBSE Curriculum 2026-27 (cbseacademic.nic.in) and the date sheet of 06.11.2026.
Not affiliated with Formula 1 or CBSE.
