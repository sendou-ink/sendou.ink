# Polish reviewer brief

Fill the `{{…}}` slots and hand this to each reviewing subagent. One reviewer per area, areas must not overlap.

---

You are reviewing the visual polish of sendou.ink (repo: `/Users/kalle/Developer/sendou.ink`) for one area of the site. A mechanical sweep already ran; you give every finding it made in your area a verdict, then look for what only eyes catch. Your output is a JSON file of findings a maintainer will review one by one, each with a screenshot or GIF, and a verdict file the next run starts from. **Read-only job: do not edit code, do not write to the database, do not restart the server.**

## Your area

**{{AREA_NAME}}** — features: `{{FEATURES}}`
Reviewer name (used in file names): `{{REVIEWER}}`
Run folder: `{{RUN_DIR}}`
Extra focus: {{FOCUS}}

## What "polished" means here

1. No text overflowing its box. Text that is cut off must show an ellipsis.
2. Text is readable: no contrast problems, in dark and in light theme.
3. No page scrolls sideways.
4. **No layout shift** (the most important one): nothing moves on load, on hydration, on an action or on navigation between sibling pages. The control you clicked stays under the pointer; what is above or beside it stays put.
5. No unneeded scroll to top (tabs, filters, pagination, toggles).
6. Everything clickable reacts to hover (and shows keyboard focus).
7. Things are centered and aligned logically: icons in buttons, labels in pills, rows on a shared baseline, equal gaps.
8. The same thing looks the same everywhere: one component at one size, page headers in one place, the sizes of the design tokens and not a pixel beside them.
9. And the rest of what makes a page feel finished: no awkward wrapping (a tab label on two lines, a one-word last line in a heading, a button label breaking), consistent spacing between sibling sections, no double scrollbars, nothing hidden under a sticky header, dialogs and menus that fit the screen, touch targets big enough on mobile, no stretched or broken images, designed empty states, no raw translation keys.

## The tools

The site runs at `{{BASE_URL}}` (a production build on a seeded database, shared with the other reviewers). All commands from the repo root.

- **The mechanical findings of your area** (start here):
  `node .claude/skills/polish/scripts/digest.mjs --run={{RUN}} --feature={{FEATURES}}` (`--rule=a,b` for the rules you own across features, `--new` for only the ones no earlier run gave a verdict)
  Each has an id (`m12`, or `e3` for one seen during an e2e test), an `evidence:` image path (look at it with the Read tool), the CSS module it comes from (`source:`), the widths it shows at and, when it sits inside something that had to be opened, the `state:` and the `steps:` that get there. `[content stress only]` means it was only seen on pages seeded with user content at the longest the forms accept (max-length names with no spaces, max-length bios...): a real bug, a user can enter that, but an extreme. `[ordinary content]` is what visitors see today. A `known:` line is the verdict an earlier run gave the same finding.
- **The census**: `digest.mjs --run={{RUN}} --census` lists every font size, weight, corner radius and gap in use across the site, with the token it is (or `-`) and how many components use it. The reading list for consistency.
- **Your pages**: `{{RUN_DIR}}/../manifest.json` lists every page with its `feature`, `viewer` (the user id to view it as) and, for stress pages, what is stressed. Filter it to your features with `node -e` or `jq`.
- **Looking at a page**: `node .claude/skills/polish/scripts/shoot.mjs <url> --out=<png> [--as=<id>|--anon] [--viewport=mobile|tablet|desktop|wide|WxH] [--theme=light] [--lang=<code>] [--tiles] [--full] [--mark=<selector>] [--crop=<selector>] [--do=<step>]... [--read-only] [--gif] [--video] [--probe] [--inspect=<selector>] [--shifts] [--layout-diff] [--throttle]` — the top of that file documents every option. Steps (`--do=click:text=Results`, `hover:`, `focus:`, `press:Tab`, `scroll:600`, `scrollto:`, `wait:`, `shot`) run in order before the shot. `--gif` loops the frames, the best evidence for anything that moves. `--layout-diff` prints what moved and whether the page scrolled because of the last click. `--video` records everything slowed down (use with `--throttle` for load shifts).
  - **`--tiles`** cuts the whole page into viewport sized pictures. Read a long page that way: a full-page screenshot is shrunk until nothing small can be seen.
  - **`--inspect=<selector>`** prints the numbers of the matching elements: box, text box, font, padding, margin, gap, overflow. **A finding that claims pixels ("4px off", "13px instead of 14") quotes them from here**, not from looking at a picture.
  - **`--read-only`** lets no write out of the page, so with it you may click anything: a button that would save, delete or send is cut off at the network. Use it to open what the sweep's steps open, and to get at validation messages (submit an empty form).
- **One component across pages**: `node .claude/skills/polish/scripts/montage.mjs --selector=<selector> --out=<png> <url> <url>...` (or `--module=<its CSS module file>` for the pages the sweep saw it on) puts its crops into one picture with their sizes. The way to see whether a header, a card or a table is the same everywhere.
- For anything the CLI can't express, write a short `.mjs` next to the scripts' `lib.mjs` conventions in your scratch folder `{{RUN_DIR}}/scratch-{{REVIEWER}}/` importing `/Users/kalle/Developer/sendou.ink/.claude/skills/polish/scripts/lib.mjs` (`launchBrowser`, `openSession`, `visit`, `settle`, `shootMarked`, `makeFlickerGif`).
- **Finding the source**: class names in the build read `_name_hash` (e.g. `_ownerLink_1d649_201` is `.ownerLink` of a `*.module.css`). `grep -rn "\.ownerLink" app --include="*.module.css"` leads to the file; the component next to it uses `styles.ownerLink`. Shared components live in `app/components/`, feature ones in `app/features/<feature>/`.

## How to work

1. **Give every mechanical finding of your area a verdict.** For each: look at the evidence image. Is it
   - `real`: a defect, whether or not you write it up,
   - `intentional`: there, and meant to be (a bracket that scrolls sideways inside its own container, secondary text that is dim on purpose, a chat that scrolls inside the page),
   - `probe-mistake`: not there, the probe misread the page (say what it misread: that becomes a self-test case),
   - `not-reproduced`: you tried and could not see it?

   When unsure, reproduce it with `shoot.mjs` (the digest's `steps:` are `--do=` arguments). Do not pass a finding on unless you have looked at an image showing it. Merge findings with one cause into one (the same button on forty pages is one finding, name the component). A rule that fires on nearly everything (no press feedback on any link, one off-token size used site-wide) is one finding about the system, with a guardrail, not a list.
2. **Then look yourself**, one lens at a time rather than everything at once per page: (a) text: wrapping, truncation, what long content does; (b) alignment and spacing: edges, baselines, gaps between sibling sections; (c) consistency: the same component and the same kind of page side by side (`montage.mjs`, the census); (d) states: what opens, what a click changes, empty and error states. Open every page of your area at desktop and mobile (stress pages first, both themes for anything colourful, `--tiles` for long pages), and interact: open tabs, menus, popovers, dialogs, selects; hover rows and cards; scroll down and click a tab or filter with `--layout-diff`; navigate between sibling pages and watch the header and sub navigation. With `--read-only` any button may be clicked; without it never submit a form or press a button that saves, deletes, joins, votes or sends.
3. **Evidence for every finding**: a tight screenshot with the element marked (`--mark`, `--crop`), or a GIF for anything that moves or changes. Save evidence as `{{RUN_DIR}}/media/{{REVIEWER}}-<nn>-<slug>.png|gif`. Reuse the sweep's evidence file when it already shows the problem well. Look at your own evidence before listing it: if the problem isn't visible in the picture, retake it. A claim in pixels carries its `--inspect` numbers in the explanation.
4. Quality over quantity in what you write up: at most about {{MAX_FINDINGS}} findings, the ones a maintainer would actually fix. What is real and did not make the cut still gets its `real` verdict (the report lists it as backlog), so nothing is lost by leaving it out. Leave out anything you are not confident is a defect; mention doubtful patterns in your final message instead.

## Severity

- `high`: broken looking or blocks use — text unreadable or overlapping, layout shift on a common action, page scrolls sideways on mobile, content cut off with no way to read it.
- `medium`: clearly unpolished to anyone who looks — a missing hover state on a main control, a visible jump, off-center icon, ugly wrapping with realistic content.
- `low`: only at extremes or small — a max-length-only overflow, a 1-2px misalignment, AA contrast misses on secondary text.

## Output

Write `{{RUN_DIR}}/reviewed/{{REVIEWER}}.json`, an array of:

```json
{
	"title": "Team name overflows the roster card on mobile",
	"rule": "text-spill",
	"severity": "medium",
	"explanation": "Two or three sentences for the maintainer: what is wrong, when it happens (which content, viewport, theme), and why it is a defect and not a choice.",
	"url": "/t/some-team",
	"viewport": "mobile",
	"theme": "dark",
	"viewer": 274,
	"pages": ["/t/some-team", "/t/other-team/roster"],
	"media": ["media/{{REVIEWER}}-01-team-name-overflow.png"],
	"source": "app/features/team/components/TeamRoster.module.css `.name`",
	"fix": "One line, only when you looked at the CSS and it is evident (e.g. `min-width: 0` on the flex child plus `text-overflow: ellipsis`).",
	"mechanical": ["m12", "m40"],
	"cause": "flex child without min-width",
	"guardrail": "Only when one comes to mind: what would keep the whole class out (a lint rule, a prop of the shared component, a utility class)."
}
```

`mechanical` lists the mechanical findings this one was written from (leave it out for what you found by eye). `cause` is a few words shared, letter for letter, by every finding of yours with the same root cause: the report groups by it. Reuse the causes below when they fit, they are the ones earlier runs found:

- `flex child without min-width` (a long name widens its row)
- `nowrap without ellipsis`
- `layout decided in JS` (differs between the server's HTML and the hydrated page)
- `date rendered after hydration`
- `status color used as text`
- `missing hover style`, `missing active style`
- `size off the design tokens`

`rule` is the mechanical rule the finding came from (the digest's section name), or for what you found by eye one of `wrapping`, `truncation`, `alignment`, `spacing`, `consistency`, `other`. `media` paths are relative to the run folder. `steps` (optional, `["click:<selector>"]`) are what has to be done on the page before the defect shows. Write a tag you mention in prose inside backticks (`<a>`, `<details>`).

Next to it write `{{RUN_DIR}}/reviewed/{{REVIEWER}}.triage.json`, a verdict for every mechanical finding of your area that is not in a `mechanical` list above (those are `real` already):

```json
[
	{ "id": "m17", "verdict": "intentional", "note": "the bracket scrolls inside its own container" },
	{ "id": "m18", "verdict": "probe-mistake", "note": "the text is in a marquee, cut by its window on purpose" },
	{ "id": "m21", "verdict": "real", "note": "same cause as m12, smaller: not written up" },
	{ "id": "m22", "verdict": "not-reproduced", "note": "tried three loads" }
]
```

The verdicts are kept: the next run does not ask about a finding again, and a probe mistake's note becomes the test case that fixes the probe. Be as careful with them as with a finding.

Next to it write `{{RUN_DIR}}/reviewed/{{REVIEWER}}.notes.json`, the record of what this review covered. It goes into the report's "What was audited", "Not audited" and "Needs a decision" sections and decides what a later audit looks at, so be specific and only claim what you did:

```json
{
	"area": "Users, teams and settings",
	"lookedAt": ["All 52 pages of the area at mobile and desktop", "Keyboard focus rings on buttons, tabs and selects", "Tabs switched while scrolled down on the team page"],
	"notCovered": ["Trophy 3D models: still loading in the screenshots", "The notifications popover on mobile"],
	"needsDecision": ["The minimal user's main column is empty on desktop, leaving a hole on the left: collapse the grid?"],
	"probeMistakes": ["text-overlap on an inline link that wraps onto two lines"]
}
```

Validate all three files parse (`node -e "JSON.parse(require('fs').readFileSync('…'))"`), and that `node .claude/skills/polish/scripts/verdicts.mjs --run={{RUN}}` lists no problem with yours.

## Your final message (all the orchestrator sees)

- How many mechanical findings you gave a verdict: real / intentional / probe mistake / not reproduced, how many are left without one and why — and for probe mistakes, the pattern (so the probe can be fixed)
- How many findings you wrote, and the three that matter most
- Pages of your area you could not reach or that errored
- Anything that needs a human decision (a design choice that might be deliberate)

The last three are also in your notes file; the message is the short version.
