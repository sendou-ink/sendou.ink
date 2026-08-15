import { sub } from "date-fns";
import type { Expression, ExpressionBuilder } from "kysely";
import { sql } from "kysely";
import { ServerConfig } from "~/config.server";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { CustomTheme, PeakXP } from "~/db/tables-json";
import { actorId, actorIdOrNull } from "~/features/auth/core/user.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import { LFG } from "~/features/lfg/lfg-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import { TIERS } from "~/features/mmr/mmr-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import { userSkills } from "~/features/mmr/tiered.server";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
import { LRUCache } from "~/modules/cache";
import type { StageId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	asJson,
	commonUserObjectFields,
	concatUserSubmittedImagePrefix,
	jsonBuildObject,
	jsonObjectFrom,
} from "~/utils/kysely.server";
import { PRESET_COLORS } from "../tier-list-maker/tier-list-maker-constants";
import type {
	HideableUserCardStat,
	UserCardData,
	UserCardStat,
	UserCardStatXPValue,
} from "./user-card-types";
import { isValidUnverifiedXp } from "./user-card-utils";

/**
 * Loads `UserCardData` for many users at once, keyed by user id. The single batched DB query (see
 * {@link userCardDataJsonObject}) is merged with the in-memory SEASON caches (tier from
 * `userSkills`, leaderboard placement from `cachedFullUserLeaderboard`) in this app-layer enrich
 * pass, producing the fully-formed `stats` array each card renders. The acting user viewing the
 * cards (resolved from request context via `actorIdOrNull()`, or `null` when anonymous) scopes the
 * per-viewer `privateNote`.
 *
 * Designed to be spread into a route loader (`{ ...(await findAllByUserIds(...)) }`) so the `UserCard`
 * component can resolve its own data from the route tree by id.
 */
export async function findAllByUserIds({
	userIds,
	include,
	includeHiddenStats = false,
}: {
	userIds: Array<number>;
	/** Opt-in fields skipped from the query by default; defaults to `false` each. */
	include?: { friendCode?: boolean };
	/**
	 * Keep stats the user has hidden in the resolved `stats` array. Off by default so hidden stat
	 * values never reach a viewer; the edit page opts in to render (and un-hide) its own toggles.
	 */
	includeHiddenStats?: boolean;
}): Promise<{ userCards: Map<number, UserCardData> }> {
	if (userIds.length === 0) return { userCards: new Map() };

	return {
		userCards: await queryUserCards({
			userIds,
			viewerId: actorIdOrNull(),
			include,
			includeHiddenStats,
		}),
	};
}

const CARD_CACHE_TTL_MS = 30 * 1000;
const CARD_CACHE_MAX_ENTRIES = 3_000;
const cardCache = new LRUCache<
	number,
	{ storedAt: number; card: Promise<UserCardData | undefined> }
>({ max: CARD_CACHE_MAX_ENTRIES });

/**
 * Like {@link findAllByUserIds} but serves the viewer-independent card data from a
 * short-lived in-memory cache, querying only users whose entry is missing or stale.
 * The per-viewer `privateNote` and the opt-in `friendCode` are overlaid fresh on
 * every call so a cached card is never viewer- or caller-specific. For high-frequency
 * views (the SendouQ looking page) where broadcast-driven revalidation makes many
 * clients rebuild the same cards at once; cards may be up to 30 seconds stale.
 *
 * The cache holds the in-flight query rather than its result, so concurrent misses for
 * the same user (exactly what a revalidation burst causes) await one shared query
 * instead of each firing their own.
 */
export async function findAllByUserIdsCached({
	userIds,
	include,
}: {
	userIds: Array<number>;
	/** Opt-in fields skipped by default; defaults to `false` each. */
	include?: { friendCode?: boolean };
}): Promise<{ userCards: Map<number, UserCardData> }> {
	if (ServerConfig.disableCache) return findAllByUserIds({ userIds, include });
	if (userIds.length === 0) return { userCards: new Map() };

	const now = Date.now();
	const pendingCards = new Map<number, Promise<UserCardData | undefined>>();
	const missingIds: Array<number> = [];
	for (const userId of userIds) {
		const entry = cardCache.get(userId);
		if (entry && now - entry.storedAt < CARD_CACHE_TTL_MS) {
			pendingCards.set(userId, entry.card);
		} else {
			missingIds.push(userId);
		}
	}

	if (missingIds.length > 0) {
		const query = queryUserCards({ userIds: missingIds, viewerId: null });
		for (const userId of missingIds) {
			pendingCards.set(userId, cacheQueriedCard({ userId, query, now }));
		}
	}

	const cards = new Map<number, UserCardData>();
	for (const [userId, pendingCard] of pendingCards) {
		const card = await pendingCard;
		if (card) cards.set(userId, card);
	}

	const privateNotes = await findPrivateNotesByTargetIds([...cards.keys()]);
	const friendCodes = include?.friendCode
		? await findFriendCodesByUserIds([...cards.keys()])
		: new Map<number, string>();

	const userCards = new Map<number, UserCardData>();
	for (const [userId, card] of cards) {
		userCards.set(userId, {
			...card,
			privateNote: privateNotes.get(userId) ?? null,
			friendCode: friendCodes.get(userId) ?? null,
		});
	}

	return { userCards };
}

/** Forgets every cached card, so the next read builds them from the database again. */
export function clearUserCardCache() {
	cardCache.clear();
}

function cacheQueriedCard({
	userId,
	query,
	now,
}: {
	userId: number;
	query: Promise<Map<number, UserCardData>>;
	now: number;
}) {
	const card = query.then((userCards) => userCards.get(userId));
	const entry = { storedAt: now, card };

	// a failed query must not stay behind as this user's cached entry
	card.catch(() => {
		if (cardCache.get(userId) === entry) {
			cardCache.delete(userId);
		}
	});
	cardCache.set(userId, entry);

	return card;
}

async function queryUserCards({
	userIds,
	viewerId,
	include,
	includeHiddenStats = false,
}: {
	userIds: Array<number>;
	viewerId: number | null;
	include?: { friendCode?: boolean };
	includeHiddenStats?: boolean;
}): Promise<Map<number, UserCardData>> {
	// a user's card surfaces the better of their last two finished seasons (see bestSeasonResult)
	const [rows, seasonResults] = await Promise.all([
		db
			.selectFrom("User")
			.select((eb) =>
				userCardDataJsonObject(eb, { viewerId, include }).as("cardData"),
			)
			.where("User.id", "in", userIds)
			.execute(),
		Promise.all(
			Seasons.allFinished()
				.slice(0, 2)
				.map((season) => seasonResult(season, userIds)),
		),
	]);

	const userCards = new Map<number, UserCardData>();
	for (const { cardData } of rows) {
		userCards.set(
			cardData.id,
			enrichUserCardData(
				cardData,
				bestSeasonResult(cardData.id, seasonResults),
				includeHiddenStats,
			),
		);
	}

	return userCards;
}

/** The acting user's private notes about the given users, keyed by their user id. */
async function findPrivateNotesByTargetIds(userIds: Array<number>) {
	const notes = new Map<number, NonNullable<UserCardData["privateNote"]>>();

	const viewerId = actorIdOrNull();
	if (viewerId === null || userIds.length === 0) return notes;

	const rows = await db
		.selectFrom("PrivateUserNote")
		.select([
			"PrivateUserNote.targetId",
			"PrivateUserNote.text",
			"PrivateUserNote.sentiment",
			"PrivateUserNote.updatedAt",
		])
		.where("PrivateUserNote.authorId", "=", viewerId)
		.where("PrivateUserNote.targetId", "in", userIds)
		.execute();

	for (const { targetId, ...privateNote } of rows) {
		notes.set(targetId, privateNote);
	}

	return notes;
}

/**
 * Latest friend code of each given user, keyed by their user id. Scanned oldest to newest so the
 * newest code is the one left in the map, matching {@link friendCodeScalar}.
 */
async function findFriendCodesByUserIds(userIds: Array<number>) {
	const friendCodes = new Map<number, string>();
	if (userIds.length === 0) return friendCodes;

	const rows = await db
		.selectFrom("UserFriendCode")
		.select(["UserFriendCode.userId", "UserFriendCode.friendCode"])
		.where("UserFriendCode.userId", "in", userIds)
		.orderBy("UserFriendCode.createdAt", "asc")
		.execute();

	for (const row of rows) {
		friendCodes.set(row.userId, row.friendCode);
	}

	return friendCodes;
}

/**
 * Raw card fields the edit form needs that are not part of {@link UserCardData}: the uploaded banner
 * image (id + preview url, for the image field's default value), the self-reported peak XP, the
 * picked XP division, and the hidden stat types (to pre-check the visibility toggles).
 */
export async function findCardEditExtrasByUserId(userId: number) {
	const row = await db
		.selectFrom("User")
		.select((eb) => [
			"User.bannerImgId",
			"User.unverifiedPeakXP",
			"User.xpDivision",
			"User.hiddenCardStats",
			bannerImageUrl(eb).as("bannerImageUrl"),
		])
		.where("User.id", "=", userId)
		.executeTakeFirst();

	return {
		bannerImgId: row?.bannerImgId ?? null,
		bannerImageUrl: row?.bannerImageUrl ?? null,
		unverifiedPeakXP: row?.unverifiedPeakXP ?? null,
		xpDivision: row?.xpDivision ?? null,
		hiddenCardStats: row?.hiddenCardStats ?? [],
	};
}

/**
 * The verified XP the user's card shows if their XP division were `xpDivision`, resolved exactly as
 * {@link findAllByUserIds} does (see {@link verifiedXp}). `null` when they have no X Rank placements.
 * Lets the edit form judge a self-reported peak XP against the very value it will sit on top of.
 */
export async function findVerifiedXpByUserId(
	userId: number,
	xpDivision: XRankPlacementRegion | null,
) {
	const row = await db
		.selectFrom("User")
		.select((eb) => xpPeaksJson(eb).as("xpPeaks"))
		.where("User.id", "=", userId)
		.executeTakeFirst();

	return verifiedXp(row?.xpPeaks ?? null, xpDivision);
}

/**
 * Updates the editable user card fields of the acting user (their own card), dropping their
 * cached card so they are not shown their pre-edit one by {@link findAllByUserIdsCached}.
 */
export async function updateOwnCard(args: {
	shortBio: string | null;
	bannerPresetImg: string | null;
	bannerImgId: number | null;
	unverifiedPeakXP: PeakXP | null;
	/** `null` leaves the card showing their highest XP across both divisions. */
	xpDivision: XRankPlacementRegion | null;
	hiddenCardStats: Array<HideableUserCardStat>;
}) {
	const userId = actorId();
	await db.transaction().execute(async (trx) => {
		// a removed or replaced uploaded banner is no longer referenced by anything,
		// so its submitted image row is cleaned up (mirrors custom avatar handling)
		const current = await trx
			.selectFrom("User")
			.select("User.bannerImgId")
			.where("id", "=", userId)
			.executeTakeFirst();
		if (current?.bannerImgId && current.bannerImgId !== args.bannerImgId) {
			await trx
				.deleteFrom("UnvalidatedUserSubmittedImage")
				.where("id", "=", current.bannerImgId)
				.where("UnvalidatedUserSubmittedImage.submitterUserId", "=", userId)
				.execute();
		}

		await trx
			.updateTable("User")
			.set({
				shortBio: args.shortBio,
				bannerPresetImg: args.bannerPresetImg,
				bannerImgId: args.bannerImgId,
				unverifiedPeakXP: args.unverifiedPeakXP
					? JSON.stringify(args.unverifiedPeakXP)
					: null,
				xpDivision: args.xpDivision,
				hiddenCardStats:
					args.hiddenCardStats.length > 0
						? JSON.stringify(args.hiddenCardStats)
						: null,
			})
			.where("id", "=", userId)
			.execute();
	});

	cardCache.delete(userId);
}

/** SQLite `case` expression mapping `User.id % PRESET_COLORS.length` to a preset banner color. */
const BANNER_PRESET_COLOR_CASE = `case "User"."id" % ${PRESET_COLORS.length}\n${PRESET_COLORS.map(
	(color, index) => `when ${index} then '${color}'`,
).join("\n")}\nend`;

/**
 * Kysely expression building the JSON object for all DB-resident `UserCard` fields of a single user.
 * Designed to be composed both standalone (one user) and inside a batched list query (see
 * {@link findAllByUserIds}). `"User"` must be in scope at the call site.
 *
 * SEASON stats (tier + leaderboard placement) are NOT included here — they live in the in-memory
 * `userSkills`/leaderboard caches and are merged in an app-layer enrich pass. `banner` is returned as
 * loosely-typed fields (narrow to the discriminated union there). `friendCode` is opt-in via
 * `include.friendCode` (defaults to off, resolving to `null`) so callers that never surface it skip
 * the extra correlated subquery.
 */
function userCardDataJsonObject(
	eb: ExpressionBuilder<Tables, "User">,
	{
		viewerId,
		include,
	}: {
		viewerId: number | null;
		include?: { friendCode?: boolean };
	},
) {
	return jsonBuildObject({
		...commonUserObjectFields(eb),
		shortBio: eb.ref("User.shortBio"),
		div: eb.ref("User.div"),
		customTheme: asJson(
			sql<CustomTheme | null>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme", null)`,
		),
		hiddenCardStats: eb.ref("User.hiddenCardStats"),
		banner: bannerJson(eb),
		friendCode: include?.friendCode
			? friendCodeScalar(eb)
			: sql<string | null>`null`,
		privateNote: privateNoteJson(eb, viewerId),
		freeAgentPostId: freeAgentPostIdScalar(eb),
		plusTier: plusTierScalar(eb),
		xpDivision: eb.ref("User.xpDivision"),
		xpPeaks: xpPeaksJson(eb),
		xpUnverifiedPoints: xpUnverifiedPointsScalar(),
	});
}

type RawUserCardData =
	ReturnType<typeof userCardDataJsonObject> extends Expression<infer T>
		? T
		: never;

/**
 * Loosely-typed banner. A supporter-uploaded image (`User.bannerImgId`) takes precedence and yields
 * a `URL` banner; otherwise it is pulled from the `User.bannerPresetImg` column ("hex code or stage
 * id") where a numeric value is a stage id (`STAGE`) and anything else a `COLOR` hex code. When both
 * are null (no explicit choice) a preset color is derived from the user id. Narrow to the
 * `{ URL | COLOR | STAGE }` union in the enrich pass.
 */
function bannerJson(eb: ExpressionBuilder<Tables, "User">) {
	return jsonBuildObject({
		type: sql<"URL" | "COLOR" | "STAGE">`
			case
				when "User"."bannerImgId" is not null then 'URL'
				when "User"."bannerPresetImg" GLOB '[0-9]*' then 'STAGE'
				else 'COLOR'
			end`,
		url: bannerImageUrl(eb),
		hexCode: sql<string | null>`
			case
				when "User"."bannerPresetImg" is null then (${sql.raw(BANNER_PRESET_COLOR_CASE)})
				when "User"."bannerPresetImg" GLOB '[0-9]*' then null
				else "User"."bannerPresetImg"
			end`,
		stageId: sql<
			number | null
		>`iif("User"."bannerPresetImg" GLOB '[0-9]*', CAST("User"."bannerPresetImg" AS INTEGER), null)`,
	});
}

/** Full URL of the supporter-uploaded banner image (resolved from `User.bannerImgId`), or null. */
function bannerImageUrl(eb: ExpressionBuilder<Tables, "User">) {
	return concatUserSubmittedImagePrefix(
		eb
			.selectFrom("UserSubmittedImage")
			.select("UserSubmittedImage.url")
			.whereRef("UserSubmittedImage.id", "=", "User.bannerImgId")
			.$asScalar(),
	).$castTo<string | null>();
}

function friendCodeScalar(eb: ExpressionBuilder<Tables, "User">) {
	return eb
		.selectFrom("UserFriendCode")
		.select("UserFriendCode.friendCode")
		.whereRef("UserFriendCode.userId", "=", "User.id")
		.orderBy("UserFriendCode.createdAt", "desc")
		.limit(1)
		.$asScalar();
}

function privateNoteJson(
	eb: ExpressionBuilder<Tables, "User">,
	viewerId: number | null,
) {
	if (viewerId === null) {
		return sql<Pick<
			Tables["PrivateUserNote"],
			"text" | "sentiment" | "updatedAt"
		> | null>`null`;
	}

	return jsonObjectFrom(
		eb
			.selectFrom("PrivateUserNote")
			.select([
				"PrivateUserNote.text",
				"PrivateUserNote.sentiment",
				"PrivateUserNote.updatedAt",
			])
			.where("PrivateUserNote.authorId", "=", viewerId)
			.whereRef("PrivateUserNote.targetId", "=", "User.id"),
	);
}

/**
 * Id of the user's most recent non-expired "looking for team" LFG post, which marks them as a free
 * agent. `null` when they have no such post. Mirrors the LFG page's freshness cutoff so the id always
 * points at a post that is still listed there.
 */
function freeAgentPostIdScalar(eb: ExpressionBuilder<Tables, "User">) {
	return eb
		.selectFrom("LFGPost")
		.select("LFGPost.id")
		.whereRef("LFGPost.authorId", "=", "User.id")
		.where("LFGPost.type", "=", "PLAYER_FOR_TEAM")
		.where(
			"LFGPost.updatedAt",
			">",
			dateToDatabaseTimestamp(
				sub(new Date(), { days: LFG.POST_FRESHNESS_DAYS }),
			),
		)
		.orderBy("LFGPost.updatedAt", "desc")
		.limit(1)
		.$asScalar();
}

function plusTierScalar(eb: ExpressionBuilder<Tables, "User">) {
	return eb
		.selectFrom("PlusTier")
		.select("PlusTier.tier")
		.whereRef("PlusTier.userId", "=", "User.id")
		.$asScalar();
}

type XpPeaks = Record<XRankPlacementRegion, number | null> | null;

/**
 * Highest X Rank power placement (verified XP) per division. Both are read because the division the
 * card settles on is resolved in the app layer (see {@link verifiedXp}); with no placements at all
 * the aggregates simply come back null.
 */
function xpPeaksJson(eb: ExpressionBuilder<Tables, "User">) {
	return jsonObjectFrom(
		eb
			.selectFrom("XRankPlacement")
			.innerJoin(
				"SplatoonPlayer",
				"SplatoonPlayer.id",
				"XRankPlacement.playerId",
			)
			.whereRef("SplatoonPlayer.userId", "=", "User.id")
			.select([
				sql<
					number | null
				>`max(iif("XRankPlacement"."region" = 'WEST', "XRankPlacement"."power", null))`.as(
					"WEST",
				),
				sql<
					number | null
				>`max(iif("XRankPlacement"."region" = 'JPN', "XRankPlacement"."power", null))`.as(
					"JPN",
				),
			]),
	);
}

/**
 * Self-reported peak XP from the `User.unverifiedPeakXP` column.
 */
function xpUnverifiedPointsScalar() {
	return sql<number | null>`"User"."unverifiedPeakXP" ->> '$.overall'`;
}

type SeasonResult = {
	skills: Record<string, TieredSkill>;
	placementsByUserId: Map<number, number>;
};

/**
 * Resolves one finished season's data for the requested users. `userSkills` is an in-memory
 * cache, so we read tiers first and only fetch the (DB-backed) leaderboard when at least
 * one requested user reached Leviathan+ that season—placements are surfaced for that rank only, so
 * the common case of regular users never touches the leaderboard cache at all.
 */
async function seasonResult(
	season: number,
	userIds: Array<number>,
): Promise<SeasonResult> {
	const skills = (await userSkills(season)).userSkills;

	const anyLeviathanPlus = userIds.some((id) => {
		const skill = skills[id];
		return (
			skill !== undefined && !skill.approximate && isLeviathanPlus(skill.tier)
		);
	});

	const placementsByUserId = anyLeviathanPlus
		? await finishedSeasonPlacements(season)
		: new Map<number, number>();

	return { skills, placementsByUserId };
}

const placementsBySeason = new Map<number, Map<number, number>>();

/**
 * Leaderboard placements of a finished season, keyed by user id. Cached for the process lifetime:
 * a finished season's leaderboard is immutable, matching how `userSkills` already holds finished
 * seasons' tiers permanently. This keeps cards off `cachedFullUserLeaderboard`'s TTL, whose
 * synchronous rebuild would otherwise stall the first Leviathan+ card render after a quiet period.
 */
async function finishedSeasonPlacements(
	season: number,
): Promise<Map<number, number>> {
	const cached = placementsBySeason.get(season);
	if (cached) return cached;

	const placements = new Map(
		(await cachedFullUserLeaderboard(season)).map((entry) => [
			entry.id,
			entry.placementRank,
		]),
	);
	placementsBySeason.set(season, placements);

	return placements;
}

const isLeviathanPlus = (tier: TieredSkill["tier"]) =>
	tier.name === "LEVIATHAN" && tier.isPlus;

/**
 * Comparable strength of a tier (higher = better). Based on the tier's position in `TIERS` rather
 * than the raw ordinal, because each season sets its own ordinal thresholds—the same ordinal can
 * map to different tiers across seasons—so only the tier itself is comparable. `isPlus` (top half of
 * a tier) breaks ties within the same tier name.
 */
const tierStrength = (tier: TieredSkill["tier"]) => {
	const index = TIERS.findIndex((t) => t.name === tier.name);
	return (TIERS.length - index) * 2 + (tier.isPlus ? 1 : 0);
};

/**
 * Reduces a user's results across the last two finished seasons into the single result their card
 * shows: the highest tier they reached (ignoring `approximate` tiers, which lack enough matches to
 * count), and—only when that includes the very top Leviathan+ rank—their best (lowest) leaderboard
 * placement among the Leviathan+ seasons.
 */
function bestSeasonResult(
	userId: number,
	seasonResults: Array<SeasonResult>,
): { seasonSkill: TieredSkill | undefined; seasonTop: number | null } {
	let seasonSkill: TieredSkill | undefined;
	let seasonTop: number | null = null;

	for (const { skills, placementsByUserId } of seasonResults) {
		const skill = skills[userId];
		if (!skill || skill.approximate) continue;

		if (
			!seasonSkill ||
			tierStrength(skill.tier) > tierStrength(seasonSkill.tier)
		) {
			seasonSkill = skill;
		}

		if (isLeviathanPlus(skill.tier)) {
			const placement = placementsByUserId.get(userId);
			if (
				typeof placement === "number" &&
				(seasonTop === null || placement < seasonTop)
			) {
				seasonTop = placement;
			}
		}
	}

	return { seasonSkill, seasonTop };
}

function enrichUserCardData(
	cardData: RawUserCardData,
	{
		seasonSkill,
		seasonTop,
	}: { seasonSkill: TieredSkill | undefined; seasonTop: number | null },
	includeHiddenStats: boolean,
): UserCardData {
	const hiddenStats: Array<UserCardStat["type"]> =
		cardData.hiddenCardStats ?? [];

	const stats = userCardStats({
		div: cardData.div,
		plusTier: cardData.plusTier,
		xpDivision: cardData.xpDivision,
		xpVerified: verifiedXp(cardData.xpPeaks, cardData.xpDivision),
		xpUnverifiedPoints: cardData.xpUnverifiedPoints,
		seasonSkill,
		seasonTop,
	});

	return {
		id: cardData.id,
		username: cardData.username,
		discordId: cardData.discordId,
		discordAvatar: cardData.discordAvatar,
		customUrl: cardData.customUrl,
		customAvatarUrl: cardData.customAvatarUrl,
		shortBio: cardData.shortBio,
		customTheme: cardData.customTheme,
		banner: enrichBanner(cardData.banner),
		friendCode: cardData.friendCode,
		freeAgentPostId: cardData.freeAgentPostId,
		privateNote: cardData.privateNote,
		stats: includeHiddenStats
			? stats
			: stats.filter((stat) => !hiddenStats.includes(stat.type)),
	};
}

/**
 * The verified XP a card shows: the peak of the division the user picked, since the two divisions
 * are separate ladders and a peak in one says nothing about the other. Falls back to their highest
 * across both when they picked no division or have never placed in the one they picked.
 */
function verifiedXp(
	peaks: XpPeaks,
	xpDivision: XRankPlacementRegion | null,
): { points: number; region: XRankPlacementRegion } | null {
	if (!peaks) return null;

	const pickedPeak = xpDivision ? peaks[xpDivision] : null;
	if (xpDivision && pickedPeak !== null) {
		return { points: pickedPeak, region: xpDivision };
	}

	const { WEST, JPN } = peaks;
	if (WEST !== null && (JPN === null || WEST >= JPN)) {
		return { points: WEST, region: "WEST" };
	}
	if (JPN !== null) {
		return { points: JPN, region: "JPN" };
	}

	return null;
}

function enrichBanner(
	banner: RawUserCardData["banner"],
): UserCardData["banner"] {
	if (banner.type === "URL" && banner.url) {
		return { type: "URL", url: banner.url };
	}

	if (banner.type === "STAGE") {
		return { type: "STAGE", stageId: banner.stageId as StageId };
	}

	return { type: "COLOR", hexCode: banner.hexCode ?? "" };
}

function userCardStats({
	div,
	plusTier,
	xpDivision,
	xpVerified,
	xpUnverifiedPoints,
	seasonSkill,
	seasonTop,
}: {
	div: string | null;
	plusTier: number | null;
	xpDivision: XRankPlacementRegion | null;
	xpVerified: { points: number; region: XRankPlacementRegion } | null;
	xpUnverifiedPoints: number | null;
	seasonSkill: TieredSkill | undefined;
	seasonTop: number | null;
}): Array<UserCardStat> {
	const stats: Array<UserCardStat> = [];

	if (xpVerified) {
		const unverified = unverifiedXpValue({
			points: xpUnverifiedPoints,
			region: xpDivision ?? xpVerified.region,
			verifiedPoints: xpVerified.points,
		});

		const xpValues: Array<UserCardStatXPValue> = unverified ? [unverified] : [];
		// the verified peak joins the claim only when it is from the division the claim was made in;
		// in another division it is a peak on a ladder the card is not about
		if (!unverified || unverified.region === xpVerified.region) {
			xpValues.push({
				isVerified: true,
				region: xpVerified.region,
				points: xpVerified.points,
			});
		}

		stats.push({ type: "XP", values: xpValues });
	}

	if (seasonSkill && !seasonSkill.approximate) {
		stats.push({ type: "SEASON", value: seasonSkill.tier, top: seasonTop });
	}

	if (typeof plusTier === "number") {
		stats.push({ type: "PLUS", value: plusTier });
	}

	if (div) {
		stats.push({ type: "DIV", value: div });
	}

	return stats;
}

function unverifiedXpValue({
	points,
	region,
	verifiedPoints,
}: {
	points: number | null;
	region: XRankPlacementRegion;
	verifiedPoints: number;
}): UserCardStatXPValue | null {
	if (points === null) return null;
	if (!isValidUnverifiedXp({ unverified: points, verified: verifiedPoints })) {
		return null;
	}

	return { isVerified: false, region, points };
}
