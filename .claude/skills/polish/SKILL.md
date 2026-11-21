---
name: polish
description: Sweep the site for visual polish defects (text overflow, contrast, sideways scroll, layout shift on load/scroll/action/navigation, scroll jumps, missing hover, press and focus feedback, off-center elements, alignment near misses, inconsistent sizes, defects inside dialogs and menus, small touch targets...) with a mechanical Playwright sweep plus reviewing subagents, and hand back a markdown document of findings with screenshots and GIFs. Use when asked to polish the site or a feature, do a design/visual QA pass, check a page or a branch for layout shift or overflow, or see what changed since the last polish run.
---

# Polish

Goes over the site the way a picky designer would and comes back with `findings.md`: a heading, a short explanation and a screenshot or GIF per defect. Read-only, it reports and does not fix (fixing the accepted findings is a follow-up task).

Three sources of findings, on purpose:

1. **The mechanical sweep** (`scripts/sweep.mjs`, no model involved) puts every page through in-page probes (`scripts/probes.mjs`) and the passes of `scripts/passes.mjs`: at mobile and desktop, at every width between, in both themes, with every control clicked. Cheap, repeatable, and it finds what eyes miss: a 3px move, a 3.8:1 contrast, a focus ring cut off by a box.
2. **The e2e hook** (optional): the same probes riding along with the e2e suite, for the states only a test reaches (after a write, mid-flow).
3. **Reviewing subagents** give every mechanical finding of their area a verdict (the sweep over-reports by design), then look for what only eyes catch: wrapping, alignment, spacing, things that feel off.

What the reviewers decide is kept (`verdicts.json`), so the next run only asks about what is new, and two runs can be compared.

Scope from the request: the whole site (default), a feature, a URL, or what a branch touched (`scripts/changed.mjs` maps the changed files to pages).

**Before choosing what to audit, read [audit-log.md](audit-log.md)**: what earlier runs covered, and the list of what has never been audited (viewers, languages, data, states). When the request leaves the scope open ("polish the site", "audit something else"), propose the most valuable thing from that list instead of repeating the last run, and say which it is.

## What is checked

| Rule | Meaning | Found by |
| --- | --- | --- |
| `shift-on-load` | a component moved while the page loaded or hydrated | `layout-shift` entries on a throttled load, uncached and cached, any move of 3px or more; recorded as a GIF. One finding per component that moved, so a header shifting on every page is one |
| `shift-on-idle`, `shift-on-scroll` | something moved while the page sat untouched, or while it was scrolled | the same entries after the load has settled and while scrolling to the end |
| `shift-on-action`, `control-moved` | after a click, what is above or beside the control moved, or the control left the pointer | rects of everything on screen before and after: every tab, disclosures, in-section links, and (writes blocked) every other control |
| `scroll-jump` | the page scrolled (to the top) on a tab, filter or pagination click | `scrollY` before and after the same clicks, done scrolled down |
| `text-clipped` | text cut by a box with no ellipsis, including an ellipsis that never shows because its box does not shrink | text rects against every clipping ancestor |
| `text-spill`, `text-overlap`, `text-under-control`, `touching-text` | text sticking out of its box, drawn over another text, running under a button or picture next to it, or running into the next text | text rects against boxes, controls, pictures and each other |
| `label-wraps`, `mid-word-break`, `orphan-word` | a button, tab or pill label on two lines, a real word broken in the middle, a heading leaving one word on its last line | the line boxes of the text |
| `truncated-with-room` | cut with an ellipsis while the row has room for it | hidden width against the empty space to the right |
| `squashed` | a select too narrow for its value, an icon squeezed flat, a round avatar drawn as an oval | measured text against the control, view box against box |
| `horizontal-scroll` | the page scrolls sideways | document width vs viewport; blames what the page gets narrowest without |
| `accidental-scroll`, `nested-scroll` | a box that scrolls by a few pixels, a scroll box inside the scrolling page | scroll sizes of every scroller |
| `content-under-fixed-bar`, `anchor-under-header` | the end of the page left under a fixed bar, an in-page link landing under the sticky header | scrolled to the end; `scroll-margin-top` against the header |
| `overlay-offscreen` | an opened dialog, popover or menu reaching past the screen | the explore pass opens every one; every static rule also runs inside it |
| `low-contrast`, `low-contrast-ui` | under WCAG AA (4.5:1, large text 3:1; icon-only controls 3:1), per theme: text, field values, placeholders, text over pictures | computed colors over the backgrounds behind; over a picture or gradient the pixels are sampled |
| `no-hover-feedback`, `cursor-not-pointer` | a clickable thing that does not react to the pointer | style snapshot before/after a real hover, then a pixel compare |
| `no-press-feedback` | nothing shows while a finger is down (touch viewports, where nothing hovers) | `:active` forced on, compared with the control at rest; passes when the tap highlight is on |
| `no-focus-indicator`, `focus-ring-clipped` | keyboard focus shows nothing, or a ring cut off by a box around it | pixels focused vs not, and on which sides of the box they differ |
| `focus-not-visible`, `focus-obscured` | Tab stops on something hidden, or under a sticky bar | Tab pressed through the page |
| `off-center` | an icon or label off the middle of its button, pill or badge | box gaps, and the drawn pixels (an icon can be off inside its own box) |
| `near-miss-alignment`, `misaligned-row`, `uneven-gaps` | things 2-8px off an edge their siblings share, texts of a centered row not on one line, one gap unlike the others | edges of same-kind siblings, headings, row parts |
| `off-token`, `inconsistent-heading`, `page-title` | a size a few pixels off the design tokens or used by one component, a page heading unlike the others, pages sharing a title | a census of every font size, weight, radius and gap across the run (`digest.mjs --census`) |
| `small-tap-target` | under 24x24 with another target too close (touch viewports) | WCAG 2.5.8 with its spacing exception |
| `broken-image`, `distorted-image`, `blurry-image` | as named | natural size against drawn size |
| `junk-text`, `unlabeled-control`, `raw-translation-key` | `undefined`, `NaN`, `{{count}}` on the page, a control with nothing to read or announce | text patterns |
| `console-error`, `failed-request`, `js-error`, `hydration-mismatch`, `not-hydrated`, `client-redirect`, `error-page`, `broken-link` | the rest | as named |

Judgment findings from the reviewers use `wrapping`, `alignment`, `spacing`, `truncation`, `consistency` and `other`.

A finding is recorded once per component: its key is the rule plus the element's class signature, with the pages, viewers and widths it was seen at. Forty pages showing the same button are one finding. Each says whether it shows with **ordinary content** or **only on content stress pages**: the first is what visitors see today.

## Running it

All commands from the repo root. Docker has to be up (SeaweedFS serves the images), `ffmpeg` on the PATH (GIFs).

### 0. Self-test, after touching a probe

```bash
node .claude/skills/polish/scripts/selftest.mjs      # about a minute, needs no server
```

`selftest/*.html` hold a planted defect per rule and the cases earlier probes got wrong (`data-case`, `data-expect="rule"`, empty for "nothing may be found here"). The script runs the real passes over them and fails on a miss or on anything unexpected. **A probe change is not done until this passes, and a probe mistake a reviewer reports gets a case here along with its fix**: an exemption added for one false finding has silenced true ones before.

### 1. Database

```bash
pnpm run polish:db
```

Builds `db-polish.sqlite3`: the dev seed, the content stress rows of `scripts/polish/stress.ts` and the states of `scripts/polish/states.ts`, and writes `targets.json` (those pages) and `routes.json` to `scripts/output/polish/`. Rebuild when migrations, the seed or either file changed; otherwise the existing file is fine. It never touches `db.sqlite3` or the sandbox (`build-db.ts` refuses any other file name).

**Content stress rules** (keep them when extending `stress.ts`):

- writes go through the factories only, as in tests and the dev seed
- every length is the constant the form's schema uses, imported, never a number typed in: only what a user can enter through the site is worth reporting. A limit that lives in a schema as an inline literal gets hoisted into the feature's constants file first
- each text in two shapes, because they break layouts differently: **unbroken** (max length, wide glyphs, no break opportunity) and **words** (max length with spaces); counts at their maximum too (members, tags, weapons). Names in other scripts (Japanese, emoji, right-to-left, stacked marks) sit on a handful of users and one team roster
- the content has to reach real pages: detail pages and the lists and compositions that show the same name in less space (brackets, match pages, cards, notifications)
- new rows go last, so the ids (and the URLs in older findings and task notes) stay what they were

**States** (`states.ts`) are the dev tools' scenarios run with the parameters that change what a page shows: a SendouQ match in each of its states, a tournament of every format before, during and after its bracket, a lobby you are waitlisted in, a new user. Everyday content, each with the user to view it as. A page nothing reaches needs a line there.

### 2. Server

```bash
node .claude/skills/polish/scripts/server.mjs      # run in the background, prints POLISH SERVER READY <url>
```

Serves the **production build** (e2e flavour, rebuilt when stale, the same build and marker `pnpm run test:e2e` uses) on `db-polish.sqlite3`, port `PORT + 900`. Not the dev server: that one injects styles with JS, shows the dev toolbar and hydrates slowly, which fakes the very shifts being looked for. Restart it after rebuilding the database (the server caches). `POLISH_DB=<file>` points server and scripts at another database.

### 3. Pages

```bash
node .claude/skills/polish/scripts/crawl.mjs                 # the admin: manifest.json
node .claude/skills/polish/scripts/crawl.mjs --as=anon       # a logged out visitor: manifest-anon.json
node .claude/skills/polish/scripts/crawl.mjs --as=regular    # a user without roles: manifest-regular.json
```

Follows links from the front page, keeps two URLs per route of `app/routes.ts` plus every seeded page (content stress, states), then tries the routes nothing linked to with params borrowed from a found sibling. Prints the routes it could not reach: those need a state in `states.ts`, a stress target, or a manual look. A guessed page behind a per-object permission answers 403 and is listed as a failed link: give it a target with the right `viewerId`. `--include-admin` adds `/admin`, `--as=<user id>` is anyone else.

Most visitors are logged out or have no roles: a whole-site audit sweeps all three (`sweep.mjs --as=admin,anon,regular`). A page seen by several viewers is still one finding.

### 4. Mechanical sweep

```bash
node .claude/skills/polish/scripts/sweep.mjs --run=<name>
#   --only=<part of url or feature>[,..]   --limit=N   --concurrency=8
#   --passes=static,interactive,actions,explore,widths,load
#   --viewports=mobile,desktop      also tablet, wide
#   --as=admin,anon,regular         whose manifests
#   --lang=longest | --lang=he      the language with the longest translations; right-to-left
```

Writes `scripts/output/polish/<name>/mechanical.json`, evidence under `media/`, `census.json` and `coverage.json`. Run it in the background: the whole site as the admin (203 pages, all six passes) takes well over 10 minutes on 8 workers (static, actions and explore alone take 10, widths and load come after). Read the result with `digest.mjs --run=<name> [--feature=..] [--rule=..] [--new]`.

| Pass | What it does |
| --- | --- |
| `static` | the static probes at each viewport, contrast in both themes, the pixel checks, the census |
| `interactive` | hover and focus of every clickable component (pointer viewports), press feedback (touch viewports), the Tab walk |
| `actions` | every tab, disclosures and in-section links clicked |
| `explore` | every other control clicked **in a session that lets no write out** (a request that is not a GET is cut off and counted), so buttons that would save or delete are safe: what moved, the dialogs, popovers and menus that open, and the page again when a click changed it (validation messages, revealed sections) |
| `widths` | the cheap probes at 13 widths from 320 to 1920 without reloading; findings carry the widths they show at |
| `load` | throttled load, uncached and cached; then idle; then scrolled to the end |

**A branch**: `node .claude/skills/polish/scripts/changed.mjs` traces the files changed against `main` to pages (a CSS module to the pages earlier sweeps saw it on, a route file to its pages) and prints the `--only=` line. Then `compare.mjs` against the last whole run of `main` shows what the branch added.

**The e2e hook**: `POLISH_RUN=<name> pnpm run test:e2e` (or a few specs) runs the read-only probes on every page a test opens, each time it comes to rest. Findings land in `<name>/e2e/` and show in the digest as `e1`, `e2`... with the test that reached them. It sees what the sweep cannot: the page after a form went through, a toast, a match being reported. The e2e suite blocks web fonts, so widths differ a little from the sweep's.

**Another site** (the docs site's component showcase, every shared component in every state): `POLISH_BASE_URL=http://localhost:4321 node .claude/skills/polish/scripts/sweep.mjs --run=<name> --plain --urls=/components/buttons,/components/dialog,...` with `pnpm run dev:docs` running. `--plain` logs nobody in and waits for no hydration marker.

### 5. Review with subagents

Split the features of the manifest into areas that don't overlap (about six: tournaments, play (SendouQ, lobbies, scrims, LFG), users & teams & settings, tools & content, the shell and shared components, and one reviewer for motion only: load, idle, scroll and action shifts and scroll jumps across every feature). Give each [reviewer-brief.md](reviewer-brief.md) with its slots filled (or the path to it plus the slot values), and run them on Opus (`model: "opus"`). Tell the area reviewers which rules the two specialists own (shell: hover, press, focus, contrast, touch targets, the census rules; motion: the shift and scroll rules) so nothing is triaged twice. Tell the user roughly how many agents will run before starting; a scoped run (one feature) needs one.

Each reviewer writes three files: `<run>/reviewed/<reviewer>.json` (the findings), `.triage.json` (a verdict for **every** mechanical finding of its area, real ones included that it did not write up) and `.notes.json`.

A run whose mechanical findings mostly carry a verdict already (`digest.mjs --new` is short) needs fewer reviewers: the new ones are all that has to be looked at.

When they are back:

- `node .claude/skills/polish/scripts/verdicts.mjs --run=<name>`: how right each rule was, the real findings nobody wrote up, conflicts between reviewers
- read every final message: a probe mistake gets a case in `selftest/` and a fix in `probes.mjs` / `passes.mjs` right away (step 0), the "needs a human decision" items go to the user as they are
- merge findings two reviewers both wrote (shared components show up in several areas) by editing the `reviewed/*.json` files; give findings with one root cause the same `cause`
- look at the evidence of the findings rated `high` yourself, and check the claimed root cause in the code where one is named

### 6. Report

```bash
node .claude/skills/polish/scripts/compare.mjs --run=<name> --against=<earlier run>   # optional: what is new, what is gone
node .claude/skills/polish/scripts/report.mjs --run=<name>                            # writes <run>/findings.md
```

Open `findings.md` yourself and look at a few of the images before handing it over. Then tell the user where it is, the counts per section, the handful that matter most, the shared causes and their guardrails, and what was not covered (unreached routes, probe mistakes found).

### 7. Record what was audited

`findings.md` ends with sections the report builds by itself: **Real, not written up** (the backlog), **What was audited** (the run's `coverage.json`: pages per feature and route, viewports, widths, viewers, passes, plus what each reviewer looked at by hand), **Not audited** and **Needs a decision**. The reviewer parts come from `<run>/reviewed/<reviewer>.notes.json`; write one yourself (`orchestrator.notes.json`) for what you checked and for gaps you know of.

Then add the run to [audit-log.md](audit-log.md): a row in "Audited so far", a section for the run, and the "Never audited" list updated (strike what this run covered, add the gaps it found). That file is checked in, the run folder is not: it is what the next audit starts from.

If the user keeps audit notes outside the repo (an Obsidian vault), write the same summary there: what was audited, what was not, the findings that matter most and where the full document is.

### 8. After the user's triage

- `node .claude/skills/polish/scripts/verdicts.mjs --run=<name> --save` keeps the verdicts in [verdicts.json](verdicts.json) (checked in), with what the user overruled corrected in the `.triage.json` files first. The next sweep marks those findings as known: `digest.mjs` leaves out the intentional ones and the probe mistakes, and `--new` shows only what has no verdict
- [allowlist.json](allowlist.json) (`{ "rule", "match", "reason" }`, `match` a part of the selector, signature, URL or detail) is for what a verdict per component cannot say: a whole class of findings that is never wanted
- a probe that was wrong gets fixed in `probes.mjs` with a self-test case, not allowlisted
- a shared cause gets its guardrail proposed to the user (a Biome plugin, a shared component, a utility class): fixing twelve instances does not stop the thirteenth. `node .claude/skills/polish/scripts/source.mjs` lists where the stylesheets already hold the pattern
- accepted findings become tasks, one per section of the report:

  ```bash
  node .claude/skills/polish/scripts/tasks.mjs --run=<name> --tasks=<folder of task notes> \
       [--skip=<part of a finding title>,..] [--note=<sentence for every note>] [--commit=<sha audited>]
  ```

  It writes `Polish: <Section>.md` notes (frontmatter `status: open`, tags `sendou-ink`, `design`, `polish`) with every finding, its reproduce line and its evidence copied into the folder's `attachments/`, and the working instructions of "Fixing findings" below. Notes that exist are left alone (`--force` overwrites). The user's task notes live in their Obsidian vault (`~/Vault/sendou.ink/tasks`)

## Fixing findings

For whoever picks up a `Polish: …` task (or fixes a finding straight from `findings.md`). The rule: **every fixed finding is shown to the user as a before/after pair taken with the same command.**

1. **The audit's environment, in your own checkout** (a worktree has neither the database nor the server):

   ```bash
   pnpm run polish:db                                  # db-polish.sqlite3: dev seed + content stress + states, same ids and URLs every time
   node .claude/skills/polish/scripts/server.mjs       # in the background; production build, port PORT + 900
   ```

   Docker has to be up (image storage). `node .claude/skills/polish/scripts/server.mjs --url` prints where it listens.
2. **Before, before touching code.** Run the finding's reproduce line with `--out=scripts/output/polish/shots/<section>-<nn>-before.png` (gitignored) and whatever makes the picture show the defect the way the audit's evidence does:

   | The finding is about | Add |
   | --- | --- |
   | one element | `--crop=<selector>` (tight) or `--mark=<selector>` (outlined in the full viewport) |
   | hover or focus | `--do=hover:<selector>` / `--do=focus:<selector>`, with `--gif` for rest and hover as two frames |
   | something moving on a click, a scroll jump | `--do=scroll:<y> --do=click:<selector> --layout-diff --gif` (prints what moved, the GIF flips between before and after the click) |
   | something inside a dialog, popover or menu | the finding's `--do=click:…` steps with `--read-only` |
   | a shift while loading | `--throttle --video --shifts` (a slowed down recording plus the layout shift entries) |
   | a claim in pixels (4px off, a 13px font) | `--inspect=<selector>`: the boxes and styles as numbers, before and after |
   | light theme, another viewport, viewer or language | `--theme=light`, `--viewport=mobile\|tablet\|desktop\|wide\|<W>x<H>`, `--as=<user id>` / `--anon`, `--lang=<code>` |

   Look at the picture. If the defect is not visible in it, the "after" will prove nothing: retake it. If the finding does not reproduce any more, report that instead of changing code.
3. **Fix the cause** where the finding points (the digest and the report name the CSS module and class; class names in the build read `_name_hash`). The "likely fix" is a lead: verify it. A cause shared by several findings is fixed once, in the shared component.
4. **After, with the exact same command**, only `-before` becoming `-after`. The polish server serves a build, so restart it after changing code (it rebuilds, about a minute). Iterating on the dev server is fine for overflow, contrast and hover; the pair comes from the polish server, and layout shift can only be judged there. Adding `--probe=overflow,horizontal-scroll,contrast` prints what the mechanical probes still see on the page, `--layout-diff` and `--shifts` should come back empty for the motion findings.
5. **Check you broke nothing next to it**: the other viewport, and the same component with ordinary content (`/u/sendou`, a seeded tournament or team). A fix for a 64 character name must not change how a normal one looks. For a shared component, `montage.mjs --module=<its CSS module> --selector=<it>` shows it on the pages that use it, and `sweep.mjs --run=<name> --only=<url>,<url> --passes=static,widths` over a few of them followed by `compare.mjs` is a cheap regression check.
6. **Report**: for every finding fixed, its number and title and the before/after pair; then the findings not fixed, with the reason. No changelog entries for polish fixes unless the user asks for them. `pnpm run checks` passes.

## One page by hand

```bash
node .claude/skills/polish/scripts/shoot.mjs /builds --out=/tmp/builds.png --viewport=mobile --probe
node .claude/skills/polish/scripts/shoot.mjs /u/sendou --out=/tmp/tab.png --do=scroll:500 --do=click:text=Results --layout-diff --gif
node .claude/skills/polish/scripts/shoot.mjs /to/1/brackets --out=/tmp/load.png --throttle --video --shifts
node .claude/skills/polish/scripts/shoot.mjs /t/some-team --out=/tmp/team.png --inspect='[class*="_name_"]' --tiles
node .claude/skills/polish/scripts/montage.mjs --selector='[class*="_pageHeader_"]' --out=/tmp/headers.png /builds /vods /art /lfg
```

`shoot.mjs`: screenshot, optional steps (click, hover, focus, press, scroll, wait), `--gif` of the frames, `--video` slowed down, `--probe` for the mechanical probes, `--layout-diff` for what a click moved, `--shifts` for the load's layout shift entries, `--inspect` for an element's numbers, `--tiles` for a long page at full size, `--read-only` to click what would write. The top of the file lists everything. `montage.mjs` puts one component from several pages into one picture, for seeing whether it is the same everywhere.

## Good to know

- **Classic scrollbars on purpose.** The browser is launched with scrollbars that take space (most visitors are on Windows), so a page that grows a scrollbar shows up as `shift-on-action` with "a scrollbar appeared".
- **Fonts load from the network** (unlike in the e2e suite, which blocks them): a late font swap is a real shift, and the uncached load of the load pass is where it shows.
- **The e2e flavour differs from production in a few places**: trophies don't render their 3D models, the test season list is used, no ads. Ad slots are worth a separate look on the dev server (Triggers app, simulated ads).
- **Class names** in the build read `_name_hash_line`, and the hash is one of the stylesheet's content: `lib.mjs` turns it back into the file (`source:` in the digest), and into a key that survives a rebuild. A stylesheet edited since the build no longer matches until the server rebuilds.
- **Logged in pages never go network idle** (the event stream stays open): wait on `[data-testid="hydrated"][data-router-idle="true"]`, which `visit()` and `settle()` of `lib.mjs` do.
- **Hover, press, focus, centering and sampled contrast are tested once per component signature** across the run, actions once per control per route (controls of the header and navigation once in all): a rerun with `--only` tests them again.
- **The explore pass never writes, and never sees what a write leads to.** A click whose request was cut off is counted (`writesBlocked` in `coverage.json`) and its page thrown away. Toasts, saved states and what follows a submit come from the e2e hook.
- **Known over-reporting**, left for the reviewers (and for `verdicts.json` after the first run): views that replace the clicked control (mobile drill-downs, the desktop user page hub), collapsed text behind a "Show more" (`text-clipped`, vertical), secondary text that is dim by design (it does fail AA), drag handles and third party toolbars without a pointer cursor, `no-press-feedback` on nearly every link (one finding and one guardrail, not a hundred), marquee chips cut by their window, scroll boxes that are meant to be (a chat, a sticky filter column), panels that open beside the control and push the header along.
- **Known blind spots**, for the reviewers to cover by hand: focus drawn by a sibling element that is not the label, optical alignment the box and pixel checks both pass, anything that needs typing to appear (search results, a filled form), what a hover reveals inside a menu.
- Adding a probe: a function in `probes.mjs` returning `finding(rule, element, detail)`, registered in `PROBES`, added to the lists at the top of `passes.mjs`, to the sections of `lib.mjs` and to the table above, **with a planted case and a clean case in `selftest/`**. Try it on one page with `shoot.mjs --probe=<name>` first.
