# Scanner — Splatoon match-event detection

Browser app (route `/scanner`, linked from the Tools menu) that watches a
capture card or OBS Virtual Camera while you play, or scans VoD files,
detects Splatoon 3 UI screens with OpenCV.js in a Web Worker, and parses them
into events speaking sendou.ink ids (`ModeShort`/`StageId`/weapon ids/`Ability`).
Events aggregate client-side into `ScannerMatch` objects
(`core/scanner-match.ts`) — one detected game per object, every field
nullable — which feed `/ingest` (features/scanner-ingest), the `/vods/new`
prefill, the match cards and the clip cutter. Imported from the emberz repo;
see `MIGRATION.md` there.

Deliberate convention exceptions (ported wholesale): the UI is English-only
(no i18next; the public release should flip that), `tests/node-test-compat.ts`
uses a default export to stay a `node:test` drop-in, and the suites assert
with `node:assert/strict` rather than the repo-wide `expect`. Keep whichever
file you touch on the idiom it already uses — a half-migration would leave
three idioms behind.

## Product shape

Anyone can capture, scan files and get clips locally; only uploading needs a
login (`components/upload.ts` mirrors the root loader's user for the
controllers). The landing (`components/LandingView.tsx`) is two entry cards
(Live / File), the clip history strip and the sessions list; everything else
is one component, `components/SessionView.tsx`, rendered identically for the
running capture (`LiveView`), a past session (`PastSessionView`) and a
scanned VoD (`VodView`): header, clip strip, then match cards
(`components/MatchCard.tsx`) newest first. Views are picked by the `view`
search param (`scanner-search-params.ts`: `live`, `session&id=`,
`vod&name=`, `clips`, `debug` and the dev-only `fixtures`). Nothing links to
the `debug` screenshot view: dropping an image on the landing's File card
opens it, for anyone, through the same handoff Inspect uses.

- **Controllers are module singletons**, not view state: the capture
  (`components/live-session.ts`) and a running VoD scan
  (`components/vod-scan.ts`) are mounted above the view switch, so moving
  between views never stops them; a capture runs until Stop (even off the
  page), a scan until it finishes or the scanner page is left.
  Views subscribe through `useSyncExternalStore` hooks, as they do to the
  event feed (`components/events-feed.ts`, sessions built once per refresh),
  the clip list (`clips-feed.ts`), the VoD list (`vods-feed.ts`) and the
  localStorage settings (`settings.ts`: source, upload toggle, clip toggle).
- **Sessions** are client-only and derived at render (`core/sessions.ts`):
  live events ordered by `detectedAt`, split wherever a gap of ≥ 2 h opens,
  keyed by the first event's `detectedAt` (the URL id). A VoD is its own
  session keyed by file name. Live `t` is wall-clock seconds (`Date.now()`)
  so events from different page loads share one timeline; the ring buffer
  stamps footage the same way.
- **Retention** (`store/events.ts`, on a throttled pass at every save):
  whole sessions older than 30 days or beyond the newest 20 go. Full-res
  frames (and the thumbnails made from them) are only captured in debug
  mode — the worker skips the PNG encode otherwise (`attachFrames`) — and
  are bounded by 72 h and `MAX_FRAMES`, the event staying with
  `hasFrame: false`. Clips have their own cap and outlive session deletion.
- **Upload** is on by default when logged in (settings toggle, persisted).
  Live: a scoreboard closes its match and sends it, a 15 s tick retries
  unlinked matches on a backoff (`sendou-ingest.ts`) and flushes closed
  matches whose send was skipped; Stop sends what is left. VoD: the whole
  scan sends once saved. Both write per-event send statuses to their own
  store (`updateEventsSend` takes the store), so the cards' upload status
  button (`UploadStatus.tsx`) and its Retry/Upload are one code path.
- **CSV** is a normal feature: `⇩ CSV` in every session header offers
  `Matches` (`core/csv/matches.ts`, one row per game, the rows the cards
  render) and `Raw detections` (`core/csv/events.ts`, one row per event).
  Column names stay English keys.
- **Debug gate** (`use-debug.ts`: DEV/ADMIN role or `?debug=true`, which
  Settings → Debug → `Enable debug` sets):
  `Save frame as fixture` (Settings → Debug, live only), `?telemetry=true`,
  and the `Raw detections` disclosure inside a match card (the per-event
  cards with Inspect). The screenshot view (`ScreenshotPage.tsx`) is not
  gated; the fixtures view is dev-only.

## Clips

Clips are real video with audio, cut in the browser. `core/clips/scoring.ts`
is the pure, swappable scorer: only the POV player's own kills feed it
(`ScannerMatch.kills`, off the kill feed); a streak is consecutive kills with
no POV death between them and no pause over `STREAK_MAX_GAP_S`, cut where the
clip would outgrow `MAX_CLIP_SECONDS`; `MIN_KILLS` (4) makes it a window,
scored `kills² + kills / span`. Both controllers run the same
`scoreWindows(match, deaths)` → cut → `store/clips.ts` path:

- One capture per browser profile: `startCapture` holds a Web Lock
  (`CAPTURE_LOCK`) for its lifetime, so a second tab gets an error instead
  of a second pipeline writing every game twice (two samplers on one store
  double each event, and the repeated scoreboard opens a duplicate match).
- **Live** (`capture/ring-buffer.ts` + `ring-buffer.worker.ts`): the
  stream's tracks become `MediaStreamTrackProcessor` streams, transferred to
  a worker so a busy page never costs the footage a frame (on the main
  thread ~12% of a 60 fps track was lost to the one-frame processor
  buffer). There the video runs through a `VideoEncoder` (hardware H.264,
  ~16 Mbps, keyframe every 2 s) into a ring of GOPs holding the last
  `RING_BUFFER_SECONDS`; the audio through an `AudioEncoder` (AAC, else
  Opus) into the same ring. `openCapture` asks for 60 fps explicitly, as
  Chromium's default of 30 would halve a capture card. Packets carry the
  wall-clock time their frame was captured (noted at encoder input, claimed
  at output, so encoder latency never shifts audio against video): video by
  frame timestamp, audio by sample position (`SampleClock`), because audio
  timestamps drift against the sample count on some sources (a display
  capture, an element's `captureStream`) while the AAC encoder counts
  samples — matching by timestamp pushed later packets into the future and
  a cut lost its second half of audio. In the MP4 the audio runs on by
  sample count from its first packet and only jumps forward on a delivery
  gap over `AUDIO_RESYNC_S`. The remaining constant offset between a
  capture card's picture and another path's sound (desktop audio, a
  loopback device) is the `audioOffsetMs` setting, applied at cut time.
  The audio input is watched for signal: a device that opens but sends
  silence, and an encoder that gives up, show on the live status line. A window is cut once `windowClosed` (no
  kill can join and the
  tail is captured): the GOP at or before its start through its end, muxed
  to MP4 with mediabunny's `EncodedVideoPacketSource` — no decode; a ring
  that only begins more than `MAX_MISSING_LEAD_S` after the asked start
  (a capture restarted mid-streak) yields nothing rather than a clip
  missing its kills. A kill belongs to one clip: a window over footage
  already cut — redrawn by a late-read kill, or seen again because the
  session outlived the capture that first cut it — is skipped unless it
  scores higher, when it is cut and the clips it overlaps are deleted
  (`cuts` plus the session's saved clips, `live-session.ts`). What
  the clips hear is the `audioSource` setting: the source's own input
  (`audioInputFor`: same `groupId`, else a shared label prefix; OBS Virtual
  Camera carries none), the desktop's sound (`openDesktopAudio`: the share
  picker's audio track, opened before the camera so the click's activation
  still covers it, its video surface dropped), any audio input, or off.
- **VoD** (`capture/vod-clips.ts`): packets from the keyframe at or before
  the window start are copied into a fresh MP4 (video + audio, no
  re-encode, so a minute of 1080p takes well under a second). mediabunny's
  `Conversion` with `trim` always transcodes; keep using the packet copy.
- **Buckets** (`store/clips.ts`): `session` holds the running session's
  clips (nothing evicted while you play); Stop rolls them into `history`,
  where `MAX_HISTORY_CLIPS` (20) applies by score — download to keep. A
  file's clips (`vod`) live for one visit and are purged on the next page
  load; the file is on disk. Clip records carry the real `start`/`end`
  seconds (a packet-copied clip starts at a keyframe), and a card's deaths
  and kills get a ▶ when a clip covers their `t`.

## Commands

```sh
pnpm test:scanner                       # golden-file suite over tests/fixtures/ (Vitest, Node)
pnpm test:unit:browser                  # includes tests/logic/ — the fixture-free half, see below
pnpm scanner:report                     # accuracy table + name character error rate across fixtures
pnpm scanner:fixtures [name-substring]  # run detectors over matching fixtures, verbose
pnpm scanner:replay <dir> <startT> <fps> # replay ffmpeg-extracted frames through the scheduler+detectors
pnpm scanner:scan-vod <video>           # VoD scan as a CLI (ffmpeg): video in, events CSV out (--gpu, --record, see "WebGPU")
pnpm scanner:status-audit <events.csv>  # diff the CSV's timeline vs scoreboard D/S, rank fixture candidates
pnpm scanner:bootstrap-atlas            # harvest labeled fixture crops into the glyph atlases
pnpm scanner:build-glyph-atlas          # add the font-rendered charset (fonts required, see below)
pnpm scanner:build-localized-entries    # regen localized closed sets from ../splat3
pnpm scanner:build-planner-signatures   # regen the minimap stage-ID atlas from the assets repo
pnpm scanner:gpu-parity                 # every fixture: OpenCV vs WebGPU parse decisions + GPU upscale pixels
pnpm scanner:gpu-replay <corpus-dir>    # replay recorded match requests on WebGPU, timed, exact-checked
```

Scanner scripts run through `vite-node -c scripts/scanner/vite-node.config.ts`:
the root vite config pre-bundles `@techstark/opencv-js` for the browser worker
and vite-node must not consume that prebundle. The package is pnpm-patched
(`patches/`) to wrap its thenable CJS export as `{ cvReadyPromise }`,
unwrapped in `core/cv.ts`, and to expose its heap's `WebAssembly.Memory` as
`cv.wasmMemory` (captured from its one `WebAssembly.instantiate` call, all
in the short wrapper lines: the minified runtime line is never touched, so
the patch stays small). `core/frame-kernels.ts` runs on that memory.

## Architecture

```mermaid
sequenceDiagram
  participant Cap as capture (sampler / vod-frames)
  participant W as analyzer.worker (OpenCV)
  participant TL as TimelineBuilder
  participant MB as match-builder
  participant UI as live-session / vod-scan
  participant ING as /ingest (scanner-ingest)
  participant DB as IngestedMatch / IngestedMatchLink
  Cap->>W: frame + t (live/screenshot/seek) — VoD: worker decodes its own slice
  W->>W: scheduler dueDetectors() → gate() → parse()
  W-->>TL: DetectedEvents
  TL-->>UI: deduped timeline, status reads kept per run end (IndexedDB: events / vod-events)
  UI->>MB: buildScannerMatches(events)
  MB-->>UI: ScannerMatch[] + source events
  UI->>ING: POST { matches } (live: on match close / stop, VoD: once saved)
  ING->>ING: resolve context (current tournament/SendouQ activity, casts via staff roles, else content sequence ≥2)
  ING->>DB: merge-store IngestedMatch (matchHash, isSameMatch + merge, context hints)
  ING->>DB: link matches to game results → IngestedMatchLink (POV weapon → ReportedWeapon; scoreboards derived at read time)
  Note over UI: VoD "Add to VoDs": ScannerMatch → slim prefill param → /vods/new
  Note over UI: scoreWindows(match) → ring buffer / file packet copy → clips store
```

- `core/` is pure (mats in, events/matches out) and runs in the worker, the
  debug view, and Node tests. No DOM/browser APIs; Node-only helpers live
  in `node/`. Pure data/type imports from `~/modules` and
  `~/features/build-analyzer/data` are fine — valibot and the app config graph
  are not (schemas live in `scanner-schemas.ts`; core only `import type`s
  the shapes).
- `core/match-builder.ts` turns a timeline into `ScannerMatch`es: a MapStart
  opens a match, a scoreboard closes one (claiming the last 8 min of deaths
  when the intro was missed), minimaps group per map by confirmed stage
  change and >5 min gap. A battle history screen (battle log, replay
  browser) showing a game already built — same scoreboard fingerprint (the
  order-free paint/K+A/deaths/specials lines), recording time within 20 min
  of its play time — joins that match's sources instead of forming a new
  one, so browsing the log after playing neither adds a card nor re-uploads
  (the match was already sent). Likewise a results screen read again with no
  match opened since (a lost-connection dialog hid it and the detector
  re-armed) joins the last match. An event belongs to at most one match; deaths
  reveal enemy builds (`ability-harvest.ts`), the personal results screen
  (`ScoreboardOwn`, seen within `OWN_RESULTS_WINDOW_SECONDS` of a closed
  match's scoreboard) completes the POV player's full build, and minimap
  cards contribute everyone else's mains — so a card's Builds section
  covers both teams, each row rendered as far as it was read. Partial matches are fine —
  scanner-ingest merges them server-side. Senders filter with
  `ingestSkipReasons`: private/unread lobby only, and no games a disconnect
  cut short (scoreless + counter left more time than the footage did, or
  replayed right after on the same map — the latter is a VoD-scan filter in
  practice since it only resolves after the fact).
- The route (`routes/scanner.tsx`) is SSR-guarded: the client tree loads via
  `React.lazy` after `useHydrated`; nothing from `core/worker/capture/store`
  may be imported at route-module top level. There is no feature flag: the
  page and `/ingest` are open to everyone (ingest still requires a login).
- Ten detectors: `scoreboard` (results screen),
  `scoreboard-battle-log-replay` (replay-browser detail),
  `scoreboard-battle-log` (Recent Battles detail — same data sans replay
  code, panels stacked), `quick-scoreboard-battle-log` (the same detail as
  the lobby's quick view draws it: a card in slight perspective, so its
  frames are rectified by a homography — `RECTIFY` in its `rois.ts`,
  `core/rectify.ts` — before the shared parser in
  `scoreboard-battle-log/detector.ts` reads it), `scoreboard-own` (personal results), `death`
  (respawn overlay), `map-start` (match intro), `minimap` (in-match overlay
  + casted 8-player spectator variant), `objective` (ranked counter overlay:
  counts, penalties, holder, match timer — a mode-discriminated union with
  only the SZ member so far), `kill` (the "Splatted <name>!" feed
  bottom-center). The feed is the POV player's — on the SWS26 broadcast the
  specced player's, so a cast's kills follow camera swaps. One `Kill` event
  per frame carries the whole visible stack newest-first, up to four rows,
  each read as one line against every language's row template
  (`core/detectors/kill/localized-messages.ts`, generated) with the leftover
  as the name, plus the match timer off the same frame (`objective/timer.ts`,
  shared with the counter) so kills land on the game clock in every mode. The
  builder reduces the stack reads to one kill per row entering the feed
  (`deriveKills`: rows expire oldest-first and a blurred inner row can drop
  out of a single read, so each read is matched newest-first as a
  subsequence of the rows still remembered within
  `KILL_ROW_LIFETIME_SECONDS`), on the same replay-wipe anchor as the
  counter series; how long a row stays up is unattested, so a row outliving
  that lifetime would count twice. Row text reads through the `kill-feed`
  atlas, BlitzMain at the row's ~24px caps with the scoreboard-names
  charset, under `parseName`'s opt-in plain-tie rule (at that size an i's
  dot alone ranks the accented glyphs level with the plain one). The
  objective parse also emits a second
  event type per read: `PlayerStatus`
  (`core/detectors/objective/player-status.ts`), per-player special/dead
  flags off the icon strip flanking the timer (three geometries named by
  which side sits at the packed pitch — `even`, `narrow-right`,
  `narrow-left` — that are pure geometry, never footage type: S3 POV
  footage draws both narrow arrangements too, so only the D-pad camera
  badges prove a broadcast, reported as the read's `cast: true | null` —
  each geometry has its own badge row, the SWS26 broadcast draws `even`
  badges included;
  broadcasts can hide the badges while keeping their geometry, so a
  badge-less frame scores the geometries on how decisively the bodies
  read and sticks with the established layout unless another wins
  clearly, or unless the slot comb — which is positional, so it sees a
  pitch the body reads cannot — decisively picks a geometry (even needs
  the widest win) or puts narrow-right decisively ahead of a latched
  `even`, as happens when a spectator toggles between the overhead map and
  a player POV mid-match, and in S3 POV itself, which resizes each side's
  icons as the objective swings and so cycles through all three
  geometries within one game — the special-ready wash also pulses, so its dim trough is told
  apart from a splat by its team tint: a splat is a neutral grey plate under
  a grey X, which a blown-out backdrop turns near-white while a wash stays
  tinted at every pulse phase (a big dark weapon render such as the
  Nautilus drum dilutes that tint, but a diluted wash still reads pale,
  which a tinted splat never does; a pale backdrop showing through a
  splat's translucent plate tints it like a wash, but the X's grey strokes
  over the dark squid still give it away), and a ready read
  must also see a washed (ink-poor) body: pale backdrop, a ship's hull or
  the lead banner leaking past an icon edge fakes the shoulder glow, and a ready the shoulder glow does
  not corroborate needs the body's ink gone rather than merely paled,
  since a near-white weapon render (S-BLAST '91) pales a live body
  without emptying it), with
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
  downscaled tag signature (same killer recurs pixel-identical), the kill
  detector memoizes each feed row's read on its text-band signature (a row
  is re-read twice a second for as long as it shows, and shifts up intact
  when a newer one enters; the per-cell cap of the signature compare is
  what keeps near-twin names apart) and `classifySegment` prescreens
  oversized eligibility lists at half scale — all tuned so
  `scanner:report` stays bit-identical. Within one recognition,
  classifications are memoized by span, floor and candidate cap (a pure
  function of those: scores are exact), which the speculative prefetch and
  the sequential pass after it otherwise repeat. Glyph sets (atlas slices
  and every `scaleGlyphSet`, shared per source set and factor) and the
  template sets build on first use, not at detector creation.
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
  keeps continuously-firing events from storing a frame PNG each, and the
  worker only encodes a frame at all when a shadow `TimelineBuilder` (same
  defaults as the page's) says an event would be listed rather than merged
  into an earlier read (or extend a status run's trailing read) — a 1080p
  PNG per repeat read cost more than the parse once the kill feed re-read
  its stack twice a second. Frames no
  detector is due for skip canvas readback, and everything is counted in
  `core/detectors/telemetry.ts` — but only when a VoD is scanned with
  `?telemetry=true` in the URL (nothing links there) by a debug user;
  otherwise the workers skip collection and the panel stays hidden. A match's objective reads render
  as one step-line timeline
  (`~/components/ObjectiveTimeline.tsx`, shared with the match page).
  The live capture buffers frames sampled while the worker is busy; past the
  buffer limit the backlog is decimated toward even time-spacing
  (`worker/frame-queue.ts`) rather than truncated oldest-first, so a
  parse stall can no longer swallow a results screen whole (the exact
  failure that cost a live match its scoreboard on 2026-08-22).
- VoD scans (`components/vod-scan.ts`): on the WebCodecs path each worker
  scans its own contiguous slice (no frames cross the main thread), with two
  helper workers of its own that keep the waits off its thread: the dense
  stretches decode in `worker/decode.worker.ts` (mediabunny; the per-sample
  bookkeeping of a 60 fps slice cost the analyzer ~0.15 ms a sample), and
  frames are read back in `worker/readback.worker.ts` (the canvas readback
  blocks its thread for 3-5 ms a frame). The analyzer takes every sample's
  step strictly in stream order — bookkeeping, analysis when due, the calm
  check — against the scheduler state the previous analysis left, so the
  analyzed frames are exactly those of a one-frame-at-a-time scan. Only the
  waits overlap: while a pass runs, the next samples are decoded and held,
  those before `nextDueLowerBound` (certainly skipped: a gate or parse only
  moves a detector between its refine and search cadences) released, and
  the one `predictNextDueT` expects to be next read back and normalized
  ahead. The decode worker is told that lower bound (`floor`) and closes the
  samples before it itself, sending bare timestamps. When the scheduler
  reports calm (no gate
  pass for a quiet period, no open match), the worker skims
  keyframe-to-keyframe (hop capped at 2.5s so short screens can't hide),
  snapping back to dense decode on any gate pass. The seek fallback drives
  one worker and widens its stride over calm footage the same way; its
  metadata wait is bounded so an undecodable file errors instead of hanging.
  A scan is all or nothing: leaving the page cancels it and nothing is saved.
- Recognition is language-agnostic: OCR output snaps against every game
  language at once (`core/localized-entries.ts`, generated) and events carry
  sendou ids. English display names come from `core/labels.ts`.
- ROI coordinates live in each detector's `rois.ts`, in canonical 1920×1080
  space; every frame is normalized to that size first — black bars around the
  picture (letterbox/pillarbox, or a scene drawing the game smaller than its
  canvas) are cropped away before the resize (`detectContentBox` in
  `core/canonical.ts`; a bar must be level and ≥1% deep, since the Recent
  Battles screen's own scanline-textured edge is dark but neither). A
  layout drawn in perspective (the quick battle log card) additionally
  names a `RECTIFY` quad: its ROIs are in the frame warped by that
  homography, which the debug overlays map back onto the raw frame.
- New event types implement `Detector` (`core/detectors/types.ts`): a cheap
  `gate(mat)` at sample rate plus `parseSteps` (match steps, see "WebGPU")
  when the gate fires, `parse` being `runSync` of it. Register in
  `core/detectors/registry.ts`. Gates and parses read the frame's gray/RGB/HSV
  through `frameGray`/`frameRgb`/`frameHsv` (`core/image.ts`), converted once
  per frame and shared: never delete or write them, and never pass them a
  derived mat. Gray and RGB come from WebAssembly SIMD kernels
  (`core/frame-kernels.c`) bit-identical to `cvtColor` (tested on every
  24-bit color) at under half its cost. A gate probing a few small ROIs of a
  rectified region uses `createProbeWarp`, which replays OpenCV's f32
  bilinear warp at those pixels only (exact; `tests/frame-kernels.test.ts`).

## WebGPU

Template matching (every `TM_CCOEFF_NORMED` the recognizers run) and the
sub-1080p frame upscale can run on the GPU; every other step stays on the CPU.
The GPU is an accelerator only: the same algorithms make the same decisions.

- **Match steps** (`core/match-steps.ts`): recognizers are generators that
  yield every match their next decision needs (`MatchRequest`: an image,
  templates, a placement window per template, optionally a content `key`) and
  resume with the max scores. `runSync` answers lazily on the calling thread
  and is what `Detector.parse` runs; `all` steps generators in lockstep so
  independent reads share a round trip. Every detector implements
  `parseSteps`; within a parse, reads are lockstepped wherever the sequential
  code's consumption order, memo reads/writes (death tag, kill rows: the kill
  parse predicts its memo misses on a copy of the memo and reads only those
  ahead) and detector state stay exactly as before. `speculative`
  additionally prefetches merge / recut candidate sets in lockstep (batching
  drivers only; on the CPU it is wasted work).
- **Exact scores on both drivers**: a score is TM_CCOEFF_NORMED computed
  exactly — integer cross, window and square sums, one f64 normalization with
  OpenCV's guards (`normalizeNcc`), f32 result — so the CPU and the GPU give
  bit-identical scores and the same events. OpenCV's own `matchTemplate` (the
  pre-migration CPU path) runs a float DFT that wanders up to ~3e-4 from the
  exact score: never a decision on the fixtures or the VoD test slices, but
  enough to reorder a near-tie (seen once in a browser scan: an 8th-ranked
  strip-weapon candidate, scores 7e-7 apart), hence exact on both. On the CPU
  the cross sums run in WebAssembly SIMD (`core/cross-sums.c`, compiled into
  `cross-sums.ts`; regeneration steps in the C file), large jobs as one f64
  `filter2D` (rounded: exact), and the window sums come from integral
  images — faster than the `matchTemplate` path it replaced.
- **Frame pass** (`core/detectors/frame-pass.ts`): the worker and the CLI gate
  every due detector in registry order, then run all approved parses — one
  lockstep of their steps on the GPU — and record results in registry order.
  Scheduler decisions within a frame depend only on each detector's own
  state, so this equals gating and parsing one detector at a time.
- **Matcher** (`worker/gpu-matcher.ts`): each step is one submit of three
  passes — per-image integral images (window sums), a score pass (one thread
  per 4 vertically adjacent placements; cross sums as packed u8 dot products;
  an f32 estimate folded into the job's max) and a select pass returning the
  exact 64-bit integer sums of the placements within `EPS` of that max. The
  CPU finishes those with `normalizeNcc` — the exact score, identical on
  every GPU and to `runSync`'s. More than `K` near-tied placements, or a
  request the kernel cannot take, are finished on the CPU with the same exact
  arithmetic. Scores are cached per run by (`key`, template, window) — the
  window is part of a score's identity.
- **Frame upscale** (`worker/gpu-frame-scaler.ts`): `normalizeFrame`'s
  INTER_CUBIC upscale of sub-1080p pictures (13-25 ms of WASM per 720p frame)
  as an integer kernel reproducing OpenCV's 8-bit cubic resize bit for bit;
  1080p copies and INTER_AREA downscales stay on the CPU. Importing the
  VideoFrame as a GPU texture was rejected: its YUV→RGB conversion differs
  from the 2D canvas readback the CPU path sees.
- **Worker** (`worker/analyzer.worker.ts`): creates the matcher (and scaler on
  its device) at init when enabled and an adapter exists; a failed creation
  or a device lost mid-run (`device.lost`, or a failed readback) hands the
  pending step to `runSync`, so the generators still run exactly once and no
  event is dropped or duplicated, and later frames stay on the CPU.
- **Node** (`node/webgpu.ts`): scripts get WebGPU from Dawn, the `webgpu` npm
  package — deliberately not a dependency: `npm i webgpu` anywhere and point
  `WEBGPU_NODE` at its package dir. `scanner:scan-vod --gpu` scans on it
  (the CSV must stay byte-identical to a CPU scan), `--record <dir>` writes a
  replay corpus (`scripts/scanner/match-corpus.ts`), `scanner:gpu-replay`
  times it and checks every score against an exact JS reference and, with
  `--cpu`, against `runSync` (0 mismatches is the bar for any kernel change),
  and `scanner:gpu-parity` requires byte-identical events from both paths on
  every fixture.

## Assets (CDN) and fonts

Weapon/ability/special/sub template sources are the site's shared game icons
in the **sendou-ink/assets repo** under `assets/img/**` (`.avif`; ids from
`~/modules/in-game-lists`, plus the scanner-only `UNKNOWN` ability badge —
`toAbilityWithUnknown` narrows template ids back to sendou ids).
Scanner-specific sets — glyph atlases and the planner signature atlas — live
in the same repo under `assets/scanner/v1/**` (override the local path with
`SCANNER_ASSETS_DIR`). These are the only assets that mutate at a fixed URL —
nothing sets Cache-Control on the Space, and each atlas's `.png` and `.json`
cache independently, so a regen that moves glyph boxes must bump the version
segment. Otherwise a client can pair a fresh image with a stale meta and
silently read garbage (old dirs are deleted from the Space by the sync's
`--delete-removed`).

- Browser/worker: everything from `Config.staticAssetsUrl` — icons at
  `img/**`, atlases at `scanner/v1/**` (base URL rides the worker init
  message; the DO Space needs CORS for GET from sendou.ink + localhost).
  Local dev against fresh regens:
  `npx serve /Users/kalle/Developer/assets/assets -l 9100 --cors` and
  `VITE_STATIC_ASSETS_URL=http://localhost:9100` in `.env`.
- Node (tests/scripts): both sets from the sibling `../assets` checkout,
  never the CDN. AVIF decodes through `sharp` (`node/image-io.ts`) —
  `@napi-rs/canvas` mis-decodes AVIF partial-alpha.
- Atlas regens overwrite the checkout's `assets/scanner/v1` in place, so
  shipping one means pushing the assets repo (its deploy workflow mirrors
  `assets/` to the Space).

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
the human corrector — tests compare only ids). A frame that already serves
another detector's fixture (a kill feed caught in an objective frame) is
symlinked (`ln -s ../../objective/<case>/frame.png frame.png`), not copied,
and the kill suite's cross-negative sweep skips shared frames by real path.
Negative cases
(`{ "event": "none" }`) go in the shared `tests/fixtures/negative/`; every
detector's suite sweeps them. Every live misread should become a fixture —
the live app's "Save fixture" button exports the byte-exact analyzed frame
plus a prefilled `expected.json`. **Fixture ground-truth labels are
hand-corrected by the user (the Splatoon domain authority) — treat them as
definitive over any matcher output.** The dev-only fixtures view
(`/scanner?view=fixtures`) renders every fixture's frame beside its
`expected.json` for that ground-truth review — player-status and
strip-weapons cases get per-slot icon crops with the expected label under
each icon, and Inspect re-analyzes any frame in the debug view (`/scanner?view=debug`). The `q`
param narrows by case-name substring (comma = OR) and lives in the URL, so
finished labeling work can be handed over as a reviewable link, e.g.
`/scanner?view=fixtures&q=gauge-overlay,ready-trough`. Fixtures are committed as plain blobs
(no LFS for now); keep additions deliberate — fixture IO is isolated in
`node/fixtures.ts` if a retreat to LFS/an external corpus is needed.
