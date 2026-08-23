# Scanner — Splatoon match-event detection

Browser app (route `/scanner`, dev-only until promoted) that watches OBS
Virtual Camera footage, VoD files, or screenshots, detects Splatoon 3 UI
screens with OpenCV.js in a Web Worker, and parses them into events speaking
sendou.ink ids (`ModeShort`/`StageId`/weapon ids/`Ability`). Events aggregate
client-side into `ScannerMatch` objects (`core/scanner-match.ts`) — one
detected game per object, every field nullable — which feed `/ingest`
(features/scanner-ingest) and the `/vods/new` prefill. Imported from the
emberz repo; see `MIGRATION.md` there.

Deliberate convention exceptions (dev tool, ported wholesale): the UI is
English-only (no i18next), `tests/node-test-compat.ts` uses a default export
to stay a `node:test` drop-in, and the suites assert with `node:assert/strict`
rather than the repo-wide `expect`. Keep whichever file you touch on the
idiom it already uses — a half-migration would leave three idioms behind.

## Commands

```sh
pnpm test:scanner                       # golden-file suite over tests/fixtures/ (Vitest, Node)
pnpm test:unit:browser                  # includes tests/logic/ — the fixture-free half, see below
pnpm scanner:report                     # accuracy table + name character error rate across fixtures
pnpm scanner:fixtures [name-substring]  # run detectors over matching fixtures, verbose
pnpm scanner:replay <dir> <startT> <fps> # replay ffmpeg-extracted frames through the scheduler+detectors
pnpm scanner:scan-vod <video>           # VoD-tab scan as a CLI (ffmpeg): video in, events CSV out
pnpm scanner:status-audit <events.csv>  # diff the CSV's timeline vs scoreboard D/S, rank fixture candidates
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

- `core/` is pure (mats in, events/matches out) and runs in the worker, the
  Screenshot tab, and Node tests. No DOM/browser APIs; Node-only helpers live
  in `node/`. Pure data/type imports from `~/modules` and
  `~/features/build-analyzer/data` are fine — valibot and the app config graph
  are not (schemas live in `scanner-schemas.ts`; core only `import type`s
  the shapes).
- `core/match-builder.ts` turns a timeline into `ScannerMatch`es: a MapStart
  opens a match, a scoreboard closes one (claiming the last 8 min of deaths
  when the intro was missed), minimaps group per map by confirmed stage
  change and >5 min gap. An event belongs to at most one match; deaths
  reveal enemy builds (`ability-harvest.ts`). Partial matches are fine —
  scanner-ingest merges them server-side. Senders filter with
  `ingestSkipReasons`: private/unread lobby only, and no games a disconnect
  cut short (scoreless + counter left more time than the footage did, or
  replayed right after on the same map — the latter is a VoD-scan filter in
  practice since it only resolves after the fact).
- The route (`routes/scanner.tsx`) is SSR-guarded: the client tree loads via
  `React.lazy` after `useHydrated`; nothing from `core/worker/capture/store`
  may be imported at route-module top level.
- Eight detectors: `scoreboard` (results screen),
  `scoreboard-battle-log-replay` (replay-browser detail),
  `scoreboard-battle-log` (Recent Battles detail — same data sans replay
  code, panels stacked), `scoreboard-own` (personal results), `death`
  (respawn overlay), `map-start` (match intro), `minimap` (in-match overlay
  + casted 8-player spectator variant), `objective` (ranked counter overlay:
  counts, penalties, holder, match timer — a mode-discriminated union with
  only the SZ member so far). The objective parse also emits a second
  event type per read: `PlayerStatus`
  (`core/detectors/objective/player-status.ts`), per-player special/dead
  flags off the icon strip flanking the timer (three geometries named by
  which side sits at the packed pitch — `even`, `narrow-right`,
  `narrow-left` — that are pure geometry, never footage type: S3 POV
  footage draws both narrow arrangements too, so only the D-pad camera
  badges prove a broadcast, reported as the read's `cast: true | null`;
  broadcasts can hide the badges while keeping their geometry, so a
  badge-less frame scores the geometries on how decisively the bodies
  read and sticks with the established layout unless another wins
  clearly — the special-ready wash also pulses, so its dim trough is told
  apart from a splat by its pale body, and a narrow-layout ready read
  must also see a washed (ink-poor) body: pale backdrop or the lead
  banner leaking past an icon edge fakes the shoulder glow on the
  overhead map view's badge-less strip), with
  the same `time` value so the two reads pair downstream; its fixtures
  live under `tests/fixtures/player-status/`. Within a side the strip's
  slot order is the lobby seating, while the results scoreboard re-sorts
  each team per game (attested in the sendou-triton VoD: strip [Planetz,
  .52, Neo Splash, Snipewriter] vs rows [.52, Neo Splash, Snipewriter,
  Planetz], and the orders differ per game while the seating holds) — so
  every 5th counter read also samples a `StripWeapons` evidence event: a
  ranked weapon-icon match per alive slot (the squid plate's team ink is
  hue-knocked-out to flat grey first; splatted slots grey the render out
  and are skipped). Single reads rank the true weapon top-1 only about
  half the time; the builder aggregates them across the match — plus the
  minimap cards' parsed weapons, whose column order mirrors the strip
  seating (attested for the enemy column) — and takes the best-scoring of
  the 24 slot→row assignments against the scoreboard's weapons
  (`core/slot-row-assignment.ts`), falling back to as-drawn order on thin
  or tied evidence. The POV overlay's teammate diamond follows neither
  order and maps by card name instead. Strip-weapon fixtures live under
  `tests/fixtures/strip-weapons/`. The builder additionally
  flips sub-2s dead-flag runs flanked by dense opposite reads — a splat
  outlasts the respawn wait, so those are misread blips (background ink
  bleeding through a crossed-out icon) — and bridges sub-10s not-ready
  gaps between ready reads when no death inside the gap explains them (no
  special regains that fast, so the gap is the wash's dim pulse trough). Objective reads land on `ScannerMatch` as
  progress samples anchored to the game clock; broadcast replay wipes re-run
  an earlier moment with the counter intact, so the builder keeps only the
  dominant cluster of clock-zero projections (`t + time`) and drops replay
  reads outright (timerless reads follow their preceding anchored
  neighbor). A displayed count only ever
  ticks down, so the builder keeps each side's longest non-increasing score
  run and voids reads off it (surviving OCR blips chart as gaps, not dips). Each read also carries a
  per-side team ink color (`core/ink-color.ts` — the plate fill in
  control, the digit ink otherwise): casted footage keeps the specced
  player's team on the left plate, so the builder orients samples by ink
  hue and anchors them to `teams` order via the minimap sub-tile colors
  (casts never show a results screen). Reads grouping into a match
  whose detected mode is not SZ are lookalike misreads: the builder nulls
  that match's `objective` and callers discard the events
  (`invalidObjectiveEvents`; Live also stops collecting once a MapStart
  reveals a non-SZ mode). PlayerStatus reads follow the objective pipeline
  wholesale: same replay-wipe anchor, cast orientation inherited from the
  nearest counter read, nulled together on non-SZ matches, and rendered as
  per-player splat/special bands (`~/components/PlayerStatusTimeline.tsx`,
  shared with the match page) above the objective chart. Minimap reads
  feed the same samples: every card/row carries `dead` (respawn
  cross-out) and `specialReady` (special camo) flags, merged in timerless
  on the shared replay anchor — and mode-agnostic, so a known non-SZ
  match keeps its minimap-sourced samples while its counter/status
  misreads are voided. Parsing details
  are in each detector's module
  header; accuracy-critical matching internals in `core/glyphs.ts` and
  `core/detectors/scoreboard/weapons.ts` — read those before touching
  recognition code. Parse cost matters live (a stalled worker drops
  frames): a CJK splash-tag name once cost tens of seconds per death
  parse, which is why the death detector memoizes tag reads on a
  downscaled tag signature (same killer recurs pixel-identical) and
  `classifySegment` prescreens oversized eligibility lists at half scale
  — both tuned so `scanner:report` stays bit-identical.
- Scheduling (`core/detectors/scheduler.ts`): the per-session
  DetectorScheduler decides which detectors see a frame. Failing gates are
  re-checked every `searchIntervalS` (0.25s — produced VoDs cut screens to
  ~1s, and gates are ~ms-cheap); a passing gate drops to the dense refine
  cadence (`refineIntervalS` overrides for expensive parses). Suppression
  ends a refinement streak on parse-count stagnation AND ~3s elapsed (the
  floor spans entry animations), or immediately at `sufficientConfidence`
  (set just under each detector's measured clean-read floor); death adds
  `rearmCooldownS`. Battle-log/replay gates return a content `signature` so
  browsing distinct entries re-parses once per battle instead of dropping
  the gate. `checkIntervalS` hard-caps both phases; `attachFrame: false`
  keeps continuously-firing events from storing a frame PNG each. Frames no
  detector is due for skip canvas readback, and everything is counted in
  `core/detectors/telemetry.ts` — but only when the VoD tab is opened with
  `?telemetry=true` (nothing links there); otherwise the workers skip
  collection and the panel stays hidden. A match's objective reads render
  as one step-line timeline
  (`~/components/ObjectiveTimeline.tsx`, shared with the match page).
  The Live tab buffers frames sampled while the worker is busy; past the
  buffer limit the backlog is decimated toward even time-spacing
  (`worker/frame-queue.ts`) rather than truncated oldest-first, so a
  parse stall can no longer swallow a results screen whole (the exact
  failure that cost a live match its scoreboard on 2026-08-22).
- VoD scans (`components/VodPage.tsx`): on the WebCodecs path each worker
  demuxes + decodes its own contiguous slice (mediabunny in the worker — no
  frames cross the main thread). When the scheduler reports calm (no gate
  pass for a quiet period, no open match), the worker skims
  keyframe-to-keyframe (hop capped at 2.5s so short screens can't hide),
  snapping back to dense decode on any gate pass. The seek fallback drives
  one worker and widens its stride over calm footage the same way.
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
`toAbilityWithUnknown` narrows template ids back to sendou ids).
Scanner-specific sets — glyph atlases and the planner signature atlas — live
here under `public/scanner/v1/**` (override with `SCANNER_ASSETS_DIR`; the
version segment bumps on breaking atlas-format changes). xxx: the atlases are
in `public/` only while the feature is in development — move them to the
assets repo (and the worker back to the CDN base) later.

- Browser/worker: icons from `Config.staticAssetsUrl` at `img/**` (base URL
  rides the worker init message; the DO Space needs CORS for GET from
  sendou.ink + localhost); atlases same-origin from `/scanner/v1/**`. Local
  dev against fresh icon regens:
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

## Tests

`tests/*.test.ts` are the golden-file suites: they read frames from
`tests/fixtures/` and need game icons from a sibling `sendou-ink/assets`
checkout, so they run in their own Vitest project (`vitest.scanner.config.ts`)
and stay out of CI.

`tests/logic/*.test.ts` are pure logic over synthetic events — no images, no
assets checkout — so they belong to the `unit` project and do run in CI. Put
new tests there whenever they can be written without a frame.

## Fixtures

A test case is a directory `tests/fixtures/<detector>/<case-name>/` with
`frame.png|jpg` (raw capture, never re-encoded) and `expected.json` (partial
expectations, sendou ids; `stageLabel`/`weaponLabel` are informational for
the human corrector — tests compare only ids). Negative cases
(`{ "event": "none" }`) go in the shared `tests/fixtures/negative/`; every
detector's suite sweeps them. Every live misread should become a fixture —
the live app's "Save fixture" button exports the byte-exact analyzed frame
plus a prefilled `expected.json`. **Fixture ground-truth labels are
hand-corrected by the user (the Splatoon domain authority) — treat them as
definitive over any matcher output.** The dev-only Fixtures tab
(`/scanner?tab=fixtures`) renders every fixture's frame beside its
`expected.json` for that ground-truth review — player-status and
strip-weapons cases get per-slot icon crops with the expected label under
each icon, and Inspect re-analyzes any frame in the Screenshot tab. The `q`
param narrows by case-name substring (comma = OR) and lives in the URL, so
finished labeling work can be handed over as a reviewable link, e.g.
`/scanner?tab=fixtures&q=gauge-overlay,ready-trough`. Fixtures are committed as plain blobs
(no LFS for now); keep additions deliberate — fixture IO is isolated in
`node/fixtures.ts` if a retreat to LFS/an external corpus is needed.
