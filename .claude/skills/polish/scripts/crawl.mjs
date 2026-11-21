/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// Finds the pages to sweep: follows the links of the server rendered HTML from the front page (as
// the admin, who is linked to the most), groups what it finds by route of app/routes.ts and keeps a
// couple of URLs per route, the content stress pages of targets.json first. Writes manifest.json and
// says which routes no link led to.
//
//   node .claude/skills/polish/scripts/crawl.mjs [--per-route=2] [--max-fetches=900] [--include-admin]
//        [--as=<user id>|anon|regular]   who looks at the pages (default: the admin; "regular" is the
//                                seed's user without roles). Content stress pages
//                                that name a viewer keep theirs. Every viewer gets a manifest of
//                                their own (manifest-anon.json, manifest-<id>.json), which
//                                `sweep.mjs --as=admin,anon,<id>` puts together.
import fs from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import {
	ADMIN_ID,
	assertServerUp,
	BASE_URL,
	featureOfRoute,
	manifestName,
	matchRoute as matchRouteOf,
	OUTPUT_DIR,
	parseArgs,
	REGULAR_USER_ID,
	readOutputJson as readJson,
} from "./lib.mjs";

const { flags } = parseArgs();
const PER_ROUTE = Number(flags["per-route"] ?? 2);
const MAX_FETCHES = Number(flags["max-fetches"] ?? 900);
const SEEDS = ["/"];
/** null is a logged out visitor. */
const VIEWER =
	flags.as === "anon"
		? null
		: flags.as === "regular"
			? REGULAR_USER_ID
			: Number(flags.as ?? ADMIN_ID);
const ATTEMPTS_PER_ROUTE = PER_ROUTE * 3;
const SKIPPED_PREFIXES = [
	"/auth",
	"/api",
	"/dev",
	"/broadcast/program",
	...(flags["include-admin"] ? [] : ["/admin"]),
];

await assertServerUp();

const routes = readJson("routes.json");
const targets = readJson("targets.json");
if (!routes || !targets) {
	throw new Error(
		"routes.json / targets.json missing, run: pnpm run polish:db",
	);
}

const api = await request.newContext({ baseURL: BASE_URL });
if (VIEWER !== null) {
	const login = await api.post(`/auth/impersonate?id=${VIEWER}`, {
		maxRedirects: 0,
	});
	if (login.status() >= 400) throw new Error(`Login failed: ${login.status()}`);
}

/** route path -> { urls: Map<url, entry> } */
const byRoute = new Map();
const broken = [];
const visited = new Set();
const attempts = new Map();
const referrers = new Map();
const queue = [...SEEDS];

for (const target of targets) {
	const pathname = target.url.split("?")[0];
	const route = matchRoute(pathname);
	if (!route) continue;
	keep(route, {
		url: target.url,
		viewer: target.viewerId ?? VIEWER,
		// a page in a scenario's state holds everyday content: nothing on it is at a limit
		...(target.kind === "state"
			? { scenario: target.label }
			: { stress: target.label }),
	});
	queue.push(target.url);
}

// pages that need a participant are fetched as that user in the fallback pass
const otherSessions = new Map();
for (const viewer of new Set(
	targets.map((target) => target.viewerId).filter(Boolean),
)) {
	if (viewer === VIEWER) continue;
	const session = await request.newContext({ baseURL: BASE_URL });
	await session.post(`/auth/impersonate?id=${viewer}`, { maxRedirects: 0 });
	otherSessions.set(viewer, session);
}

let fetches = 0;
while (queue.length > 0 && fetches < MAX_FETCHES) {
	const key = queue.shift().split("#")[0];
	if (visited.has(key)) continue;
	visited.add(key);

	const pathname = key.split("?")[0];
	if (SKIPPED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) continue;
	const route = matchRoute(pathname);
	if (!route) continue;
	if (!isStress(key)) {
		// enough examples of this route already: its links are the same kind of links
		const kept = byRoute.get(route.path);
		if ((kept?.size ?? 0) >= PER_ROUTE) continue;
		if ((attempts.get(route.path) ?? 0) >= ATTEMPTS_PER_ROUTE) continue;
		if (
			kept &&
			[...kept.values()].some((entry) => entry.url.split("?")[0] === pathname)
		)
			continue;
		attempts.set(route.path, (attempts.get(route.path) ?? 0) + 1);
	}

	const body = await fetchPage(
		key,
		targets.find((target) => target.url === key)?.viewerId ?? VIEWER,
	);
	if (body === null) continue;
	if (!isStress(key)) keep(route, { url: key, viewer: VIEWER });
	for (const [, href] of body.matchAll(/<a\b[^>]*?\shref="([^"]+)"/g)) {
		enqueue(href.replaceAll("&amp;", "&"), key);
	}
}

// routes no link leads to (forms behind buttons, pages behind a state): tried directly, their
// params borrowed from a page already found under the same prefix
for (const route of routes) {
	if (byRoute.has(route.path)) continue;
	if (SKIPPED_PREFIXES.some((prefix) => route.path.startsWith(prefix)))
		continue;
	const candidate = guessUrl(route.path);
	if (!candidate || visited.has(candidate.url)) continue;
	visited.add(candidate.url);
	const body = await fetchPage(candidate.url, candidate.viewer, {
		quiet: true,
	});
	if (body !== null) keep(route, { ...candidate, guessed: true });
}

const pages = [...byRoute.entries()]
	.flatMap(([routePath, urls]) =>
		[...urls.values()].map((entry) => ({
			...entry,
			route: routePath,
			feature: featureOf(routePath),
		})),
	)
	.sort((a, b) => a.url.localeCompare(b.url));

const reached = new Set(byRoute.keys());
const unreached = routes
	.filter(
		(route) =>
			!reached.has(route.path) &&
			!SKIPPED_PREFIXES.some((prefix) => route.path.startsWith(prefix)),
	)
	.map((route) => route.path);

const manifestFile = manifestName(flags.as);
fs.writeFileSync(
	path.join(OUTPUT_DIR, manifestFile),
	JSON.stringify(
		{
			pages,
			unreached,
			broken,
			skipped: SKIPPED_PREFIXES,
			routesTotal: routes.length,
		},
		null,
		"\t",
	),
);

console.log(
	`${manifestFile}: ${pages.length} pages over ${reached.size} routes (${pages.filter((page) => page.stress).length} content stress, ${pages.filter((page) => page.scenario).length} in a scenario's state), ${fetches} fetches`,
);
console.log(
	`${unreached.length} routes no link led to:\n  ${unreached.join("\n  ")}`,
);
if (broken.length > 0) {
	console.log(
		`${broken.length} linked URLs failed:\n  ${broken.map((entry) => `${entry.status} ${entry.url} (linked from ${entry.linkedFrom ?? "?"})`).join("\n  ")}`,
	);
}
await api.dispose();
for (const session of otherSessions.values()) await session.dispose();

/** The page's HTML, or null when it is not a page of its own (an error, a redirect elsewhere, not HTML). */
async function fetchPage(url, viewer, { quiet = false } = {}) {
	fetches++;
	let response;
	try {
		response = await sessionFor(viewer).get(url, {
			maxRedirects: 5,
			timeout: 20_000,
		});
	} catch (error) {
		if (!quiet)
			broken.push({
				url,
				status: String(error.message).slice(0, 80),
				linkedFrom: referrers.get(url),
				viewer,
			});
		return null;
	}
	if (response.status() >= 400) {
		if (!quiet)
			broken.push({
				url,
				status: response.status(),
				linkedFrom: referrers.get(url),
				viewer,
			});
		return null;
	}
	if (!(response.headers()["content-type"] ?? "").includes("text/html"))
		return null;

	const final = new URL(response.url());
	if (final.pathname !== url.split("?")[0]) {
		// redirected: the page that rendered is another route's
		enqueue(final.pathname + final.search, referrers.get(url));
		return null;
	}
	return response.text();
}

function sessionFor(viewer) {
	return viewer === VIEWER ? api : (otherSessions.get(viewer) ?? api);
}

/** A URL for a route nothing linked to: a found page's segments for the shared prefix, the rest of the pattern when it is static. */
function guessUrl(routePath) {
	const wanted = routePath.split("/").filter(Boolean);
	if (wanted.every((segment) => !segment.startsWith(":"))) {
		return { url: routePath, viewer: VIEWER };
	}
	let best = null;
	for (const [keptPath, urls] of byRoute) {
		const kept = keptPath.split("/").filter(Boolean);
		if (kept.length >= wanted.length) continue;
		if (!kept.every((segment, index) => segment === wanted[index])) continue;
		if (
			wanted
				.slice(kept.length)
				.some((segment) => segment.startsWith(":") || segment === "*")
		)
			continue;
		if (!best || kept.length > best.kept.length) best = { kept, urls };
	}
	if (!best) return null;
	const [entry] = best.urls.values();
	const prefix = entry.url.split("?")[0].replace(/\/$/, "");
	return {
		url: `${prefix}/${wanted.slice(best.kept.length).join("/")}`,
		viewer: entry.viewer,
	};
}

function isStress(url) {
	return targets.some((target) => target.url === url);
}

function enqueue(href, linkedFrom) {
	let url;
	try {
		url = new URL(href, BASE_URL);
	} catch {
		return;
	}
	if (url.origin !== BASE_URL) return;
	const key = url.pathname + url.search;
	if (visited.has(key)) return;
	if (!referrers.has(key)) referrers.set(key, linkedFrom);
	queue.push(key);
}

function keep(route, entry) {
	const urls = byRoute.get(route.path) ?? new Map();
	// pages seeded on purpose (content stress, a scenario's state) are all kept, linked pages are samples
	const limit = entry.scenario || entry.stress ? PER_ROUTE + 10 : PER_ROUTE;
	// the same page seeded for two viewers (a queue as a solo player and as a full group) is two entries
	const key =
		entry.scenario || entry.stress
			? `${entry.url} as ${entry.viewer}`
			: entry.url;
	if (urls.size >= limit || urls.has(key)) return;
	// one pathname once: a second example of a route should be another entity, not another filter
	const pathname = entry.url.split("?")[0];
	if (
		!entry.stress &&
		!entry.scenario &&
		[...urls.values()].some((kept) => kept.url.split("?")[0] === pathname)
	) {
		return;
	}
	urls.set(key, entry);
	byRoute.set(route.path, urls);
}

function featureOf(routePath) {
	return featureOfRoute(
		routes.find((candidate) => candidate.path === routePath),
	);
}

function matchRoute(pathname) {
	return matchRouteOf(routes, pathname);
}
