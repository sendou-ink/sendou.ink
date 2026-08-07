# Scanner — Splatoon match-event detection

Browser app (route `/scanner`, dev-only until promoted) that watches OBS
Virtual Camera footage, VoD files, or screenshots, detects Splatoon 3 UI
screens with OpenCV.js in a Web Worker, and parses them into events speaking
sendou.ink ids (`ModeShort`/`StageId`/weapon ids/`Ability`). Events are
aggregated client-side into `ScannerMatch` objects (`core/scanner-match.ts`)
— one detected game with everything the scan could read — which feed
`/ingest` (features/scanner-ingest) and the `/vods/new` prefill. Imported
from the emberz repo; see `MIGRATION.md` there.

## Commands

```sh
pnpm test:scanner                       # golden-file suite over tests/fixtures/ (Vitest, Node)
pnpm scanner:report                     # accuracy table + name character error rate across fixtures
pnpm scanner:fixtures [name-substring]  # run detectors over matching fixtures, verbose
pnpm scanner:replay <dir> <startT> <fps> # replay ffmpeg-extracted frames through the scheduler+detectors
pnpm scanner:bootstrap-atlas            # harvest labeled fixture crops into the glyph atlases
pnpm scanner:build-glyph-atlas          # add the font-rendered charset (fonts required, see below)
pnpm scanner:build-localized-entries    # regen localized closed sets from ../splat3
pnpm scanner:build-planner-signatures   # regen the minimap stage-ID atlas from the assets repo
```

Scanner scripts run through `vite-node -c scripts/scanner/vite-node.config.ts`:
the root vite config pre-bundles `@techstark/opencv-js` for the browser worker
and vite-node must not consume that prebundle. The package is pnpm-patched
(`patches/`) to wrap its thenable CJS export as `{ cvReadyPromise }`,
unwrapped in `core/cv.ts`.

## Architecture

```mermaid
sequenceDiagram
  participant Cap as capture (sampler / vod-frames)
  participant W as analyzer.worker (OpenCV)
  participant TL as TimelineBuilder
  participant MB as match-builder
  participant UI as Live/VoD tab
  participant ING as /ingest (scanner-ingest)
  participant DB as IngestedMatch / IngestedMatchLink
  Cap->>W: frame + t (live/screenshot/seek) — VoD: worker decodes its own slice
  W->>W: scheduler dueDetectors() → gate() → parse()
  W-->>TL: DetectedEvents
  TL-->>UI: deduped timeline (IndexedDB on Live)
  UI->>MB: buildScannerMatches(events)
  MB-->>UI: ScannerMatch[] + source events
  UI->>ING: POST { matches } (Live: on match close / scan end, VoD: whole scan)
  ING->>ING: resolve context (current tournament/SendouQ activity, casts via staff roles, else content sequence ≥2)
  ING->>DB: merge-store IngestedMatch (matchHash, isSameMatch + merge, context hints)
  ING->>DB: link matches to game results → IngestedMatchLink (POV weapon → ReportedWeapon; scoreboards derived at read time)
  Note over UI: VoD "Add VoD": ScannerMatch → slim prefill param → /vods/new
```

- `core/` is pure (mats in, events/matches out) and runs in three contexts:
  the worker, the `/scanner` Screenshot tab, and Node tests. No DOM/browser
  APIs; Node-only helpers (image IO, fixture loading) live in `node/`. Pure
  data/type imports from `~/modules` and `~/features/build-analyzer/data` are
  fine — zod and the app config graph are not (schemas live in
  `scanner-schemas.ts`, consumed by `features/scanner-ingest`; core only
  `import type`s the shapes).
- `core/match-builder.ts` turns a timeline into `ScannerMatch`es: a MapStart
  opens a match, a scoreboard closes one (claiming the last 8 min of deaths
  when the intro was missed), minimaps group per map by confirmed stage
  change and >5 min gap. An event belongs to at most one match. Deaths
  reveal enemy builds (`ability-harvest.ts`).
  Every field is nullable — partial matches are fine, scanner-ingest merges
  them server-side. Senders filter with `ingestSkipReasons`: private/unread
  lobby only, and no games a disconnect cut short (a scoreless match whose
  last counter read left the game more time than the footage did, or that
  was replayed right after on the same map — the latter only ever resolves
  after the fact, so it is a VoD-scan filter in practice).
- The route (`routes/scanner.tsx`) is SSR-guarded: everything below it
  assumes a browser, so the client tree loads via `React.lazy` after
  `useHydrated`. Nothing from `core/worker/capture/store` may be imported at
  route-module top level.
- Eight detectors: `scoreboard` (results screen),
  `scoreboard-battle-log-replay` (replay-browser detail),
  `scoreboard-battle-log` (Recent Battles detail — the same data as the
  replay screen sans the replay code, panels stacked instead of
  side by side), `scoreboard-own` (personal results), `death`
  (respawn overlay), `map-start` (match intro), `minimap` (in-match overlay,
  plus the casted 8-player spectator map as a gated variant), `objective`
  (the ranked in-match counter overlay: per-team counts, penalties, who
  holds the objective, and the match timer — a discriminated union on mode
  with only the SZ member so far). A match's reads land on `ScannerMatch`
  as `objective` progress samples in `teams` order, each anchored to the
  game clock so consumers can graph progress and spot capture gaps. Reads
  that group into a match whose detected mode is not SZ are misreads of a
  lookalike overlay (other modes' counters pass the gate): the builder
  leaves that match's `objective` null and callers discard the events
  (`invalidObjectiveEvents` — Live deletes them from the store, VoD before
  persisting/on load; Live also stops collecting once a MapStart reveals a
  non-SZ mode). Parsing details are in each detector's module header;
  accuracy-critical matching internals in `core/glyphs.ts` and
  `core/detectors/scoreboard/weapons.ts` — read those before touching
  recognition code.
- Scheduling (`core/detectors/scheduler.ts`): per scan session the
  DetectorScheduler decides which detectors look at a frame. While a gate
  keeps failing its detector is checked every `searchIntervalS` (default
  0.25s — produced/casted VoDs cut screens to ~1s with transition flicker
  inside, so search cadence must not assume raw-gameplay screen lifetimes;
  gates are ~ms-cheap, so this costs little); once the gate passes it
  drops to the dense refine cadence for best-read refinement (detectors
  with expensive parses override it via `refineIntervalS` — death 0.5s,
  minimap 0.4s). Suppression ends a refinement streak
  once it stagnates by parse count (default 6; per-detector
  `maxStagnantParses` — death 3) AND elapsed time (~3s — the time floor
  keeps a dense cadence from suppressing during a screen's entry animation
  before it is readable) or immediately at `sufficientConfidence`, which
  sits just under each detector's measured clean-read confidence floor
  (fixture suite + confirmed scan events); death
  adds `rearmCooldownS` (safe because it fits inside the Death timeline
  merge window). Battle-log and replay gates also return a content
  `signature` (grid-cell means over the header/name/code ROIs) — browsing
  distinct entries never drops those gates, so the scheduler instead resets
  the streak when the signature moves, one parse per distinct battle. `checkIntervalS` (objective: 1s)
  still hard-caps both phases and exempts from suppression; a detector can
  also declare `attachFrame: false` to keep continuously-firing events from
  storing a frame PNG each. In the UI a match's objective reads render as
  one step-line timeline (`~/components/ObjectiveTimeline.tsx`, shared with
  the match page's stats section) instead of
  per-event cards. Frames no detector is due for skip canvas readback
  entirely, and everything is counted in `core/detectors/telemetry.ts`
  (surfaced in the VoD tab's telemetry panel).
- VoD scans (`components/VodPage.tsx`): on the WebCodecs path the file's
  duration is split into one contiguous slice per worker and each worker
  demuxes + decodes its slice itself (mediabunny in the worker — no frames
  cross the main thread). When the scheduler reports calm (no gate pass for
  a quiet period, no open match — a confident map-start pins the scan
  active until a scoreboard or timeout), the worker stops sequential decode
  and skims keyframe-to-keyframe (single-frame decodes, hop capped at 2.5s
  so short screens can't hide), snapping back to dense decode on any gate
  pass. Chunks start dense, so slice boundaries are covered. The seek
  fallback drives one worker and widens its stride over calm footage the
  same way.
- Recognition is language-agnostic: OCR output snaps against every game
  language at once (`core/localized-entries.ts`, generated) and events carry
  sendou ids. English display names come from `components/labels.ts`.
- ROI coordinates live in each detector's `rois.ts`, in canonical 1920×1080
  space; every frame is normalized to that size first.
- New event types implement `Detector` (`core/detectors/types.ts`): a cheap
  `gate(mat)` at sample rate plus `parse(mat, t)` when the gate fires.
  Register in `core/detectors/registry.ts`.

## Assets (CDN) and fonts

Weapon/ability/special/sub template sources are the site's shared game icons
in the **sendou-ink/assets repo** under `assets/img/**` (`.avif`; ids from
`~/modules/in-game-lists`, plus the scanner-only `UNKNOWN` ability badge —
`toAbilityWithUnknown` narrows template ids back to sendou ids). Scanner-specific
sets — glyph atlases and the planner signature atlas — live here under
`public/scanner/v1/**` (override with `SCANNER_ASSETS_DIR`; the version
segment bumps on breaking atlas-format changes). xxx: the atlases are in
`public/` only while the feature is in development — move them to the assets
repo (and the worker back to the CDN base) later.

- Browser/worker: icons from `Config.staticAssetsUrl` at `img/**` (base URL
  rides the worker init message; the DO Space needs CORS for GET from
  sendou.ink + localhost since the worker `fetch()`es cross-origin); atlases
  same-origin from `/scanner/v1/**`. Local dev against fresh icon regens:
  `npx serve /Users/kalle/Developer/assets/assets -l 9100 --cors` and
  `VITE_STATIC_ASSETS_URL=http://localhost:9100` in `.env`.
- Node (tests/scripts): atlases from `public/scanner/v1`, icons from the
  `../assets` checkout, never the CDN. AVIF decodes through `sharp`
  (`node/image-io.ts`) — `@napi-rs/canvas` mis-decodes AVIF partial-alpha.
- Atlas regens overwrite `public/scanner/v1` in place and ship with the app
  build.

Fonts are proprietary and gitignored: `BlitzMain.otf`, `BlitzBold.otf`,
`FOT-RowdyStd-EB.otf`, `FOT-KurokaneStd-EB.otf` in `assets/fonts/` (repo
root; from the splatoon3-fonts repo). Atlas builders fail loudly without
them. Names and row digits use BlitzMain; team totals BlitzBold; the replay
code line and VICTORY/DEFEAT tags FOT-RowdyStd-EB; the JP death message mixes
condensed Kurokane and Rowdy (`death-weapon-ja`). Regeneration order:
`scanner:bootstrap-atlas` (fixture crops win via tie-break) →
`scanner:build-glyph-atlas`; localized sets via
`scanner:build-localized-entries` (expects a splat3 checkout at `../splat3`)
then the atlas rebuild; planner atlas via `scanner:build-planner-signatures`
(reads the assets repo's `assets/planner-maps/`, MINI variant).

## Fixtures

A test case is a directory `tests/fixtures/<detector>/<case-name>/` with
`frame.png|jpg` (raw capture, never re-encoded) and `expected.json` (partial
expectations, sendou ids; informational `stageLabel`/`weaponLabel` fields
help the human corrector — tests compare only ids). Negative cases
(`{ "event": "none" }`) go in the shared `tests/fixtures/negative/`; every
detector's suite sweeps them. Every live misread should become a fixture —
the live app's "Save fixture" button exports the byte-exact analyzed frame
plus a prefilled `expected.json`. **Fixture ground-truth labels are
hand-corrected by the user (the Splatoon domain authority) — treat them as
definitive over any matcher output.** Fixtures are committed as plain blobs
(no LFS for now); keep additions deliberate — fixture IO is isolated in
`node/fixtures.ts` if a retreat to LFS/an external corpus is needed.
