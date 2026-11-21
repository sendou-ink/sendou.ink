# Polish audit log

What every run of the polish skill covered, and what no run has looked at yet. Read it before choosing a scope, update it after every run (step 7 of [SKILL.md](SKILL.md)). The run folders with the findings and evidence are local (`scripts/output/polish/<run>/`, not in the repo); this file is what survives them.

## Audited so far

| Dimension | Covered | By run |
| --- | --- | --- |
| Pages | 165 pages over 109 of the 134 page routes, every feature folder with a page | 2026-11-21 |
| Viewports | mobile 375x812, desktop 1440x900. The shell alone also at 320px and 600-999px by hand | 2026-11-21 |
| Themes | dark for every rule, light for contrast (plus spot checks by the reviewers) | 2026-11-21 |
| Viewed as | the admin (274) for every page, the participant for the content stress pages that need one | 2026-11-21 |
| Language | English | 2026-11-21 |
| Data | dev seed plus content stress: 76 pages with user text and counts at the form limits, in an unbroken and a words shape, plus a minimal user, team and org | 2026-11-21 |
| Rules | all of the table in SKILL.md, and by eye: wrapping, alignment, spacing, truncation | 2026-11-21 |
| Motion | load shift (throttled, logged in), tabs / disclosures / in-section links clicked, browser back, sub navigation between sibling pages, header menus, the search dialog | 2026-11-21 |

## Never audited

Roughly by how much a first look is likely to find. Strike an item when a run covers it, with the run's name. Since the tooling change of 2026-11-21 (below) most of these have a pass or a flag that covers them: none has been through a reviewed run yet.

1. **Logged out visitors and a regular user without roles.** Most visitors are one of the two, and pages differ for them (log in prompts instead of controls, no admin tabs, no side navigation content). How: `crawl.mjs --as=anon` and `--as=regular`, then `sweep.mjs --as=admin,anon,regular`.
2. **The inside of things that open, and what a click changes.** Dialogs, popovers, menus, the mobile navigation panels, sections a button reveals. How: the `explore` pass clicks every control with writes blocked and probes what opens. What a hover reveals inside a menu and anything that needs typing first (search results) is still by hand.
3. **Form states.** Validation errors (the explore pass submits forms as they are, so the client's messages show), a pending submit, disabled states, long values in every input, the forms of the `new` and `edit` routes filled in rather than empty. The filled-in and pending states need the e2e hook (`POLISH_RUN=<name> pnpm run test:e2e`) or a hand.
4. **States a seed never leaves a page in.** `states.ts` builds 33 with the dev tools' scenarios (SendouQ match states, tournaments of each format before, during and after, lobbies, a new and a banned user). Not there yet: a team without members' data, lists with nothing in them, a tournament during check-in, the broadcast pages.
5. **The widths between the viewports.** How: the `widths` pass (320 to 1920, the overflow, wrapping and squashing probes only). The full passes at `--viewports=tablet,wide` have not run.
6. **Other languages.** How: `sweep.mjs --lang=longest` (the language whose translations are longest overall, Spanish today), `--lang=he` for right-to-left, `--lang=ja` for CJK.
7. **After a write, and without anyone acting.** Toasts, saved states, a match being reported, chat arriving. How: the e2e hook sees every page a test opens, each time it comes to rest.
8. **Light theme for every rule, and custom themes.** Layout does not depend on the theme, but images, charts, borders and the patron custom themes do: an extreme custom theme (UserFactory `customTheme`) against the contrast probe is cheap once someone writes one that is valid.
9. **Production-like data.** Real names, real tournament sizes, 10 years of results: `POLISH_DB=db-sandbox.sqlite3` for the server and the crawl (untried: the e2e flavour uses the test season list).
10. **The routes no page was found for**: `/q`, `/q/preparing`, `/q/ready`, `/plus`, `/suspended`, `/feed/:id`, `/player/:id`, `/to/:id/brackets/finalize`, the four `/to/:id/broadcast/:channel…` pages. Most need a state: a line in `states.ts` with the right viewer. And everything under `/admin`, left out on purpose (`crawl.mjs --include-admin`).
11. **Content stress gaps**: a SendouQ group that is not full (full ones hide their notes), private user notes, mod notes, scrim request messages, tournament LFG notes, user badges at their maximum, trophies, broadcast headlines, team themes, pictures of extreme shapes (very tall, very wide, transparent), counts in the thousands. Names in other scripts sit on five users and one roster only. Extend `scripts/polish/stress.ts`.
12. **Keyboard beyond the focus ring**: the Tab walk finds stops that are hidden or under a bar; focus order, focus lost after an action, overlays handing focus back and arrow keys in menus are still by hand.
13. **The shared components in every state**: the docs site's component showcase (`pnpm run dev:docs`, `sweep.mjs --plain --urls=…` with `POLISH_BASE_URL`), where disabled, loading and error variants all sit on a page.
14. **Reduced motion, 200% text size, ad slots** (the dev server's Triggers app simulates the ads) **and no JavaScript** (one finding on 2026-11-21: no theme without JS).

## Runs

### 2026-11-21 — whole site, first run

- **Scope:** every page the crawl found, mobile and desktop, all four passes. 15 minutes of sweep on 8 workers, 440 mechanical findings, six reviewers (tournaments, play, users & teams, tools & content, shell + hover/contrast, motion) on Opus.
- **Result:** 81 findings (14 high, 39 medium, 28 low) in `scripts/output/polish/2026-11-21/findings.md`.
- **What it showed:**
  - layout decided in JS shifts on hydration: tab orientation from `useMainContentWidth` (settings, tournament admin), the tournament sub navigation overflow, header activity icons
  - dates and times are blank until hydration (`useDateTimeFormat`), so everything sized by one moves
  - long unbreakable names scroll the page sideways on mobile in about a dozen components, most often a flex or grid child without `min-width: 0` (notifications, friends, tournament nav, team header, UserCard trigger, LFG pill)
  - light theme status colors fail contrast as text (`--color-success`, `--color-warning`, `--color-error`), dark theme secondary text on raised surfaces is 3.77:1
  - plain links and several shared components have no hover state
- **Probe mistakes found and fixed after the run** (so the next sweep reports fewer false ones): light theme contrast measured mid transition, wrapped inline text as overlap, legends as spill, hover feedback shown in a sibling, pages scrolled sideways before a click, the hiding mobile header, summaries holding a link, 403s from a viewer without the page's permission.
- **Not covered:** everything under "Never audited" above; this run struck nothing from it.
