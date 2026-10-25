# Dev tools

A toolbar along the bottom of every page on the dev server, plus a CLI talking to the same API. Code lives in `app/features/dev-tools`.

## Toolbar

Hide it with the `–` button or `Alt+Shift+D` (it remembers), `Esc` closes the open window. The apps, left to right:

| App | What for |
| --- | --- |
| **Scenarios** | Builds a ready state (a SendouQ match waiting on you, a tournament you organize in any format and stage, a scrim request...) out of fresh users and logs you in as one of them. Parameters are remembered per scenario, the copy button gives the equivalent CLI command. Turn off "Log in as its user" to only open the page as yourself. |
| **Identity** | Who you are (roles, plus tier, impersonation), one click to the seeded users with special ids, users recent scenarios created, and a search to log in as anyone. Its icon is your avatar. |
| **Page** | *Loader data*: every matched route's data as a tree with its size, route file opens in your editor. *Permissions*: every `permissions` object in the loader data with who holds each permission, and your global roles. *URL & storage*: the search params with their decoded value and whether they decode, params no definition declares, and web storage entries with the persisted state definition owning them. |
| **Requests** | The latest 100 requests with each one's SQL. `×N` marks a statement run N times in one request, an N+1 suspect. |
| **Live events** | What the server pushed down this tab's event stream, the connection state and subscribed topics. "Ping me" round-trips an event through the whole pipeline. |
| **Warnings** | Console errors & warnings, uncaught errors and hydration mismatches since the page loaded, deduplicated. Also the dev server's console errors & warnings (loader and action errors included) with the request they happened in. The badge counts them. |
| **Server** | Which database file is in use, the in-memory switches (season ended, plus voting active), refreshing the caches, reseeding and running any routine now. |
| **Triggers** | Toasts, error pages (each status, a render crash) and a sample notification of any type to yourself. |
| **Links** | The local docs site (`pnpm run dev:docs`) and the dev only pages (OG images, changelog image, bracket test...). |

## CLI

Needs the dev server running. The server is found from `--url=...`, `DEV_SERVER_URL` or `PORT` (default 5173).

```bash
pnpm run dev:tools scenarios                     # list, with parameters
pnpm run dev:tools scenario tournament-organizer --teams=16 --format=swiss
pnpm run dev:tools requests 10                   # latest requests with query counts
pnpm run dev:tools request 42                    # every query of one request
pnpm run dev:tools log-in-as 274 /admin          # link that logs in as user 274
pnpm run dev:tools server                        # database, switches, routines
pnpm run dev:tools switch seasonEnded on
pnpm run dev:tools routine NotifyCheckInStart
pnpm run dev:tools refresh-caches
```

A scenario prints a link that logs in as its user and opens its page, so it works for a person and for an agent driving a browser alike.

## Safety

None of this exists in production, and nothing in it can reach production users:

- **Compiled out.** The toolbar is a lazy import behind `import.meta.env.DEV`. The server reaches the dev tools only through `dev-tools-server-hooks.server.ts` (request & query recording, server console capture), which `vite.config.ts` swaps for a `null` stub in production builds (e2e runs included), as a `false` flag alone still leaves the imported modules in the bundle. The search params and storage registries and push suppression sit behind `IS_DEV_BUILD`. The `/dev/*` routes are only registered when `NODE_ENV=development` (`routes.test.ts` checks).
- **Locked twice.** Every dev tools loader and action starts with `requireDevTools()`: a 404 outside a dev build, and a 403 for a request another site's page made the browser send (`Sec-Fetch-Site`). The dev server listens on localhost, which any open tab can reach.
- **No web pushes.** Scenarios, routines and reseeding run under `runWithoutWebPush`, and notifications from the Triggers app are written in-app only. Even on a copy of production data with real VAPID keys no real device gets a push.
- **Reseed only `db.sqlite3`.** It wipes every row, so the sandbox, snapshot or any other file is refused.
- **Fresh users only.** Scenarios create their own users (with Discord ids that can't collide with seeded ones) and never touch existing rows.

Note that `pnpm run dev` listens on your network too (`--host`), so others on the same network can use these tools, as they already could use `/auth/impersonate` in development.

## Adding a scenario

Add a `defineScenario` entry to `SCENARIOS` in `core/Scenarios.server.ts`. It composes factories (`app/db/seed/factories`) and returns who to log in as and where to land. Build it from fresh users (`freshUserIds`) so it works on any database state. Declare parameters with `numberParam` / `selectParam`: the toolbar renders inputs for them, the CLI accepts them as `--key=value` and `run` receives them typed. The unit test runs every scenario with its defaults and every select option against an empty database.

## Adding an app

Each app is one file under `components/apps/` exporting a `DevApp` (`dev-tools-types.ts`): its title, icon, window size and component, optionally a `badge` on the bar icon (`DevBadge` / `DevStatusDot`) and an `install` hook that runs when the toolbar mounts, for recording that has to start before the app is first opened. List it in `APP_GROUPS` of `components/DevToolbar.tsx`, the bar has no app specific code, so removing an app is deleting its file and its entry there. Build it from the site's own components (`SendouSection`, `SendouButton`, `SendouSwitch`, `Input`, `Table`, `Alert`...) and theme tokens; the toolbar's root forces them dark and grey (`data-theme="dark"`, `data-default-theme` and zeroed base chroma, see `ThemedRoot`), which is what sets it apart from the page. `components/DevUi.tsx` only holds what the site has no component for (status chips, copy and open-in-editor buttons). Server data comes from a `/dev/*` resource route (register it in the dev only part of `routes.ts`) starting with `requireDevTools(request)`.
