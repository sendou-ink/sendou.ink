# React Router vs SvelteKit slice: measurement report

Run of `svelte/scripts/measure.ts` on 2026-11-12 (results in [`results.json`](./results.json), measured at 17:42 UTC).
Both apps as production builds against the same `db.sqlite3`, signed in as the dev admin (user 274), the React
build with the stand-in shell (`MEASURE_STAND_IN_SHELL=true`) so both render the same minimal header.

- Machine: Apple M5 Pro, Node v26.7.0, Chromium (Playwright 1.64.1), CPU throttled 4x in the browser sections
- Load average: 2.78 at start, 2.25 at end, one sample peaked at 9.22 (threshold 4.5). The script flags the peak as
  "more than the measurement itself explains"; the run-to-run spreads below (mostly under 20%) show it did not
  disturb the browser numbers much, but treat single-digit-percent differences with care
- React Compiler: checked with its babel logger over all 273 app modules the measured routes ship: 356 functions
  compiled, **no bailouts**. No React numbers below come from uncompiled components
- Both builds checked fresh against their sources, neither an e2e build

## TL;DR

- **The framework runtime is the gap.** Per route React ships ~2.3–3.4x the JavaScript (brotli), of which the React +
  React Router + i18next runtime alone is 410 KB raw against SvelteKit's 123 KB.
- **Load:** main thread script time on a cold load is 4–5x lower in the slice (e.g. `/calendar/new` 123 → 26 ms),
  hydration finishes 60–80 ms earlier.
- **After load, script time per interaction is 1.3–1.9x lower in Svelte** in every scenario and every run. Style and
  layout time is equal where the DOM change is the same (tab switch, Compactify) and somewhat lower for Svelte where
  it touches attributes on every keystroke.
- **What a user feels changes less**: input-to-paint latency is 0.65–1 ms lower at p50 on the form and the bracket,
  equal on the tab switch (style/layout-bound). The clearer latency wins are in the tails: bracket revalidation p95
  35 → 20 ms, Compactify p95 12.8 → 6.6 ms (noisy).
- **Soft navigation** costs 3.4–5x less script, the frame shows 10–80 ms sooner.
- **Memory:** JS heap is half (6.6–6.9 vs 3.3–3.5 MB after load) and grows less over 20 navigations (+2.5 vs +2.0 MB).
- **Server:** SSR of the associations page 0.95 vs 1.38 ms per render; whole-document requests 2.25 vs 2.88 ms p50.
  Data requests are equal (same repositories).

## Load and bytes

Static bundle, brotli KB (files). `framework` = client entry's import graph, `shell` = root layout on top,
`associations*` = framework + route (no shell). `/calendar/new` and the bracket page are not in this breakdown,
see transfer below.

| part | React JS | Svelte JS | React CSS | Svelte CSS |
|---|---|---|---|---|
| framework | 117.6 (14) | 38.6 (9) | 0 | 0 |
| shell | 53.1 (41) | 18.3 (9) | 9.9 | 7.1 |
| /associations | 170.2 (70) | 75.8 (25) | 2.3 | 1.8 |
| /associations/new | 260.1 (121) | 101.3 (28) | 9.7 | 4.0 |

Of `/associations`' minified JS (raw KB): framework runtime 410 vs 123, UI layer 34 vs 12, shared app code 47 vs 30,
shared libraries 45 vs 28, bundler glue / compiled translations 20 vs 28.

Cold page load in the browser (median of 7, 4x CPU throttle; transfer is brotli KB of everything fetched;
React additionally fetches 45.5 KB of translation JSON, included in its total):

| page | script ms R / S | task ms R / S | transfer KB R / S | of which JS R / S | DOM nodes R / S |
|---|---|---|---|---|---|
| /associations | 119.8 / 27.7 | 356 / 267 | 320 / 130 | 192 / 78 | 1304 / 979 |
| /associations/new | 132.6 / 38.1 | 423 / 305 | 412 / 166 | 276 / 112 | 1391 / 1002 |
| /calendar/new | 123.0 / 25.7 | 359 / 216 | 529 / 161 | 370 / 108 | 514 / 281 |

DOM node differences are mostly `<head>`: React Router renders a `modulepreload` link per chunk and the app
preloads its translations (~250 `<link>`s on `/calendar/new`). The page itself (`<main>`) is node-for-node equal on
the two interaction pages (228 and 556 nodes).

## Server

| | React | Svelte |
|---|---|---|
| `/associations` document, p50 / p95 ms (2000 requests) | 2.88 / 3.68 | 2.25 / 3.00 |
| route data only, p50 / p95 ms | 0.34 / 0.82 | 0.37 / 0.73 |
| render only, µs per render (median of 10 rounds × 1000) | 1382 | 953 |
| document bytes | 173 191 | 156 433 |

The data request difference (0.03 ms) is noise; the document gap is rendering, as the render-only bench shows.

## After load: interactions

Each scenario runs on a freshly loaded, hydrated, network-idle page; input is replayed as raw CDP events at
coordinates recorded in warm-up cycles, 80 ms apart. CPU time comes from Chromium's counters around the loop;
latency is from a trace, first input event to the end of the next main-thread paint (INP-like, per interaction the
longest of its events). Median of 6 runs (a 7th discarded), React and Svelte interleaved. **Every run** = the React
number was higher in each of the 6 runs.

### `/calendar/new` (calendar event form)

| scenario | script ms/interaction R / S | style+layout R / S | latency p50 R / S | latency p95 R / S |
|---|---|---|---|---|
| typing 100 keys into the name `<input>` ¹ | **0.93 / 0.48** | **0.45 / 0.32** | **3.28 / 2.63** | **4.24 / 3.51** |
| add + remove a date row ×20 | **2.66 / 1.86** | 2.01 / 1.84 | **7.40 / 6.62** | 9.46 / 8.78 |
| switch map pool mode tab ×40 | **2.39 / 1.79** | 4.55 / 4.64 | 8.16 / 8.70 | 16.05 / 15.67 |
| validation errors shown/cleared (90) | **1.43 / 0.81** | **0.75 / 0.62** | **5.63 / 4.55** | **15.88 / 14.20** |

Bold = React higher in every run. Typing into a plain `<input>` is the cleanest framework comparison (no component
library on either side): React spends 1.9x the script per keystroke, yet the keystroke-to-paint difference is 0.65 ms.

¹ Rerun on its own at 17:51 UTC (`--interaction-scenario=calendarNew.typeName`, load 2.9–3.8) because the machine was
busy during its first measured run in the full run (React 1.48 ms script, 14.6 ms p95 in one run). The rerun's numbers
replaced the scenario in `results.json`, which lists it under `interactions.reruns`; every other number is from the
full run.
The tab switch mounts and unmounts 25 stage checkboxes; it is style/layout-bound and equal.

### `/to/2/brackets?idx=0` (dev seed "Paddling Pool 14", double elimination in progress, ~25 match cards)

| scenario | script ms R / S | style+layout R / S | to paint p50 R / S | to paint p95 R / S |
|---|---|---|---|---|
| Compactify toggle ×40 (client-only, half the rounds hidden/shown) | **3.57 / 2.64** | 1.09 / 1.11 | **6.74 / 5.73** | 12.79 / 6.64 |
| revalidation with one score changed ×20 (per update) | **12.16 / 8.70** | **0.45 / 0.37** | **20.0 / 18.0** | **34.8 / 19.6** |

The revalidation path: the measure script writes the score of match 2 to the database (restored afterwards), then
calls React Router's `revalidate()` / SvelteKit's `refreshAll()` and times until the painted frame shows the score,
server time included (a second server pair with `DISABLE_CACHE=true` so the write is visible). Both sides rebuild the
same shared `Tournament`/`Bracket` objects from the fresh data, which is a large share of the script time on both.

### Hydration (median ms; cold = fresh browser context, warm = 4th load in one context)

| page | script cold R / S | script warm R / S | long tasks cold R / S | hydrated at cold R / S |
|---|---|---|---|---|
| /calendar/new | **116.5 / 26.5** | **116.2 / 24.8** | 0 / 54 | **262 / 191** |
| /to/2/brackets | **108.8 / 22.0** | **108.9 / 20.7** | **143 / 78** | **326 / 245** |

- Cold and warm are the same in this run, so V8 compile is not what dominates at these bundle sizes on this machine.
  (An earlier run on a busy machine suggested otherwise; this quiet run does not reproduce it.)
- Long tasks on `/calendar/new`: React hydration stays under 50 ms per task (0 ms long-task time) while the slice
  hydrates in one 54–61 ms task, despite a quarter of the script time. On the bracket page both have long tasks,
  React's longer.

### Soft navigation (from `/associations`) and memory

| page | first nav script R / S | first nav to paint R / S | repeated nav script R / S | repeated to paint R / S | heap after load → after 20 navs, MB R / S |
|---|---|---|---|---|---|
| /calendar/new | **78.6 / 20.2** | **188 / 111** | **20.7 / 6.0** | **46.3 / 34.9** | 6.63 → 9.18 / 3.26 → 5.26 |
| /to/2/brackets | **72.7 / 15.3** | **227 / 142** | **28.5 / 5.6** | **59.6 / 49.0** | 6.89 → 9.41 / 3.47 → 5.69 |

"First" also loads the route's code; "repeated" is the median of 20 navigations in. Heap is `JSHeapUsedSize` after
two forced GCs, identical across runs to within 1%.

## Noise

Run-to-run spread ((max − min) / median over the 6 runs) is under 20% for nearly every CPU metric (the rerun typing
scenario 6–29%); the exception is Compactify's p95 (55% React, 131% Svelte, one slow run each). Every difference
marked bold held in all 6 interleaved runs; the unbolded ones (map tab switch everywhere, style/layout and p95 of the
row add, Compactify style/layout and p95) are inside the noise and should be read as equal.

The difference the runs agree on is script time; latency differences are around 1 ms at p50 because each interaction's
latency is dominated by work both apps share (style, layout, paint, and for revalidation the server).

## What is not like for like

- **Stack as it would ship.** Each side runs its own form store (the Svelte one ports the React rules and calls the
  same shared validation), its own field components and router. No React Aria is involved on either measured page:
  the React fields on `/calendar/new` are hand-rolled too, so markup is equal.
- **Port scope.** The Svelte `/calendar/new` is the calendar event variant only, and does not submit (validation
  runs, submitting toasts "not ported"); the searchable select, image, trophy and SendouQ map pool filter field types
  are not ported (none on the measured form). The bracket page is read-only: check-in, finalizing, starting brackets,
  preparing maps, spoiler-free mode, group tabs, round robin/swiss, drag-to-scroll, scroll memory, the nav's
  overflow menu and the popovers of the CAST/LIVE/VOD buttons are not ported (none show in the dev tournament).
- **Live updates.** The React bracket page keeps a server-sent events stream open; the slice has none.
- **Revalidation.** React Router refetches the root, layout and page loaders in one request; SvelteKit refreshes the
  page's two remote queries.
- **Soft navigation trigger.** React Router's own `navigate()` (what `<Link>` calls) vs an anchor click that SvelteKit
  intercepts.
- **Translations.** React fetches its translations as JSON (45.5 KB brotli per cold load) and preloads every
  namespace once idle; the slice compiles messages into its scripts.
- **Measurement-only code.** Both stand-in shells set a `sendou:hydrated` performance mark; the slice's layout exposes
  `window.__sveltekitRefreshAll` so the script can revalidate it the way it uses React Router's
  `window.__reactRouterDataRouter`.

## Rerunning

```sh
pnpm run i18n:usage && MEASURE_STAND_IN_SHELL=true react-router build --sourcemapClient hidden
SVELTE_SLICE_SOURCEMAP=true pnpm --filter @sendou/web-svelte run build
node svelte/scripts/measure.ts          # ~25 min; --interactions-only prints only the new section
node svelte/scripts/measure.ts --interaction-scenario=calendarNew.typeName   # redo one disturbed scenario (~7 min)
```

The script refuses to start above the load threshold and records the load it saw; this run used `--port=7811`
because 7612 was taken.
