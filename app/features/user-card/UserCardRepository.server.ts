import { sub } from "date-fns";
import type { Expression, ExpressionBuilder } from "kysely";
import { sql } from "kysely";
import { jsonBuildObject, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type {
	CustomTheme,
	HideableUserCardStat,
	PeakXP,
	Tables,
	XRankPlacementRegion,
} from "~/db/tables";
import { actorId, actorIdOrNull } from "~/features/auth/core/user.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import { LFG } from "~/features/lfg/lfg-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import { TIERS } from "~/features/mmr/mmr-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import { userSkills } from "~/features/mmr/tiered.server";
import type { StageId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	commonUserObjectFields,
	concatUserSubmittedImagePrefix,
} from "~/utils/kysely.server";
import { PRESET_COLORS } from "../tier-list-maker/tier-list-maker-constants";
import type {
	UserCardData,
	UserCardStat,
	UserCardStatXPValue,
} from "./user-card-types";

/**
 * Loads `UserCardData` for many users at once, keyed by user id. The single batched DB query (see
 * {@link userCardDataJsonObject}) is merged with the in-memory SEASON caches (tier from
 * `userSkills`, leaderboard placement from `cachedFullUserLeaderboard`) in this app-layer enrich
 * pass, producing the fully-formed `stats` array each card renders. The acting user viewing the
 * cards (resolved from request context via `actorIdOrNull()`, or `null` when anonymous) scopes the
 * per-viewer `privateNote`.
 *
 * Designed to be spread into a route loader (`{ ...(await userCards(...)) }`) so the `UserCard`
 * component can resolve its own data from the route tree by id.
 */
export async function userCards({
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

	const viewerId = actorIdOrNull();

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

	return { userCards };
}

/**
 * Raw card fields the edit form needs that are not part of {@link UserCardData}: the uploaded banner
 * image (id + preview url, for the image field's default value), the self-reported peak XP, and the
 * hidden stat types (to pre-check the visibility toggles).
 */
export async function cardEditExtras(userId: number) {
	const row = await db
		.selectFrom("User")
		.select((eb) => [
			"User.bannerImgId",
			"User.unverifiedPeakXP",
			"User.hiddenCardStats",
			bannerImageUrl(eb).as("bannerImageUrl"),
		])
		.where("User.id", "=", userId)
		.executeTakeFirst();

	return {
		bannerImgId: row?.bannerImgId ?? null,
		bannerImageUrl: row?.bannerImageUrl ?? null,
		unverifiedPeakXP: row?.unverifiedPeakXP ?? null,
		hiddenCardStats: row?.hiddenCardStats ?? [],
	};
}

/** Updates the editable user card fields of the acting user (their own card). */
export function updateOwnCard(args: {
	shortBio: string | null;
	bannerPresetImg: string | null;
	bannerImgId: number | null;
	unverifiedPeakXP: PeakXP | null;
	hiddenCardStats: Array<HideableUserCardStat>;
}) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
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
				hiddenCardStats:
					args.hiddenCardStats.length > 0
						? JSON.stringify(args.hiddenCardStats)
						: null,
			})
			.where("id", "=", userId)
			.execute();
	});
}

/** SQLite `case` expression mapping `User.id % PRESET_COLORS.length` to a preset banner color. */
const BANNER_PRESET_COLOR_CASE = `case "User"."id" % ${PRESET_COLORS.length}\n${PRESET_COLORS.map(
	(color, index) => `when ${index} then '${color}'`,
).join("\n")}\nend`;

/**
 * Kysely expression building the JSON object for all DB-resident `UserCard` fields of a single user.
 * Designed to be composed both standalone (one user) and inside a batched list query (see
 * {@link userCards}). `"User"` must be in scope at the call site.
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
		customTheme: sql<CustomTheme | null>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme", null)`,
		hiddenCardStats: eb.ref("User.hiddenCardStats"),
		banner: bannerJson(eb),
		friendCode: include?.friendCode
			? friendCodeScalar(eb)
			: sql<string | null>`null`,
		privateNote: privateNoteJson(eb, viewerId),
		freeAgentPostId: freeAgentPostIdScalar(eb),
		plusTier: plusTierScalar(eb),
		xpVerified: xpVerifiedJson(eb),
		xpUnverified: xpUnverifiedJson(),
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

/** Single highest X Rank power placement (verified XP). */
function xpVerifiedJson(eb: ExpressionBuilder<Tables, "User">) {
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
				sql<number>`"XRankPlacement"."power"`.as("points"),
				"XRankPlacement.region",
			])
			.orderBy("XRankPlacement.power", "desc")
			.limit(1),
	);
}

/**
 * Self-reported peak XP from the `User.unverifiedPeakXP` column. Has exactly one of `tentatek` /
 * `takoroka` defined, which decides the region (`tentatek` = `WEST`, `takoroka` = `JPN`); `points`
 * is that region's value.
 */
function xpUnverifiedJson() {
	return sql<{ points: number; region: XRankPlacementRegion } | null>`
		iif(
			"User"."unverifiedPeakXP" is null,
			null,
			json_object(
				'points', "User"."unverifiedPeakXP" ->> '$.overall',
				'region', iif("User"."unverifiedPeakXP" ->> '$.tentatek' is not null, 'WEST', 'JPN')
			)
		)
	`;
}

type SeasonResult = {
	skills: Record<string, TieredSkill>;
	placementsByUserId: Map<number, number>;
};

/**
 * Resolves one finished season's data for the requested users. `userSkills` is a synchronous
 * in-memory cache, so we read tiers first and only fetch the (DB-backed) leaderboard when at least
 * one requested user reached Leviathan+ that season—placements are surfaced for that rank only, so
 * the common case of regular users never touches the leaderboard cache at all.
 */
async function seasonResult(
	season: number,
	userIds: Array<number>,
): Promise<SeasonResult> {
	const skills = userSkills(season).userSkills;

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
		xpVerified: cardData.xpVerified,
		xpUnverified: cardData.xpUnverified,
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
	xpVerified,
	xpUnverified,
	seasonSkill,
	seasonTop,
}: {
	div: string | null;
	plusTier: number | null;
	xpVerified: { points: number; region: XRankPlacementRegion } | null;
	xpUnverified: { points: number; region: XRankPlacementRegion } | null;
	seasonSkill: TieredSkill | undefined;
	seasonTop: number | null;
}): Array<UserCardStat> {
	const stats: Array<UserCardStat> = [];

	const xpValues: Array<UserCardStatXPValue> = [];
	if (xpUnverified) {
		xpValues.push({
			isVerified: false,
			region: xpUnverified.region,
			points: xpUnverified.points,
		});
	}
	if (xpVerified) {
		xpValues.push({
			isVerified: true,
			region: xpVerified.region,
			points: xpVerified.points,
		});
	}
	if (xpValues.length > 0) {
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
