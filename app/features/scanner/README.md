# Scanner — Splatoon match-event detection

Browser app (route `/scanner`, dev-only until promoted) that watches OBS Virtual
Camera footage, VoD files, or screenshots, detects Splatoon 3 UI screens with
OpenCV.js in a Web Worker, parses them into events speaking sendou.ink ids
(`ModeShort`/`StageId`/weapon ids/`Ability`), records them to IndexedDB, and
feeds them to `/ingest` and the `/vods/new` prefill. Imported wholesale from
the emberz repo (kept read-only for archaeology); see `MIGRATION.md` there.

## Commands

```sh
pnpm test:scanner                       # golden-file suite over tests/fixtures/ (Vitest, Node)
pnpm scanner:report                     # accuracy table + name character error rate across fixtures
pnpm scanner:fixtures [name-substring]  # run detectors over matching fixtures, verbose
pnpm scanner:bootstrap-atlas            # harvest labeled fixture crops into the glyph atlases
pnpm scanner:build-glyph-atlas          # add the font-rendered charset (fonts required, see below)
pnpm scanner:build-localized-entries    # regen localized closed sets from ../splat3
pnpm scanner:build-planner-signatures   # regen the minimap stage-ID atlas from the assets repo
```

The scanner scripts run through `vite-node -c scripts/scanner/vite-node.config.ts` — the
root vite config pre-bundles `@techstark/opencv-js` for the browser worker, and
vite-node must not consume that prebundle (it crashes on `__dirname` in Node).
The package itself is pnpm-patched (`patches/`): its CJS export is the
emscripten ready-promise, and a thenable `module.exports` breaks vite-node's
CJS interop; the patch wraps it as `{ cvReadyPromise }`, unwrapped in
`core/cv.ts`.

## Architecture

```
MediaStream → capture/sampler (rVFC @2fps, ImageBitmap out)          [Live tab]
video file  → capture/vod-frames (WebCodecs decode, seek fallback)   [VoD tab]
    → worker/analyzer.worker (OpenCV.js WASM lives here)
        core/detectors/*  gate(mat) → parse(mat) → events
    → core/timeline (dedupe within 30s window, keep highest confidence)
    → store/events (IndexedDB) + components/ live feed
```

- `core/` is pure (mats in, events out) and must stay runnable in three
  contexts: the worker, the `/scanner` Screenshot tab, and Node tests. Keep
  DOM/browser APIs out of it; Node-only helpers (image IO, fixture loading)
  live in `node/`. Importing pure data/type modules from `~/modules` and
  `~/features/build-analyzer/data` is fine — zod and the app config graph are
  not (schemas live in `scanner-schemas.ts`, consumed by `features/ingest`;
  detectors only `import type` the shapes).
- The route (`routes/scanner.tsx`) is SSR-guarded: everything below it assumes a
  browser (worker, IndexedDB, WebCodecs, getUserMedia), so the client tree
  loads via `React.lazy` after `useHydrated`. Nothing from
  `core/worker/capture/store` may be imported at route-module top level.
- Six detectors: `scoreboard` (results screen), `scoreboard-replay`
  (replay-browser detail screen), `scoreboard-own` (personal results screen),
  `death` (respawn overlay), `map-start` (match-intro splash), `minimap`
  (in-match map overlay, plus the casted 8-player spectator map screen as a
  gated variant). Detector-specific parsing details are documented in each
  detector's module header; accuracy-critical matching internals (background
  masking, ink-coverage penalty, wide-segment splitting) in the module headers
  of `core/glyphs.ts` and `core/detectors/scoreboard/weapons.ts` — read those
  before touching recognition code.
- Ingestion is language-agnostic: OCR output snaps against every game language
  at once (`core/localized-entries.ts`, generated) and events always carry the
  sendou id. English display names for the UI come from `components/labels.ts`.
- ROI coordinates are in each detector's `rois.ts`, in canonical 1920×1080
  space; every input frame is normalized to that size first.
- New event types implement `Detector` (`core/detectors/types.ts`): a cheap
  `gate(mat)` at sample rate plus `parse(mat, t)` when the gate fires.
  Register in `core/detectors/registry.ts`. Event data shapes are pinned to
  `scanner-schemas.ts` by compile-time asserts — extend both together.

## Assets (CDN) and fonts

Weapon/ability/special/sub template sources are the site's shared game
icons in the **sendou-ink/assets repo** under `assets/img/**` (`.avif`; ids
come from `~/modules/in-game-lists`, plus the scanner-only `UNKNOWN` ability
badge — `toScannerAbility` narrows template ids back to sendou ids). The
scanner-specific sets — glyph atlases and the planner signature atlas — live in
this repo under `public/scanner/v1/**` (override with `SCANNER_ASSETS_DIR`; the
version segment bumps on breaking atlas-format changes). xxx: the atlases
are in `public/` only while the feature is in development — move them to
the assets repo (and the worker back to the CDN base) later:

- Browser/worker: icons fetched from `Config.staticAssetsUrl` at `img/**`
  (the base URL rides the worker init message; the DO Space needs CORS —
  GET, sendou.ink + localhost origins — because the worker `fetch()`es
  cross-origin, plain `<img>` consumers don't); atlases fetched same-origin
  from `/scanner/v1/**`. For local dev against fresh icon regens, serve the
  checkout with CORS —
  `npx serve /Users/kalle/Developer/assets/assets -l 9100 --cors`
  — and set `VITE_STATIC_ASSETS_URL=http://localhost:9100` in `.env`.
- Node (tests/scripts): atlases from `public/scanner/v1`, icons from the
  `../assets` checkout directly, never the CDN. AVIF icons decode through
  `sharp` (`node/image-io.ts`) — `@napi-rs/canvas` mis-decodes AVIF
  partial-alpha pixels.
- Atlas regens overwrite `public/scanner/v1` in place and ship with the app
  build; breaking format changes bump `v1`.

Fonts are proprietary and gitignored: `BlitzMain.otf`, `BlitzBold.otf`,
`FOT-RowdyStd-EB.otf`, `FOT-KurokaneStd-EB.otf` in `assets/fonts/` (repo
root; from the splatoon3-fonts repo). Atlas builders fail loudly without
them. Names and row digits use BlitzMain; team totals use BlitzBold; the
replay code line and VICTORY/DEFEAT tags use FOT-RowdyStd-EB; the JP death
message mixes condensed Kurokane and Rowdy (`death-weapon-ja`). Regeneration
order: `scanner:bootstrap-atlas` (fixture crops win via tie-break) →
`scanner:build-glyph-atlas`; localized sets via `scanner:build-localized-entries`
(expects a splat3 checkout at `../splat3`) then the atlas rebuild; planner
atlas via `scanner:build-planner-signatures` (reads the assets repo's
`assets/planner-maps/`, MINI variant).

## Fixtures are the workflow

A test case is a directory `tests/fixtures/<detector>/<case-name>/` with
`frame.png|jpg` (raw capture, never re-encoded) and `expected.json` (partial
expectations, sendou ids; informational `stageLabel`/`weaponLabel` fields help
the human corrector — tests compare only ids). Negative cases
(`{ "event": "none" }`) go in the shared `tests/fixtures/negative/`; every
detector's suite sweeps them. Every live misread should become a fixture —
the live app's "Save fixture" button exports the byte-exact analyzed frame
plus a prefilled `expected.json`. **Fixture ground-truth labels are
hand-corrected by the user (the Splatoon domain authority) — treat them as
definitive over any matcher output.** Fixtures are committed as plain blobs
(deliberately no LFS for now) — keep additions deliberate; the retreat plan
is LFS for future fixtures or an external corpus (fixture IO is isolated in
`node/fixtures.ts`).

## Gotchas

- @techstark/opencv-js 5.0.0-release.1: `.data` and `.clone()` are broken on
  ROI views — always `view.copyTo(freshMat)` before pixel access. Views are
  fine as inputs to cv calls.
- `matchTemplate` silently skips templates larger than the ROI — a weapon ROI
  only competes against icon templates that fit its height. The minimap's
  template sets are built with `cropToArt` (alpha-bbox-trimmed) or dark-art
  weapons would be unmatchable there.
- BlitzMain renders `I`/`l`/`|`/`1` as identical bars; `parseName` resolves
  every bar by context, not pixels. Same for `ー`/`-`.
- Scoped vs unscoped charger icons are pixel-indistinguishable; near ties
  resolve to unscoped (`SCOPED_TWINS`) and are flagged `twinAmbiguous`.
  Near-tied weapons whose kits differ resolve via the row's special icon
  (`specials.ts`) or the minimap sub tile (`subResolved`); kits derive
  directly from `~/features/build-analyzer/data/weapon-params.ts`.
- Header parsing OCRs the whole lobby/mode/stage line and snaps it to the
  localized combos from `core/localized.ts` — new stages get a `StageId` in
  `~/modules/in-game-lists` and the localized sets + atlases regenerate;
  nothing is added to the OCR itself.
- Death events merge within an 8s timeline window, minimap 5s (see
  `mergeWindowByType`); Scoreboard/ScoreboardReplay events carry a content
  guard (`core/timeline/same-scoreboard.ts`).
- The minimap stage ID (`core/detectors/minimap/stage.ts`) matches an
  ink-invariant structural signature against the planner atlas; **stage**
  separates cleanly, **mode** does not (the atlas keeps five renders per
  stage only to match whichever mode is on screen). The casted spectator map
  screen is a gated minimap *variant* with its own card grid. The minimap
  cannot read the mode: VoD matches without a MapStart/Scoreboard default to
  SZ, flagged `modeAssumed`.
- A static screen would re-run expensive parses every sampled frame:
  `ParseSuppressor` skips `parse()` once a gate keeps passing without
  confidence improving. The Screenshot tab inits its worker with
  `suppressSteadyFrames: false` — one-shot re-analyses must always parse.
