/**
 * Generates the differ's route census: every URL pattern the app serves,
 * expanded with representative params drawn from the seeded database at
 * `DB_PATH`. Never hand-listed — the pattern list comes from walking
 * `app/routes.ts`, and a dynamic segment without a resolver below is a hard
 * error so new routes cannot silently drop out of differential coverage.
 *
 * Usage: DB_PATH=<seeded db> vite-node scripts/route-census.ts [--out census.json]
 *
 * A resolver that finds no seed data marks its rows `skipped` (with the reason
 * in the census) instead of failing: that is a seed-coverage gap to close, not
 * a census bug, and the differ report keeps it visible.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// routes.ts branches on NODE_ENV at module scope; the census must describe the
// production build the differ serves, never the dev-only routes
process.env.NODE_ENV = "production";

// the production config demands real credentials at import time, but this
// script only ever reads the database; the e2e flag makes config fall back to
// its development defaults, matching the build the differ serves
process.env.VITE_E2E_TEST_RUN = "true";

if (!process.env.DB_PATH) {
	throw new Error("DB_PATH must point to a seeded database");
}

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));

type RouteEntry = {
	file: string;
	path?: string;
	index?: boolean;
	children?: RouteEntry[];
};

export interface CensusRow {
	pattern: string;
	url: string | null;
	file: string;
	kind: "page" | "resource";
	skipped?: string;
}

const routes = (await import("../app/routes")).default as RouteEntry[];
const { db } = await import("~/db/sql");
const { ADMIN_DISCORD_ID } = await import("~/features/admin/admin-constants");
const { weaponNameSlugToId } = await import("~/utils/unslugify.server");
const { databaseTimestampToDate, weekNumberToDateRange } = await import(
	"~/utils/dates"
);

const rows = await buildCensus();

const outFlagIndex = process.argv.indexOf("--out");
const outPath = outFlagIndex === -1 ? null : process.argv[outFlagIndex + 1];

const adminUser = await db
	.selectFrom("User")
	.select(["id"])
	.where("discordId", "=", ADMIN_DISCORD_ID)
	.executeTakeFirstOrThrow();

const census = {
	seedNow: process.env.SEED_NOW ?? null,
	adminUserId: adminUser.id,
	rows,
};

if (outPath) {
	fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
	fs.writeFileSync(path.resolve(outPath), JSON.stringify(census, null, "\t"));
	const skipped = rows.filter((row) => row.skipped);
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(
		`Census: ${rows.length} rows (${skipped.length} skipped) -> ${outPath}`,
	);
	for (const row of skipped) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`  skipped ${row.pattern}: ${row.skipped}`);
	}
} else {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(JSON.stringify(census, null, "\t"));
}

async function buildCensus(): Promise<CensusRow[]> {
	const patterns = new Map<string, { file: string }>();

	const walk = (entries: RouteEntry[], parentPath: string) => {
		for (const entry of entries) {
			// an index entry inside `prefix()` carries the prefix as its own path
			const fullPath =
				entry.path !== undefined
					? joinPaths(parentPath, entry.path)
					: parentPath;

			if (entry.children) {
				walk(entry.children, fullPath);
			}

			const rendersUrl = entry.index || entry.path !== undefined;
			if (rendersUrl && !patterns.has(fullPath)) {
				patterns.set(fullPath, { file: entry.file });
			}
		}
	};
	walk(routes, "/");

	const resolve = createParamResolver();
	const result: CensusRow[] = [];

	for (const [pattern, { file }] of patterns) {
		const kind: CensusRow["kind"] = file.endsWith(".tsx") ? "page" : "resource";

		for (const variant of expandOptionalParams(pattern)) {
			const paramNames = [...variant.matchAll(/:([A-Za-z]+)/g)].map(
				(match) => match[1],
			);

			if (paramNames.length === 0) {
				result.push({ pattern: variant, url: variant, file, kind });
				continue;
			}

			const params = await resolve(variant);
			if (params === null) {
				result.push({
					pattern: variant,
					url: null,
					file,
					kind,
					skipped: "no seed data for this pattern's params",
				});
				continue;
			}

			let url = variant;
			for (const name of paramNames) {
				const value = params[name];
				if (value === undefined || value === null) {
					throw new Error(
						`Resolver for ${variant} did not provide a value for :${name}`,
					);
				}
				url = url.replace(`:${name}`, encodeURIComponent(String(value)));
			}
			result.push({ pattern: variant, url, file, kind });
		}
	}

	return result.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

function joinPaths(parent: string, child?: string) {
	if (child === undefined) return parent;
	if (child.startsWith("/")) return child.replace(/\/+$/, "") || "/";
	return `${parent === "/" ? "" : parent}/${child}`;
}

/** `registration/:tid?` expands into rows both with and without the segment. */
function expandOptionalParams(pattern: string): string[] {
	const optional = pattern.match(/\/:([A-Za-z]+)\?/);
	if (!optional) return [pattern];

	const without = pattern.replace(optional[0], "");
	const withParam = pattern.replace(optional[0], `/:${optional[1]}`);
	return [
		...expandOptionalParams(without || "/"),
		...expandOptionalParams(withParam),
	];
}

type ParamValues = Record<string, string | number> | null;

/**
 * Maps a URL pattern to representative param values from the seeded database.
 * Rules are matched by pattern prefix so related routes share one lookup;
 * a pattern with params that no rule covers is a hard error.
 */
function createParamResolver() {
	const cache = new Map<string, Promise<ParamValues>>();
	const cached = (key: string, load: () => Promise<ParamValues>) => {
		let value = cache.get(key);
		if (!value) {
			value = load();
			cache.set(key, value);
		}
		return value;
	};

	const adminUser = () =>
		cached("adminUser", async () => {
			const user = await db
				.selectFrom("User")
				.select(["id", "discordId", "customUrl"])
				.where("discordId", "=", ADMIN_DISCORD_ID)
				.executeTakeFirst();
			if (!user) return null;
			return {
				id: user.id,
				userId: user.id,
				identifier: user.customUrl ?? user.discordId,
				customUrl: user.customUrl ?? user.discordId,
			};
		});

	const tournamentContext = () =>
		cached("tournament", async () => {
			const match = await db
				.selectFrom("TournamentMatch")
				.innerJoin(
					"TournamentStage",
					"TournamentStage.id",
					"TournamentMatch.stageId",
				)
				.select(["TournamentMatch.id as mid", "TournamentStage.tournamentId"])
				.where("TournamentMatch.startedAt", "is not", null)
				.orderBy("TournamentMatch.id", "asc")
				.executeTakeFirst();
			if (!match) return null;

			const team = await db
				.selectFrom("TournamentTeam")
				.select(["id"])
				.where("tournamentId", "=", match.tournamentId)
				.orderBy("id", "asc")
				.executeTakeFirst();
			if (!team) return null;

			return {
				id: match.tournamentId,
				mid: match.mid,
				tid: team.id,
				teamId: team.id,
				bidx: 0,
			};
		});

	const weaponSlug = () =>
		cached("weaponSlug", async () => {
			const slug = "splattershot";
			if (weaponNameSlugToId(slug) === null) {
				throw new Error(`"${slug}" no longer resolves to a weapon id`);
			}
			return { slug };
		});

	const calendarWeek = () =>
		cached("calendarWeek", async () => {
			const eventDate = await db
				.selectFrom("CalendarEventDate")
				.select(["startsAt"])
				.orderBy("startsAt", "asc")
				.executeTakeFirst();
			if (!eventDate) return null;

			const date = databaseTimestampToDate(eventDate.startsAt);
			for (const year of [date.getFullYear() - 1, date.getFullYear()]) {
				for (let week = 1; week <= 53; week++) {
					const { startTime, endTime } = weekNumberToDateRange({ year, week });
					if (date >= startTime && date <= endTime) {
						return { year, week };
					}
				}
			}
			return null;
		});

	const rules: Array<{
		matches: (pattern: string) => boolean;
		params: () => Promise<ParamValues>;
	}> = [
		{
			matches: (pattern) =>
				pattern.startsWith("/u/:identifier") ||
				pattern.startsWith("/api/user/:identifier") ||
				pattern.startsWith("/api/user/:userId") ||
				pattern.startsWith("/api/sendouq/active-match/:userId") ||
				pattern.startsWith("/user-card/:id") ||
				pattern === "/user-report/:id",
			params: adminUser,
		},
		{
			matches: (pattern) => pattern === "/short/:customUrl",
			params: () =>
				cached("shortUrlUser", async () => {
					const user = await db
						.selectFrom("User")
						.select(["customUrl"])
						.where("customUrl", "is not", null)
						.orderBy("id", "asc")
						.executeTakeFirst();
					return user?.customUrl ? { customUrl: user.customUrl } : null;
				}),
		},
		{
			matches: (pattern) => pattern.startsWith("/badges/:id"),
			params: () =>
				cached("badge", async () => {
					const badge = await db
						.selectFrom("Badge")
						.select(["id"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return badge ? { id: badge.id } : null;
				}),
		},
		{
			matches: (pattern) => pattern.startsWith("/trophies/:id"),
			params: () =>
				cached("trophy", async () => {
					const owner = await db
						.selectFrom("TrophyOwner")
						.select(["trophyId", "userId"])
						.orderBy("trophyId", "asc")
						.executeTakeFirst();
					if (owner) return { id: owner.trophyId, userId: owner.userId };

					const trophy = await db
						.selectFrom("Trophy")
						.select(["id"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					const admin = await adminUser();
					if (!trophy || !admin) return null;
					return { id: trophy.id, userId: admin.id };
				}),
		},
		{
			matches: (pattern) => pattern.startsWith("/calendar/:id"),
			params: () =>
				cached("calendarEvent", async () => {
					const event = await db
						.selectFrom("CalendarEvent")
						.select(["id"])
						.where("tournamentId", "is", null)
						.orderBy("id", "asc")
						.executeTakeFirst();
					return event ? { id: event.id } : null;
				}),
		},
		{
			matches: (pattern) => pattern === "/api/calendar/:year/:week",
			params: calendarWeek,
		},
		{
			matches: (pattern) =>
				pattern.startsWith("/to/:id") ||
				pattern.startsWith("/api/tournament/:id"),
			params: tournamentContext,
		},
		{
			matches: (pattern) => pattern === "/api/tournament-match/:id",
			params: () =>
				cached("tournamentMatch", async () => {
					const context = await tournamentContext();
					return context ? { id: context.mid } : null;
				}),
		},
		{
			matches: (pattern) => pattern.startsWith("/org/:slug"),
			params: () =>
				cached("org", async () => {
					const org = await db
						.selectFrom("TournamentOrganization")
						.select(["slug"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return org ? { slug: org.slug } : null;
				}),
		},
		{
			matches: (pattern) => pattern === "/api/org/:id",
			params: () =>
				cached("orgId", async () => {
					const org = await db
						.selectFrom("TournamentOrganization")
						.select(["id"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return org ? { id: org.id } : null;
				}),
		},
		{
			matches: (pattern) => pattern.startsWith("/t/:customUrl"),
			params: () =>
				cached("team", async () => {
					const team = await db
						.selectFrom("Team")
						.select(["customUrl"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return team ? { customUrl: team.customUrl } : null;
				}),
		},
		{
			matches: (pattern) => pattern === "/api/team/:id",
			params: () =>
				cached("teamId", async () => {
					const team = await db
						.selectFrom("Team")
						.select(["id"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return team ? { id: team.id } : null;
				}),
		},
		{
			matches: (pattern) => pattern === "/vods/:id",
			params: () =>
				cached("vod", async () => {
					const vod = await db
						.selectFrom("UnvalidatedVideo")
						.select(["id"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return vod ? { id: vod.id } : null;
				}),
		},
		{
			matches: (pattern) =>
				pattern.startsWith("/builds/:slug") || pattern === "/params/:slug",
			params: weaponSlug,
		},
		{
			matches: (pattern) => pattern === "/xsearch/player/:id",
			params: () =>
				cached("xrankPlayer", async () => {
					const placement = await db
						.selectFrom("XRankPlacement")
						.select(["playerId"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return placement ? { id: placement.playerId } : null;
				}),
		},
		{
			matches: (pattern) =>
				pattern === "/q/match/:id" || pattern === "/api/sendouq/match/:matchId",
			params: () =>
				cached("groupMatch", async () => {
					const match = await db
						.selectFrom("GroupMatch")
						.select(["id"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return match ? { id: match.id, matchId: match.id } : null;
				}),
		},
		{
			matches: (pattern) => pattern === "/scrims/:id",
			params: () =>
				cached("scrimPost", async () => {
					const post = await db
						.selectFrom("ScrimPost")
						.select(["id"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return post ? { id: post.id } : null;
				}),
		},
		{
			matches: (pattern) => pattern === "/a/:slug",
			params: () =>
				cached("article", async () => {
					const articlesDir = path.join(APP_DIR, "content", "articles");
					const slug = fs
						.readdirSync(articlesDir)
						.filter((file) => file.endsWith(".md"))
						.sort()[0]
						?.replace(/\.md$/, "");
					return slug ? { slug } : null;
				}),
		},
		{
			matches: (pattern) =>
				pattern === "/plus/suggestions/comment/:tier/:userId",
			params: () =>
				cached("plusSuggestion", async () => {
					const suggestion = await db
						.selectFrom("PlusSuggestion")
						.select(["tier", "suggestedId"])
						.orderBy("id", "asc")
						.executeTakeFirst();
					return suggestion
						? { tier: suggestion.tier, userId: suggestion.suggestedId }
						: null;
				}),
		},
	];

	return async (pattern: string): Promise<ParamValues> => {
		const rule = rules.find((candidate) => candidate.matches(pattern));
		if (!rule) {
			throw new Error(
				`No param resolver covers "${pattern}" — add one to scripts/route-census.ts`,
			);
		}
		return await rule.params();
	};
}
