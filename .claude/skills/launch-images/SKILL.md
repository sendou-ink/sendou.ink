---
name: launch-images
description: Make Bluesky launch images for a new sendou.ink feature in the OG image style, picked from a set of templates (changelog text card, "how it works" timeline from real dev-server screenshots, ...) or a new template when none fits. Use when asked for launch pictures, announcement/social images, or a Bluesky post graphic for a feature.
---

# Launch images

Social images for a feature launch, rendered with the site's own fonts and theme on top of the dev server's `/admin/og-images` page, in the OG image look (nav icon, dashed ring, offset shadows, ink blobs).

The images come from **templates** in `scripts/templates/`. A launch is one config JSON listing the images to make, each naming its template. `scripts/build.mjs` renders them, `scripts/capture.mjs` takes the raw screenshots, `example-config.json` is the lobbies launch (a changelog card plus a timeline), a complete reference.

## Templates

| Template | What it is | Fits when |
| --- | --- | --- |
| `changelog-card` | 1200x675 card: nav icon in the OG ring, "NEW" pill, title, headline, bullets | there is a changelog entry with bullets, the "what's new" picture. Fits almost every launch, usually as the first image |
| `timeline` | 1200 wide, as tall as its content: "How X works", numbered steps down a dashed line, each with a heading, a line of text and screenshot crops in a tilted frame | the feature is a flow the user goes through in order (sign up, play, results...). 3-5 steps |

### Picking

Decide from the feature and what the user asked for:

- Read the changelog entry and the feature first: is it a flow, a single screen, a before/after, a list of small improvements?
- Use the templates that obviously fit. The user asked for "two pics only" on the lobbies launch, so default to at most two images (Bluesky shows up to four, but each extra one dilutes the post)
- If no template is an obvious fit (e.g. a before/after comparison, a single hero screenshot with callouts, a grid of several small features), **don't force one**: describe the new template you would make to the user in a sentence or two and ask before building it. Mention the closest existing template as the alternative

### Adding a template

1. Create `scripts/templates/<name>.mjs` exporting an object with:
   - `html(data, ctx)`: the inside of the canvas. `data` is the config's image entry, `ctx` has `iconSrc`, `shotDataUri(shot)` and `shotCssWidth(shot)`
   - `css`: styles scoped under `.<name>`, the canvas root gets that class (plus `.cv`). Set the canvas `width` (1200px, so it renders 2000px wide) and a fixed `height` unless it grows with content
   - `altText(data)`: the image described in prose, for `alt-texts.txt`
2. Register it in `scripts/templates/index.mjs`
3. Reuse `shared.mjs` (`BASE_CSS`, `boldMarkdown`, `stripBold`, `stripHtml`) and the color variables `--accent`, `--second` and `--text-soft`; keep the OG look and the style rules below
4. Add a row to the table above, so the next launch knows when to pick it

## Workflow

### 1. Gather the text

- The changelog entry in `changelog/*.md` is the source. Keep its wording verbatim; for `changelog-card` only split the headline into a short `title` (usually the feature name) plus `headline` so the name isn't repeated
- Read the feature readme (`docs/site/src/content/feature-readmes/<feature>.mdx`) and the code to get the user flow right. Check claims you put on an image against the code (e.g. "maps come from players' preferences" was verified in `LobbyMapList.server.ts` before it went in)
- If the user asks for a bullet that isn't in the changelog yet, add it to the changelog entry too. Bullets support `**bold**`: the update graphic renders it, the alt text strips it

### 2. Pre-flight (templates with screenshots)

- Dev server running from **this** checkout: `lsof -iTCP:$PORT -sTCP:LISTEN` (PORT from `.env`), check its cwd. Every template needs it, it provides the fonts, theme and nav icon
- Dev DB migrated: compare `sqlite3 db.sqlite3 "select name from kysely_migration order by name desc limit 3"` with `ls migrations | tail -3`; if behind, `pnpm run migrate up` (a stale DB makes scenarios 500)

### 3. Build the states and capture

- Prefer `pnpm run dev:tools scenarios` / `scenario <id> --param=...`, which prints a log-in link that lands on the page as the right user
- Make the data look real, on `db.sqlite3` only (never the sandbox/snapshot): rename `Dev 8s mvv36…`-style names to something human ("Friday Night 8s"), randomize results the scenario made lopsided (e.g. the host winning every set), give a showcase user profile widgets via `UserWidget` rows / result rows. Tell the user what was changed in their dev DB
- Capture: `node .claude/skills/launch-images/scripts/capture.mjs "<log-in link>" <scratchpad>/shots/<name>.png [--tab=Rankings] [--selector=main] [--width=1100]`. It shoots the element at 2x, hides the dev toolbar and can click a tab first
- `Read` every capture before using it

### 4. Write the config and render

Put the config next to the shots in the scratchpad (shot paths resolve relative to the config), then:

```bash
node .claude/skills/launch-images/scripts/build.mjs <scratchpad>/config.json
```

Top level:

- `slug`: output file prefix. `out`: output folder relative to the repo root, use `scripts/output/<slug>-launch` (gitignored)
- `page`: the OG page / nav icon name. Colors come from its `PAGE_COLORS` entry in `app/features/admin/routes/og-images.tsx` (`accent` = ring, icon and picture shadows, `second` = NEW pill, timeline line, nodes and highlight). Override with `"colors": { "accent": "pink", "second": "cyan" }`; `navItem` overrides the icon
- `images[]`: one entry per image, `template` plus that template's fields; `name` overrides the file name suffix (default: the template name), files are `<slug>-<name>.png`

`changelog-card` fields: `kicker` (default `NEW`), `title`, `headline`, `bullets`.

`timeline` fields: `wordmark` (e.g. `sendou.ink · Lobbies`), `title`, `steps[]` of `title`, `text`, `alt` (screenshot description for the alt text) and `crops[]`:

- a crop is `{ shot, top, height, highlight? }` in **CSS px of the capture** (PNG pixels / 2). Several crops stack in one frame with a dashed divider, good for "before / after" pairs. `highlight: { x, y, w, h }` (same coordinates) draws a dashed box around what the step is about
- use `&#8209;` (non-breaking hyphen) in titles like "best&#8209;of" so they don't break at the hyphen

The script prints each image's size and warns above 1 MB. It also writes `alt-texts.txt` next to the images.

### 5. Review and iterate

`Read` every output every round. Typical fixes:

- a crop cutting through text or a table row: adjust `top`/`height`
- a timeline step much taller than its neighbours: shorten its text or crop
- an image over 1 MB: trim crops or steps. Don't resize with `sips`, it writes uncompressed PNGs that come out bigger

## Style rules the maintainer has asked for

- Grey text has to stay readable: use `--text-soft` (mostly `--color-text`), not `--color-text-high`
- Few colors: one color (`second`) for timeline line, nodes and highlights; picture shadows stay `accent`. No per-step rainbow
- As few pictures as tell the story: the lobbies launch was a card and one timeline, not separate per-step images
- Bluesky: 1 MB per image, displays at most 2000px wide (hence the 5/3 device scale on 1200px canvases); a multi-image post crops them in the feed, so tall images are seen in full only when tapped

## Gotchas

- The site's `body` is `display: flex`, which shrinks fixed-width canvases laid side by side; `BASE_CSS` resets it, keep that
- Element screenshots of canvases below the fold came out with black strips; `build.mjs` shows one canvas at a time and clips from the top of the page instead
- The weapon pool widget showed broken images on a dev profile; pick widgets that render, and check the capture
