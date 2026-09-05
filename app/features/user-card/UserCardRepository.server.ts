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
 * `UserCardData` for many users, keyed by user id. One batched query ({@link userCardDataJsonObject})
 * merged with the in-memory SEASON caches (`userSkills`, `cachedFullUserLeaderboard`); `privateNote`
 * is scoped to the acting user. Spread the result into a route loader so `UserCard` can find it.
 */
export async function findAllByUserIds({
	userIds,
	include,
	includeHiddenStats = false,
}: {
	userIds: Array<number>;
	/** Opt-in fields skipped from the query by default. */
	include?: { friendCode?: boolean };
	/** Keep hidden stats in `stats`; only the edit page opts in, so hidden values never reach a viewer. */
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
 * Like {@link findAllByUserIds} but viewer-independent card data comes from a 30s in-memory cache
 * (for revalidation bursts on the SendouQ looking page); `privateNote` and `friendCode` are overlaid
 * fresh per call. The cache holds the in-flight query so concurrent misses share one query.
 */
export async function findAllByUserIdsCached({
	userIds,
	include,
}: {
	userIds: Array<number>;
	/** Opt-in fields skipped from the query by default. */
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

/** Drops every cached card. */
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

/** Latest friend code per user; scanned oldest to newest so the newest wins, like {@link friendCodeScalar}. */
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

/** Raw card fields the edit form needs that are not part of {@link UserCardData}. */
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
 * Verified XP the card would show with `xpDivision` (see {@link verifiedXp}), so the edit form can
 * judge a self-reported peak against it. `null` without X Rank placements.
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

/** Updates the acting user's own card and drops it from the cache. */
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
		// a removed or replaced uploaded banner's image row is cleaned up (mirrors custom avatar handling)
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
 * JSON object of all DB-resident card fields of one user; `"User"` must be in scope. SEASON stats
 * come from in-memory caches and are merged in the enrich pass, which also narrows `banner`.
 * `friendCode` is opt-in so callers that never surface it skip the correlated subquery.
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
 * Uploaded image (`bannerImgId`) wins; else `bannerPresetImg` holds a stage id (numeric) or a hex
 * color; with neither set a preset color is derived from the user id.
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

/** Latest non-expired "looking for team" post (uses the LFG page's freshness cutoff), marking a free agent. */
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

/** Peak X Rank power per division; the division shown is picked in the app layer (see {@link verifiedXp}). */
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

function xpUnverifiedPointsScalar() {
	return sql<number | null>`"User"."unverifiedPeakXP" ->> '$.overall'`;
}

type SeasonResult = {
	skills: Record<string, TieredSkill>;
	placementsByUserId: Map<number, number>;
};

/**
 * Placements are shown for Leviathan+ only, so the DB-backed leaderboard is fetched only when one
 * of the users reached it; tiers come from the in-memory `userSkills`.
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
 * Cached for the process lifetime since a finished season's leaderboard is immutable; avoids
 * `cachedFullUserLeaderboard`'s TTL rebuild stalling the first Leviathan+ card after a quiet period.
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
 * Higher = better. Uses the position in `TIERS`, not the ordinal, since ordinal thresholds differ per
 * season; `isPlus` breaks ties within a tier.
 */
const tierStrength = (tier: TieredSkill["tier"]) => {
	const index = TIERS.findIndex((t) => t.name === tier.name);
	return (TIERS.length - index) * 2 + (tier.isPlus ? 1 : 0);
};

/**
 * Highest non-approximate tier across the given seasons, plus the best leaderboard placement among
 * the Leviathan+ seasons.
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

/** Peak of the picked division (the divisions are separate ladders); else the highest across both. */
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
		// the verified peak is shown beside the claim only when it is from the same division
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
