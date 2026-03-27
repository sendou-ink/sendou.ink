# React Router → TanStack Start Migration Plan

IMPORTANT: /app contains the old react-router app code. This is just for reference and not to be modified. /src is what we are migrating. Typechecks etc. won't pass yet so don't worry about that.

## Decisions Summary

| Decision | Choice |
|---|---|
| Migration strategy | Big bang on a branch, feature dev frozen on main |
| Auth | Roll our own with TanStack Start middleware (no better-auth) |
| Server caching | Keep `@epic-web/cachified` + add react-query for client |
| Public API routes | TanStack Start server routes with shared middleware |
| i18n | Keep i18next/react-i18next, replace only the glue |
| File routing | Directory routes for all |
| `urls.ts` | Slim to ~100-150 lines (external URLs, asset URLs, param helpers) |
| Forms | Keep SendouForm, change submit handler from useFetcher to server functions |
| useFetcher replacement | `useMutation` (POST) or `useQuery` (GET) from react-query |
| Single-flight mutations | Adopt broadly — build middleware once, use everywhere |
| Client-only routes | `ssr: false` on routes that are currently client-only |
| Scheduled routines | Keep in web server process |
| RSC | Not needed |
| E2E tests | Don't touch during migration, use as acceptance criteria |

---

## Migration Order

1. Scaffold (TanStack Start config, root route, router, react-query provider)
2. Infrastructure (auth middleware, i18n middleware, single-flight mutation middleware, theme/session)
3. Simple static pages (`/faq`, `/contributions`, `/privacy-policy`, `/support`)
4. Simple loader-only pages (`/leaderboards`, `/links`, `/badges`, articles)
5. Search-param-heavy pages (`/xsearch`, `/vods`, `/builds`)
6. Mutation-heavy pages (settings, user edit, team management)
7. Complex nested routes (tournaments, user pages, SendouQ)
8. Client-only routes (`/plans`, `/analyzer`, `/tier-list-maker`, `/object-damage-calculator`)
9. Public API server routes
10. SendouForm useFetcher → server function migration
11. SWR → react-query (3 hooks)
12. Cleanup (delete url constants, remove remix deps, slim package.json)

---

## Dependencies: Remove / Add

### Remove
- `react-router`, `@react-router/node`, `@react-router/dev`, `@react-router/serve`
- `remix-auth`, `remix-auth-oauth2`
- `remix-i18next`
- `swr`

### Add
- `@tanstack/react-start`
- `@tanstack/react-router`
- `@tanstack/react-query`
- `@tanstack/react-router-ssr-query` (handles dehydration/hydration/streaming automatically)
- `@tanstack/zod-adapter` (required for Zod schema validation in `inputValidator` and `validateSearch`)
- `@tanstack/react-query-devtools` (optional, dev only)

### Keep
- `react`, `react-dom` (v19)
- `i18next`, `react-i18next`, `i18next-http-backend`
- `@epic-web/cachified`, `lru-cache`
- `kysely`, `better-sqlite3`
- `zod`
- `clsx`, `remeda`, `date-fns`
- All UI libraries (react-aria-components, lucide-react, react-charts)
- `partysocket`, `web-push`, `node-cron`

---

## Step 1: Scaffold

### vite.config.ts

```ts
// OLD
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import babel from "vite-plugin-babel";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      reactRouter(),
      babel({ /* react-compiler config */ }),
      tsconfigPaths(),
    ],
  };
});

// NEW
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    resolve: {
      tsconfigPaths: true, // built-in, replaces vite-tsconfig-paths plugin
    },
    plugins: [
      tanstackStart(),
      viteReact(), // MUST come after tanstackStart
      // css-modules-layer plugin stays the same
    ],
  };
});
```

// CLAUDETODO: well we do want react compiler, investigate what is needed to hve it
> Note: `babel-plugin-react-compiler` is replaced by `viteReact()` which supports React Compiler natively via its `babel` option if needed. `vite-tsconfig-paths` is replaced by Vite's built-in `resolve.tsconfigPaths: true`. Package.json must have `"type": "module"`. Production build output is at `.output/server/index.mjs` (uses Nitro under the hood).

### Router setup: `src/router.tsx`

```ts
// NEW — does not exist in old codebase
import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute default
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0, // let react-query manage cache freshness
    scrollRestoration: true,
  });

  // Handles dehydration, hydration, streaming, and QueryClientProvider wrapping automatically.
  // A fresh QueryClient is created per request in SSR to avoid cross-request data contamination.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

> Note: `setupRouterSsrQueryIntegration` from `@tanstack/react-router-ssr-query` replaces the manual `dehydrate`/`hydrate`/`Wrap` pattern. It automatically wraps the router with `QueryClientProvider`, handles SSR dehydration, and streams queries that resolve during rendering to the client.

### Root route: `src/routes/__root.tsx`

```ts
// OLD: app/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = getUser();
  const locale = await i18next.getLocale(request);
  // ...
  return data({ locale, theme, user, notifications, sidebar });
};
export default function App() {
  const data = useLoaderData<RootLoaderData>();
  return (
    <ThemeProvider specifiedTheme={data.theme}>
      <Document data={data}>
        <Outlet />
      </Document>
    </ThemeProvider>
  );
}

// NEW: src/routes/__root.tsx
import { createRootRouteWithContext, Outlet, HeadContent, Scripts, ScriptOnce } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
  user: AuthenticatedUser | undefined;
  locale: string;
  theme: string | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "initial-scale=1, viewport-fit=cover, user-scalable=no" },
      { title: "sendou.ink" },
      { name: "theme-color", content: "#010115" },
    ],
    links: [
      { rel: "manifest", href: "/app.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      // ... fonts, PWA links
    ],
  }),
  beforeLoad: async () => {
    // auth + locale + theme resolved via server middleware (see Step 2)
    // context is injected by middleware, not loaded here
  },
  component: RootComponent,
  errorComponent: RootErrorComponent,
});

function RootComponent() {
  const { user, locale, theme } = Route.useRouteContext();
  return (
    <ThemeProvider specifiedTheme={theme} themeSource="user-preference">
      <html lang={locale}>
        <head>
          <HeadContent />
        </head>
        <body>
          {/* ScriptOnce runs before hydration — useful for theme flicker prevention */}
          <ScriptOnce children={getThemeDetectionScript(theme)} />
          <Document locale={locale} user={user}>
            <Outlet />
          </Document>
          <Scripts />
        </body>
      </html>
    </ThemeProvider>
  );
}
```

> Note: `HeadContent` renders accumulated `<head>` tags from all matched routes. `Scripts` renders hydration scripts. `ScriptOnce` from `@tanstack/react-router` runs a script once before hydration (useful for theme detection to prevent flash of wrong theme).

### Entry files

```ts
// OLD: app/entry.server.tsx — 129 lines of custom SSR piping
// OLD: app/entry.client.tsx — 35 lines of manual hydration

// NEW: TanStack Start handles entry automatically via conventions:
//   src/server.ts   — server entry (optional, for cron jobs — see Step 2)
//   src/client.tsx   — client entry (optional, auto-handled if not provided)
//   src/start.ts    — global middleware + TanStack Start configuration (see below)
// Cron jobs move to src/server.ts (see Step 2).
// Session ID header injection moves to router middleware or a query client default.
// i18n initialization moves to router Wrap or root beforeLoad.
```

### Global middleware: `src/start.ts`

```ts
// NEW: src/start.ts — global middleware configuration
import { createStart, createMiddleware } from "@tanstack/react-start";

// Optional: global request middleware that runs for ALL requests (SSR, server routes, server functions)
const requestLoggerMiddleware = createMiddleware().server(
  ({ next, request }) => {
    console.log(`[${request.method}] ${request.url}`);
    return next();
  },
);

export const startInstance = createStart(() => ({
  // requestMiddleware: [requestLoggerMiddleware], // uncomment if needed
  // functionMiddleware: [],  // runs for ALL server functions
}));
```

---

## Step 2: Infrastructure

### Auth middleware

```ts
// OLD: app/features/auth/core/user-context.server.ts
// Uses AsyncLocalStorage to propagate user context
export const userAsyncLocalStorage = new AsyncLocalStorage<UserContext>();
export function getUserContext(): UserContext {
  const context = userAsyncLocalStorage.getStore();
  if (!context) throw new Error("getUserContext called outside of user middleware context");
  return context;
}

// OLD: app/features/auth/core/user.server.ts
export function getUser(): AuthenticatedUser | undefined {
  const context = getUserContext();
  return context.user;
}
export function requireUser(): AuthenticatedUser {
  const user = getUser();
  if (!user) throw new Response(null, { status: 401 });
  return user;
}

// NEW: src/middleware/auth.ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { authSessionStorage } from "~/features/auth/core/session.server";
import { SESSION_KEY, IMPERSONATED_SESSION_KEY } from "~/features/auth/core/authenticator.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { redirect } from "@tanstack/react-router";

export const authMiddleware = createMiddleware({ type: "function" })
  .server(async ({ next }) => {
    const cookieHeader = getRequestHeader("Cookie") ?? "";
    const session = await authSessionStorage.getSession(cookieHeader);

    const userId = session.get(IMPERSONATED_SESSION_KEY) ?? session.get(SESSION_KEY);
    const user = userId ? await UserRepository.findLeanById(userId) : undefined;

    return next({ context: { user } });
  });

export const requireAuthMiddleware = createMiddleware({ type: "function" })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (!context.user) {
      throw redirect({ to: "/auth" });
    }
    return next({ context: { user: context.user } });
  });
```

### i18n middleware

```ts
// OLD: app/modules/i18n/i18next.server.ts
import { RemixI18Next } from "remix-i18next/server";
export const i18next = new RemixI18Next({
  detection: { cookie: i18nCookie, supportedLanguages: config.supportedLngs, fallbackLanguage: config.fallbackLng },
  i18next: { ...config, resources },
});

// OLD: app/entry.server.tsx — per-request i18n init
const instance = createInstance();
const lng = await i18next.getLocale(request);
const ns = i18next.getRouteNamespaces(reactRouterContext);
await instance.use(initReactI18next).init({ ...config, lng, ns, resources });

// NEW: src/middleware/i18n.ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { parseCookies } from "~/utils/cookies";
import { DEFAULT_LANGUAGE, config } from "~/modules/i18n/config";

export const i18nMiddleware = createMiddleware({ type: "function" })
  .server(async ({ next }) => {
    const cookieHeader = getRequestHeader("Cookie") ?? "";
    const cookies = parseCookies(cookieHeader);
    const locale = cookies.i18n ?? DEFAULT_LANGUAGE;

    // Validate locale is supported
    const validLocale = config.supportedLngs.includes(locale)
      ? locale
      : DEFAULT_LANGUAGE;

    return next({ context: { locale: validLocale } });
  });
```

### Discord OAuth (no more remix-auth)

```ts
// OLD: app/features/auth/core/DiscordStrategy.server.ts
import { OAuth2Strategy } from "remix-auth-oauth2";
export const DiscordStrategy = () => {
  return new OAuth2Strategy(
    { clientId, clientSecret, authorizationEndpoint, tokenEndpoint, redirectURI, scopes },
    async ({ tokens }) => {
      const [user, connections] = await fetchProfileViaDiscordApi(tokens.accessToken());
      const userFromDb = await UserRepository.upsert({ ... });
      return userFromDb.id;
    },
  );
};

// OLD: app/features/auth/routes/auth.ts
export { logInAction as action } from "~/features/auth/core/routes.server";

// NEW: src/features/auth/auth.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { authSessionStorage } from "./session.server";
import { SESSION_KEY } from "./constants";
import * as UserRepository from "~/features/user-page/UserRepository.server";

const DISCORD_AUTH_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";

export const startDiscordLogin = createServerFn({ method: "GET" })
  .handler(async () => {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      redirect_uri: `${process.env.VITE_SITE_DOMAIN}/auth/callback`,
      response_type: "code",
      scope: "identify connections email",
    });
    throw redirect({ href: `${DISCORD_AUTH_URL}?${params}` });
  });

export const handleDiscordCallback = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(z.object({ code: z.string() })))
  .handler(async ({ data }) => {
    // Exchange code for token
    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code: data.code,
        redirect_uri: `${process.env.VITE_SITE_DOMAIN}/auth/callback`,
      }),
    });
    const tokens = await tokenRes.json();

    // Fetch Discord profile + connections (existing logic stays)
    const [discordUser, connections] = await fetchProfileViaDiscordApi(tokens.access_token);
    const userFromDb = await UserRepository.upsert({ ... });

    // Set session cookie
    const session = await authSessionStorage.getSession();
    session.set(SESSION_KEY, userFromDb.id);
    const cookie = await authSessionStorage.commitSession(session);
    setResponseHeader("Set-Cookie", cookie);

    throw redirect({ to: "/" });
  });

export const logout = createServerFn({ method: "POST" })
  .handler(async () => {
    const cookieHeader = getRequestHeader("Cookie");
    const session = await authSessionStorage.getSession(cookieHeader);
    const cookie = await authSessionStorage.destroySession(session);
    setResponseHeader("Set-Cookie", cookie);
    throw redirect({ to: "/" });
  });

// NEW: src/routes/auth/callback.tsx
export const Route = createFileRoute("/auth/callback")({
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: async ({ deps }) => {
    await handleDiscordCallback({ data: { code: deps.code } });
  },
});
```

### Session storage

```ts
// OLD: app/features/auth/core/session.server.ts
import { createCookieSessionStorage } from "react-router";
export const authSessionStorage = createCookieSessionStorage({
  cookie: { name: "__session", sameSite: "lax", /* ... */ },
});

// NEW: Option A — Use TanStack Start's built-in `useSession` (recommended, simplest)
// `useSession` from `@tanstack/react-start/server` provides encrypted cookie sessions.
import { useSession } from "@tanstack/react-start/server";

type SessionData = {
  userId?: number;
  impersonatedUserId?: number;
};

export function useAppSession() {
  return useSession<SessionData>({
    name: "__session",
    password: process.env.SESSION_SECRET!, // minimum 32 characters
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    },
  });
}

// Session object returned: { id, data, update(data), clear() }
// Usage in server functions:
//   const session = await useAppSession();
//   const userId = session.data.impersonatedUserId ?? session.data.userId;
//   await session.update({ userId: newUserId });
//   await session.clear(); // for logout

// NEW: Option B — Implement a thin wrapper around `cookie` npm package or `iron-session`.
// Only needed if `useSession` doesn't fit the existing session shape.
```

### Cron jobs in server entry

```ts
// OLD: app/entry.server.tsx
if (!global.appStartSignal && process.env.NODE_ENV === "production") {
  global.appStartSignal = true;
  cron.schedule("0 */1 * * *", async () => { /* ... */ });
  cron.schedule("30 */1 * * *", async () => { /* ... */ });
  cron.schedule("0 4 * * *", async () => { /* ... */ });
  cron.schedule("*/2 * * * *", async () => { /* ... */ });
}

// NEW: src/server.ts (TanStack Start server entry)
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import cron from "node-cron";

// Start cron jobs
if (!global.appStartSignal && process.env.NODE_ENV === "production") {
  global.appStartSignal = true;
  cron.schedule("0 */1 * * *", async () => { /* same as before */ });
  cron.schedule("30 */1 * * *", async () => { /* same as before */ });
  cron.schedule("0 4 * * *", async () => { /* same as before */ });
  cron.schedule("*/2 * * * *", async () => { /* same as before */ });
}

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
```

### Single-flight mutation middleware

```ts
// NEW: src/middleware/single-flight.ts
// Based on: https://frontendmasters.com/blog/single-flight-mutations-in-tanstack-start-part-2/
import { createMiddleware } from "@tanstack/react-start";
import type { QueryClient } from "@tanstack/react-query";

// Client-side: extract active queries that need refetching
export const singleFlightMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next, context }) => {
    // Before mutation: collect active query keys from react-query cache
    const queryClient = context.queryClient as QueryClient;
    const result = await next();

    // After mutation: update query cache with refetched data from server
    if (result.context?.refetchedQueries) {
      for (const { queryKey, data } of result.context.refetchedQueries) {
        queryClient.setQueryData(queryKey, data);
      }
    }

    return result;
  })
  .server(async ({ next, data }) => {
    // Execute the mutation handler
    const result = await next();

    // Execute refetches in parallel on the server
    if (data?.refetchKeys) {
      const refetchedQueries = await Promise.all(
        data.refetchKeys.map(async (key: { queryKey: unknown[]; fn: () => Promise<unknown> }) => ({
          queryKey: key.queryKey,
          data: await key.fn(),
        })),
      );
      return next({ sendContext: { refetchedQueries } });
    }

    return result;
  });

// Usage in a mutation server function:
import { zodValidator } from "@tanstack/zod-adapter";

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware, singleFlightMiddleware])
  .inputValidator(zodValidator(userEditProfileSchema))
  .handler(async ({ data, context }) => {
    await UserRepository.updateProfile({ userId: context.user.id, ...data });
  });
```

---

## Step 3-4: Route Migration Pattern (static + simple loader pages)

### Static page (no loader)

```ts
// OLD: app/features/info/routes/faq.tsx
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";

export const handle: SendouRouteHandle = { i18n: ["faq"] };
export const meta: MetaFunction = (args) => metaTags({ title: "FAQ", location: args.location });

export default function FaqPage() {
  const { t } = useTranslation(["faq"]);
  return <Main>{/* content */}</Main>;
}

// NEW: src/routes/faq.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { Main } from "~/components/Main";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ | sendou.ink" },
      { name: "og:title", content: "FAQ | sendou.ink" },
    ],
  }),
  beforeLoad: async () => {
    await i18next.loadNamespaces(["faq"]);
  },
  component: FaqPage,
});

function FaqPage() {
  const { t } = useTranslation(["faq"]);
  return <Main>{/* content unchanged */}</Main>;
}
```

### Simple loader page

```ts
// OLD: app/features/leaderboards/routes/leaderboards.tsx
import { useLoaderData } from "react-router";
import { loader } from "../loaders/leaderboards.server";
export { loader };
export const handle: SendouRouteHandle = { i18n: ["leaderboards"] };
export const meta: MetaFunction<typeof loader> = (args) => metaTags({ title: "Leaderboards", location: args.location });

export default function LeaderboardsPage() {
  const data = useLoaderData<typeof loader>();
  return <Main>{/* uses data */}</Main>;
}

// NEW: src/routes/leaderboards.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { Main } from "~/components/Main";
import { leaderboardsQueryOptions } from "~/features/leaderboards/queries/leaderboards";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({
    meta: [{ title: "Leaderboards | sendou.ink" }],
  }),
  beforeLoad: async () => {
    await i18next.loadNamespaces(["leaderboards"]);
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(leaderboardsQueryOptions()),
  component: LeaderboardsPage,
});

function LeaderboardsPage() {
  const { data } = useSuspenseQuery(leaderboardsQueryOptions());
  return <Main>{/* uses data — same JSX as before */}</Main>;
}

// NEW: src/features/leaderboards/queries/leaderboards.ts
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import * as LeaderboardRepository from "../LeaderboardRepository.server";

const fetchLeaderboards = createServerFn({ method: "GET" })
  .handler(async () => {
    // existing loader logic moves here
    return LeaderboardRepository.findAll();
  });

export const leaderboardsQueryOptions = () =>
  queryOptions({
    queryKey: ["leaderboards"],
    queryFn: () => fetchLeaderboards(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
```

---

## Step 5: Search-param-heavy pages

### Typed search params with `validateSearch` + `loaderDeps`

```ts
// OLD: app/features/top-search/routes/xsearch.tsx
import { useLoaderData, useSearchParams } from "react-router";

export default function XSearchPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMode = searchParams.get("mode") ?? "SZ";
  // ...
}

// OLD: loader parses search params manually
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "SZ";
  const region = url.searchParams.get("region") ?? "WEST";
  return XRankPlacementRepository.findPlacementsOfMonth({ mode, region });
};

// NEW: src/routes/xsearch.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { xsearchQueryOptions } from "~/features/top-search/queries/xsearch";

const xsearchSearchSchema = z.object({
  mode: z.enum(["SZ", "TC", "RM", "CB"]).catch("SZ"),
  region: z.enum(["WEST", "JPN"]).catch("WEST"),
  month: z.number().optional(),
  year: z.number().optional(),
});

export const Route = createFileRoute("/xsearch")({
  validateSearch: zodValidator(xsearchSearchSchema),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(xsearchQueryOptions(deps)),
  component: XSearchPage,
});

function XSearchPage() {
  const search = Route.useSearch(); // typed! { mode, region, month?, year? }
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(xsearchQueryOptions(search));

  // Update search params — type-safe, no manual string building
  const setMode = (mode: string) => navigate({ search: (prev) => ({ ...prev, mode }) });
}
```

---

## Step 6: Mutation-heavy pages

### Server functions replace actions

```ts
// OLD: app/features/user-page/actions/u.$identifier.edit.server.ts
import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";

export const action: ActionFunction = async ({ request }) => {
  const user = requireUser();
  const result = await parseFormData({ request, schema: userEditProfileSchemaServer });
  if (!result.success) return { fieldErrors: result.fieldErrors };
  await UserRepository.updateProfile({ userId: user.id, ...result.data });
  throw redirect(userPage(editedUser));
};

// NEW: src/features/user-page/mutations/updateProfile.ts
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { requireAuthMiddleware } from "~/middleware/auth";
import { singleFlightMiddleware } from "~/middleware/single-flight";
import * as UserRepository from "../UserRepository.server";
import { userEditProfileSchemaServer } from "../user-page-schemas.server";

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware, singleFlightMiddleware])
  .inputValidator(zodValidator(userEditProfileSchemaServer))
  .handler(async ({ data, context }) => {
    const editedUser = await UserRepository.updateProfile({
      userId: context.user.id,
      ...data,
    });
    // Note: redirect after mutation, or return data and let client handle
    throw redirect({ to: "/u/$identifier", params: { identifier: editedUser.customUrl ?? editedUser.discordId } });
  });
```

### useFetcher → useMutation

```tsx
// OLD: component using useFetcher for mutation
import { useFetcher } from "react-router";

function DeleteButton({ teamId }: { teamId: number }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" action={`/t/${teamId}/edit`}>
      <input type="hidden" name="_action" value="DELETE" />
      <button type="submit" disabled={fetcher.state !== "idle"}>
        {fetcher.state !== "idle" ? "Deleting..." : "Delete"}
      </button>
    </fetcher.Form>
  );
}

// NEW: component using useMutation
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTeam } from "~/features/team/mutations/deleteTeam";

function DeleteButton({ teamId }: { teamId: number }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteTeam({ data: { teamId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    },
  });

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
```

### useFetcher (GET) → useQuery

```tsx
// OLD: using useFetcher to load data client-side
import { useFetcher } from "react-router";

function SearchResults() {
  const fetcher = useFetcher<typeof loader>();
  useEffect(() => {
    fetcher.load(`/search?q=${query}`);
  }, [query]);
  const results = fetcher.data?.results;
}

// NEW: using useQuery + useServerFn
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchQueryOptions } from "~/features/search/queries/search";

function SearchResults({ query }: { query: string }) {
  const { data, isLoading } = useQuery(searchQueryOptions(query));
  const results = data?.results;
}

// Note: useServerFn from @tanstack/react-start wraps a server function for
// use as a queryFn in React Query. It handles serialization of redirects/errors.
// Example:
//   const getSearchResults = useServerFn(fetchSearchResults);
//   useQuery({ queryKey: ["search", query], queryFn: () => getSearchResults({ data: { query } }) });
```

---

## Step 7: Complex nested routes

### Tournament layout with nested routes

```ts
// OLD: app/features/tournament/routes/to.$id.tsx (layout)
import { Outlet, useLoaderData } from "react-router";
export { loader } from "../loaders/to.$id.server";
export const handle: SendouRouteHandle = { i18n: ["tournament", "calendar"] };

export default function TournamentLayout() {
  const data = useLoaderData<typeof loader>();
  return (
    <div>
      <TournamentHeader tournament={data.tournament} />
      <Outlet />
    </div>
  );
}

// NEW: src/routes/to/$id.tsx (layout)
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { tournamentQueryOptions } from "~/features/tournament/queries/tournament";

export const Route = createFileRoute("/to/$id")({
  beforeLoad: async () => {
    // CLAUDETODO: lets figure out how we can make this more ergonomic
    await i18next.loadNamespaces(["tournament", "calendar"]);
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(tournamentQueryOptions(Number(params.id))),
  // head() receives loaderData for dynamic meta tags
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `${loaderData.tournament.name} | sendou.ink` }]
      : [],
  }),
  component: TournamentLayout,
});

function TournamentLayout() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(tournamentQueryOptions(Number(id)));
  return (
    <div>
      <TournamentHeader tournament={data.tournament} />
      <Outlet />
    </div>
  );
}

// NEW: src/routes/to/$id/register.tsx (child route)
export const Route = createFileRoute("/to/$id/register")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(registerQueryOptions(Number(params.id))),
  component: RegisterPage,
});
```

### Directory structure for tournament routes

```
src/routes/
  to/
    $id.tsx                    ← layout (TournamentHeader + Outlet)
    $id/
      index.ts                ← /to/:id (tournament overview)
      register.tsx            ← /to/:id/register
      teams.tsx               ← /to/:id/teams
      teams.$tid.tsx          ← /to/:id/teams/:tid
      admin.tsx               ← /to/:id/admin
      seeds.tsx               ← /to/:id/seeds
      results.tsx             ← /to/:id/results
      streams.tsx             ← /to/:id/streams
      looking.tsx             ← /to/:id/looking
      subs.tsx                ← /to/:id/subs
      divisions.tsx           ← /to/:id/divisions
      brackets.tsx            ← /to/:id/brackets (layout)
      brackets/
        finalize.tsx          ← /to/:id/brackets/finalize
      matches.$mid.tsx        ← /to/:id/matches/:mid
```

---

## Step 8: Client-only routes

TanStack Start supports three SSR modes per route:
- `ssr: true` (default) — full SSR
- `ssr: 'data-only'` — runs loader on server, renders component on client only
- `ssr: false` — entirely client-only (no loader, no SSR render)
- `ssr: (opts) => false | 'data-only'` — functional form for runtime decisions

```ts
// OLD: app/features/map-planner/routes/plans.tsx
import { lazy } from "react";
import { useIsMounted } from "~/hooks/useIsMounted";
const Planner = lazy(() => import("~/features/map-planner/components/Planner"));

export default function MapPlannerPage() {
  const isMounted = useIsMounted();
  if (!isMounted) return <Placeholder />;
  return <Planner />;
}

// NEW: src/routes/plans.tsx
import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const Planner = lazy(() => import("~/features/map-planner/components/Planner"));

export const Route = createFileRoute("/plans")({
  ssr: false, // entire route is client-only — no useIsMounted hack needed
  head: () => ({
    meta: [{ title: "Map Planner | sendou.ink" }],
  }),
  component: () => <Planner />,
});
```

---

## Step 9: Public API server routes

```ts
// OLD: app/features/api-public/routes/user.$identifier.ts
import type { LoaderFunctionArgs } from "react-router";
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const user = await UserRepository.findByIdentifier(params.identifier!);
  if (!user) throw new Response(null, { status: 404 });
  return Response.json(user);
};

// NEW: src/routes/api/user.$identifier.ts
import { createFileRoute } from "@tanstack/react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export const Route = createFileRoute("/api/user/$identifier")({
  server: {
    middleware: [apiRateLimitMiddleware], // route-level middleware
    handlers: {
      GET: async ({ request, params }) => {
        const user = await UserRepository.findByIdentifier(params.identifier);
        if (!user) return new Response(null, { status: 404 });
        return Response.json(user);
      },
    },
  },
});

// Per-handler middleware is also supported via createHandlers:
// server: {
//   handlers: ({ createHandlers }) => createHandlers({
//     GET: {
//       middleware: [loggerMiddleware],
//       handler: async ({ request, params }) => { ... },
//     },
//   }),
// }
```

---

## Step 10: SendouForm migration

```tsx
// OLD: SendouForm uses useFetcher internally
// app/form/SendouForm.tsx
import { useFetcher } from "react-router";
const fetcher = useFetcher<{ fieldErrors?: Record<string, string> }>();
// submits via fetcher.submit()

// NEW: SendouForm calls server function directly
// The form component accepts an `onSubmit` server function prop
// instead of relying on useFetcher + action URL.

interface SendouFormProps<T> {
  schema: ZodSchema<T>;
  serverAction: (args: { data: T }) => Promise<{ fieldErrors?: Record<string, string> } | void>;
  // ... rest stays the same
}

function SendouForm<T>({ schema, serverAction, ...props }: SendouFormProps<T>) {
  const [isPending, setIsPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (validatedData: T) => {
    setIsPending(true);
    try {
      const result = await serverAction({ data: validatedData });
      if (result?.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    } finally {
      setIsPending(false);
    }
  };

  // ... rest of form rendering stays the same
}

// Usage stays almost identical:
// OLD
<SendouForm schema={schema} />
// (action inferred from route)

// CLAUDETODO: mention we need some type level trick to make sure schema and serverAction match
// NEW
<SendouForm schema={schema} serverAction={updateProfile} />
```

### FormWithConfirm migration

```tsx
// OLD: uses fetcher.Form + portal
<fetcher.Form method="post" action={action}>
  <input type="hidden" name={name} value={value} />
</fetcher.Form>

// NEW: calls server function on confirm
function FormWithConfirm({ serverAction, fields, children, dialogHeading }) {
  const mutation = useMutation({
    mutationFn: () => serverAction({ data: Object.fromEntries(fields) }),
  });

  return (
    <>
      <SendouDialog isOpen={dialogOpen} onClose={closeDialog}>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {submitButtonText}
        </button>
      </SendouDialog>
      {React.cloneElement(children, { onPress: openDialog })}
    </>
  );
}
```

---

## Step 11: SWR → react-query

```ts
// OLD: app/hooks/swr.ts
import useSWRImmutable from "swr/immutable";

export function usePatrons() {
  const { data, error } = useSWRImmutable<PatronsListLoaderData>(
    PATRONS_LIST_ROUTE,
    fetcher(PATRONS_LIST_ROUTE),
  );
  return { patrons: data?.patrons, isLoading: !error && !data, isError: error };
}

// NEW: src/features/front-page/queries/patrons.ts
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

const fetchPatrons = createServerFn({ method: "GET" })
  .handler(async () => {
    // existing patrons loader logic
    return PatronsRepository.findAll();
  });

export const patronsQueryOptions = () =>
  queryOptions({
    queryKey: ["patrons"],
    queryFn: () => fetchPatrons(),
    staleTime: Infinity, // immutable, like useSWRImmutable
  });

// NEW: hook replacement
import { useQuery } from "@tanstack/react-query";
import { patronsQueryOptions } from "~/features/front-page/queries/patrons";

export function usePatrons() {
  const { data, isLoading, isError } = useQuery(patronsQueryOptions());
  return { patrons: data?.patrons, isLoading, isError };
}
```

// CLAUDETODO: we need to use static server functions https://tanstack.com/start/latest/docs/framework/react/guide/static-server-functions
Patrons and articles can be **pre-loaded** in the root route's loader:

```ts
// In __root.tsx loader:
loader: ({ context }) => {
  // Fire-and-forget: don't await, don't return — these will stream to the client
  // via setupRouterSsrQueryIntegration's automatic query streaming.
  // When they resolve on the server, data is serialized and streamed to the client.
  context.queryClient.prefetchQuery(patronsQueryOptions());
  context.queryClient.prefetchQuery(articlesQueryOptions());
},
```

> **Prefetch patterns:** `ensureQueryData` (await it) blocks SSR until data is ready — use for critical data. `prefetchQuery` (don't await, don't return) starts fetching on the server and streams results to the client when ready — use for non-critical data. The `@tanstack/react-router-ssr-query` integration handles streaming automatically.

---

## Step 12: Cleanup

### Delete / remove
- `app/routes.ts` — replaced by auto-generated `routeTree.gen.ts`
- `app/entry.server.tsx` — replaced by `src/server.ts`
- `app/entry.client.tsx` — handled by TanStack Start automatically
- `react-router.config.ts` — no equivalent needed
- `app/utils/remix.ts` — `metaTags` utility adapted, `SerializeFrom` type removed
- `app/utils/remix.server.ts` — `parseSearchParams`, `parseRequestPayload` replaced by `zodValidator()` + `validateSearch` and `.inputValidator()`; `notFoundIfFalsy` → `throw notFound()` from `@tanstack/react-router`; `errorToastRedirect` → adapted
- `app/hooks/swr.ts` — replaced by react-query hooks
- Route `handle` exports (63 files) — i18n → `beforeLoad`, breadcrumbs → route staticData or context
- All `export { loader }` / `export { action }` re-exports from route files

### Slim `urls.ts`
- Delete all `*_PAGE` constants (~50 constants like `SENDOUQ_PAGE`, `CALENDAR_PAGE`)
- Delete search param builder functions
- Keep external URLs, asset URLs, and param computation helpers (`userIdentifier`, `teamPage` param logic)

### Package.json cleanup
- Remove: `react-router`, `@react-router/*`, `remix-auth`, `remix-auth-oauth2`, `remix-i18next`, `swr`, `vite-tsconfig-paths`
- Add: `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-router-ssr-query`, `@tanstack/zod-adapter`

---

## Key Patterns Reference Card

For the implementor LLM — quick reference of the most common transformations:

| Old Pattern | New Pattern |
|---|---|
| `export const loader = async ({ request }) => { ... }` | `createServerFn({ method: "GET" }).handler(async () => { ... })` used in `queryOptions` + route `loader` calling `ensureQueryData` |
| `export const action = async ({ request }) => { ... }` | `createServerFn({ method: "POST" }).inputValidator(zodValidator(schema)).handler(async ({ data }) => { ... })` |
| `useLoaderData<typeof loader>()` | `useSuspenseQuery(myQueryOptions())` or `Route.useLoaderData()` |
| `useFetcher()` + `fetcher.submit()` | `useMutation({ mutationFn: () => myServerFn({ data }) })` |
| `useFetcher()` + `fetcher.load()` | `useQuery(myQueryOptions())` |
| `useSearchParams()` | `Route.useSearch()` (typed, validated) |
| `setSearchParams({ key: value })` | `navigate({ search: (prev) => ({ ...prev, key: value }) })` |
| `export const handle = { i18n: ["ns"] }` | `beforeLoad: () => { i18next.loadNamespaces(["ns"]) }` |
| `export const meta: MetaFunction = ...` | `head: ({ loaderData }) => ({ meta: [...] })` — `loaderData` is available for dynamic meta |
| `throw new Response(null, { status: 404 })` | `throw notFound()` from `@tanstack/react-router` |
| `throw new Response(null, { status: 401 })` | `throw redirect({ to: "/auth" })` |
| `throw redirect(url)` | `throw redirect({ to: url })` or `throw redirect({ href: externalUrl })` for external URLs |
| `data({ ... }, { headers })` | `setResponseHeader(name, value)` or `setResponseHeaders(headers)` + return data |
| `getUser()` (AsyncLocalStorage) | `context.user` (from middleware) |
| `requireUser()` | Use `requireAuthMiddleware` on the server function |
| `parseFormData({ request, schema })` | `.inputValidator(zodValidator(schema))` on `createServerFn` (requires `@tanstack/zod-adapter`) |
| `parseSearchParams({ request, schema })` | `validateSearch: zodValidator(schema)` on route (requires `@tanstack/zod-adapter`) |
| `<Link to={userPage(user)}>` | `<Link to="/u/$identifier" params={{ identifier: userIdentifier(user) }}>` |
| `useIsMounted()` + `lazy()` for client-only | `ssr: false` on route (also `ssr: 'data-only'` for loader-only SSR) |
| `shouldRevalidate` | `staleTime` / `gcTime` on query options |
| `useRevalidator()` | `queryClient.invalidateQueries()` |
| Manual dehydrate/hydrate/Wrap | `setupRouterSsrQueryIntegration({ router, queryClient })` from `@tanstack/react-router-ssr-query` |
| `request.headers.get("Cookie")` | `getRequestHeader("Cookie")` from `@tanstack/react-start/server` |

---

## File Routing Conventions

| Convention | Example | Description |
|---|---|---|
| `__root.tsx` | `__root.tsx` | Root route, must be in routes directory root |
| `index.tsx` | `to/$id/index.tsx` | Index route (matches parent path exactly) |
| `$param.tsx` | `$id.tsx` | Dynamic path parameter segment |
| `$.tsx` | `$.tsx` | Splat/catch-all route (captured as `_splat`) |
| `_prefix.tsx` | `_auth.tsx` | Pathless layout route (no URL segment, wraps children) |
| `suffix_.tsx` | `posts_.$id.edit.tsx` | Non-nested route (breaks out of parent nesting) |
| `-file.tsx` | `-utils.tsx` | Excluded from routing (for colocated helpers) |
| `(folder)/` | `(admin)/` | Route group directory (organizational only, no URL effect) |
| `.` separator | `posts.$postId.tsx` | Flat route nesting (alternative to directory nesting) |
| `{-$param}` | `{-$lang}.tsx` | Optional path parameter |

---

## File Structure After Migration

```
src/
  routes/                        ← file-based routing (auto-generates routeTree)
    __root.tsx                   ← root layout (html shell, providers)
    _index.tsx                   ← front page
    faq.tsx                      ← static pages
    contributions.tsx
    privacy-policy.tsx
    support.tsx
    leaderboards.tsx
    links.tsx
    plans.tsx                    ← ssr: false
    analyzer.tsx                 ← ssr: false
    tier-list-maker.tsx          ← ssr: false
    object-damage-calculator.tsx ← ssr: false
    maps.tsx
    tiers.tsx
    suspended.tsx
    admin.tsx
    friends.tsx
    settings.tsx
    notifications.tsx
    upload/
      _index.tsx
      admin.tsx
    u/
      _index.tsx                 ← user search
      $identifier.tsx            ← layout
      $identifier/
        _index.tsx
        art.tsx
        edit.tsx
        edit-widgets.tsx
        seasons.tsx
        vods.tsx
        builds.tsx
        builds.new.tsx
        results.tsx
        results.highlights.tsx
        admin.tsx
    to/
      search.ts
      $id.tsx                    ← tournament layout
      $id/
        _index.ts
        register.tsx
        teams.tsx
        teams.$tid.tsx
        join.tsx
        admin.tsx
        seeds.tsx
        results.tsx
        streams.tsx
        looking.tsx
        subs.tsx
        divisions.tsx
        brackets.tsx
        brackets/
          finalize.tsx
        matches.$mid.tsx
    org/
      new.tsx
      $slug.tsx
      $slug/
        edit.tsx
    t/
      _index.tsx
      new.tsx
      $customUrl.tsx
      $customUrl/
        _index.tsx
        edit.tsx
        roster.tsx
        join.tsx
        results.tsx
    q/
      _index.tsx
      rules.tsx
      info.tsx
      looking.tsx
      preparing.tsx
      settings.tsx
      streams.tsx
      match.$id.tsx
    calendar/
      _index.tsx
      new.tsx
      $id.tsx
      $id.report-winners.tsx
    badges/
      _index.tsx
      $id.tsx
      $id.edit.tsx
    builds/
      _index.tsx
      $slug.tsx
      $slug.stats.tsx
      $slug.popular.tsx
    vods/
      _index.tsx
      new.tsx
      $id.tsx
    xsearch/
      _index.tsx
      player.$id.tsx
    a/
      _index.tsx
      $slug.tsx
    plus/
      _index.ts
      suggestions.tsx
      suggestions.new.tsx
      suggestions.comment.$tier.$userId.tsx
      list.ts
      voting.tsx
      voting.results.tsx
    lfg/
      _index.tsx
      new.tsx
    scrims/
      _index.tsx
      new.tsx
      $id.tsx
    art/
      _index.tsx
      new.tsx
    auth/
      _index.ts
      callback.ts
      login.ts
      logout.ts
      impersonate.ts
      impersonate.stop.ts
    api/                         ← public API server routes
      user.$identifier.ts
      user.$identifier.ids.ts
      calendar.$year.$week.ts
      tournament.$id.ts
      tournament.$id.teams.ts
      tournament.$id.players.ts
      tournament.$id.brackets.$bidx.ts
      tournament.$id.brackets.$bidx.standings.ts
      tournament-match.$id.ts
      sendouq.active-match.$userId.ts
      sendouq.match.$matchId.ts
      org.$id.ts
      team.$id.ts
  features/                      ← business logic stays here (mostly unchanged)
    user-page/
      queries/                   ← NEW: react-query definitions
        userPage.ts
      mutations/                 ← NEW: server function mutations
        updateProfile.ts
      components/                ← unchanged
      core/                      ← unchanged
      UserRepository.server.ts   ← unchanged
    tournament/
      queries/
        tournament.ts
      mutations/
        register.ts
        admin.ts
      components/
      core/
      TournamentRepository.server.ts
    ... (same pattern for all features)
  middleware/                     ← NEW: TanStack Start middleware
    auth.ts
    i18n.ts
    single-flight.ts
    api-rate-limit.ts
  router.tsx                     ← router configuration + react-query SSR integration
  routeTree.gen.ts               ← auto-generated by TanStack Router CLI
  start.ts                       ← global middleware config via createStart()
  server.ts                      ← server entry (cron jobs start here)
  client.tsx                     ← client entry (optional, auto-handled if omitted)
  components/                    ← shared UI components (unchanged)
  db/                            ← database (unchanged)
  modules/                       ← i18n config, permissions, etc.
  styles/                        ← CSS (unchanged)
  utils/                         ← utilities (slimmed urls.ts, removed remix.ts)
```

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| TanStack Start is RC, not 1.0 | API is frozen, Router is mature. Pin exact versions. |
| 90+ routes is a large migration | Migration order minimizes risk: simple first, complex last. E2E tests catch regressions. |
| `useFetcher` in 52 files | Mechanical transformation, can be done file-by-file. Each file is independent. |
| Cache invalidation complexity with react-query | Start with aggressive invalidation (`invalidateQueries`), optimize later. Single-flight middleware handles the common case. |
| Session cookie library change | `createCookieSessionStorage` from react-router needs replacement. Prefer TanStack Start's built-in `useSession` from `@tanstack/react-start/server` (encrypted cookie sessions). Fallback: `iron-session` or thin wrapper. |
| Long migration branch | Feature dev frozen. Run E2E suite regularly on the branch. |
| i18n namespace loading timing | `beforeLoad` runs before component render, same as Remix's namespace loading. Test with slow connections. |
| `.server.ts` files no longer special | Server code is identified by `createServerFn` boundaries. Repository imports inside handlers are tree-shaken from client. Verify with bundle analysis. |
