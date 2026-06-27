import type { Expression, ExpressionBuilder } from "kysely";
import { sql } from "kysely";
import { jsonBuildObject, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { TIERS } from "~/features/mmr/mmr-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import { userSkills } from "~/features/mmr/tiered.server";
import type { StageId } from "~/modules/in-game-lists/types";
import { commonUserObjectFields } from "~/utils/kysely.server";
import { PRESET_COLORS } from "../tier-list-maker/tier-list-maker-constants";
import type {
	UserCardData,
	UserCardStat,
	UserCardStatXPValue,
	XPDivision,
} from "./user-card-types";

/**
 * Loads `UserCardData` for many users at once, keyed by user id. The single batched DB query (see
 * {@link userCardDataJsonObject}) is merged with the in-memory SEASON caches (tier from
 * `userSkills`, leaderboard placement from `cachedFullUserLeaderboard`) in this app-layer enrich
 * pass, producing the fully-formed `stats` array each card renders. `viewerId` is the logged-in
 * user viewing the cards (or `null`), used to resolve `isFriend`, `mutualFriends` and `privateNote`.
 *
 * Designed to be spread into a route loader (`{ ...(await userCards(...)) }`) so the `UserCard`
 * component can resolve its own data from the route tree by id.
 */
export async function userCards({
	userIds,
	viewerId,
	include,
}: {
	userIds: Array<number>;
	viewerId: number | null;
	/** Opt-in fields skipped from the query by default; defaults to `false` each. */
	include?: { friendCode?: boolean };
}): Promise<{ userCards: Map<number, UserCardData> }> {
	if (userIds.length === 0) return { userCards: new Map() };

	const rows = await db
		.selectFrom("User")
		.select((eb) =>
			userCardDataJsonObject(eb, { viewerId, include }).as("cardData"),
		)
		.where("User.id", "in", userIds)
		.execute();

	// a user's card surfaces the better of their last two finished seasons (see bestSeasonResult)
	const seasonResults: Array<SeasonResult> = await Promise.all(
		Seasons.allFinished()
			.slice(0, 2)
			.map((season) => seasonResult(season, userIds)),
	);

	const userCards = new Map<number, UserCardData>();
	for (const { cardData } of rows) {
		userCards.set(
			cardData.id,
			enrichUserCardData(
				cardData,
				bestSeasonResult(cardData.id, seasonResults),
			),
		);
	}

	return { userCards };
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
		customTheme: eb.ref("User.customTheme"),
		banner: bannerJson(),
		friendCode: include?.friendCode
			? friendCodeScalar(eb)
			: sql<string | null>`null`,
		privateNote: privateNoteJson(eb, viewerId),
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
 * Loosely-typed banner pulled from the `User.bannerPresetImg` column ("hex code or stage id"). A
 * numeric value is a stage id (`STAGE`), anything else is a `COLOR` hex code. When the column is
 * null (no explicit choice) a preset color is derived from the user id. Narrow to the
 * `{ COLOR | STAGE }` union in the enrich pass. (Supporter-uploaded URL banners are not yet backed
 * by a column, so no `URL` variant is produced here.)
 */
function bannerJson() {
	return jsonBuildObject({
		type: sql<
			"COLOR" | "STAGE"
		>`iif("User"."bannerPresetImg" GLOB '[0-9]*', 'STAGE', 'COLOR')`,
		hexCode: sql<string | null>`
			case
				when "User"."bannerPresetImg" is null then (${sql.raw(BANNER_PRESET_COLOR_CASE)})
				when "User"."bannerPresetImg" GLOB '[0-9]*' then null
				else "User"."bannerPresetImg"
			end`,
		stageId: sql<
			number | null
		>`iif("User"."bannerPresetImg" GLOB '[0-9]*', "User"."bannerPresetImg", null)`,
	});
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
			"text" | "sentiment"
		> | null>`null`;
	}

	return jsonObjectFrom(
		eb
			.selectFrom("PrivateUserNote")
			.select(["PrivateUserNote.text", "PrivateUserNote.sentiment"])
			.where("PrivateUserNote.authorId", "=", viewerId)
			.whereRef("PrivateUserNote.targetId", "=", "User.id"),
	);
}

function plusTierScalar(eb: ExpressionBuilder<Tables, "User">) {
	return eb
		.selectFrom("PlusTier")
		.select("PlusTier.tier")
		.whereRef("PlusTier.userId", "=", "User.id")
		.$asScalar();
}

/** Single highest X Rank power placement (verified XP). `WEST` region = Tentatek, otherwise Takoroka. */
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
				sql<
					"TENTATEK" | "TAKOROKA"
				>`iif("XRankPlacement"."region" = 'WEST', 'TENTATEK', 'TAKOROKA')`.as(
					"div",
				),
			])
			.orderBy("XRankPlacement.power", "desc")
			.limit(1),
	);
}

/**
 * Self-reported peak XP from the `User.unverifiedPeakXP` column. Has exactly one of `tentatek` /
 * `takoroka` defined, which decides the division; `points` is that division's value.
 */
function xpUnverifiedJson() {
	return sql<{ points: number; div: "TENTATEK" | "TAKOROKA" } | null>`
		iif(
			"User"."unverifiedPeakXP" is null,
			null,
			json_object(
				'points', "User"."unverifiedPeakXP" ->> '$.overall',
				'div', iif("User"."unverifiedPeakXP" ->> '$.tentatek' is not null, 'TENTATEK', 'TAKOROKA')
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
		? new Map(
				(await cachedFullUserLeaderboard(season)).map((entry) => [
					entry.id,
					entry.placementRank,
				]),
			)
		: new Map<number, number>();

	return { skills, placementsByUserId };
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
): UserCardData {
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
		// TODO: derive from LFG free agent posts
		isFreeAgent: false,
		privateNote: cardData.privateNote ?? { text: null, sentiment: "NEUTRAL" },
		stats: userCardStats({
			div: cardData.div,
			plusTier: cardData.plusTier,
			xpVerified: cardData.xpVerified,
			xpUnverified: cardData.xpUnverified,
			seasonSkill,
			seasonTop,
		}),
	};
}

function enrichBanner(
	banner: RawUserCardData["banner"],
): UserCardData["banner"] {
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
	xpVerified: { points: number; div: XPDivision } | null;
	xpUnverified: { points: number; div: XPDivision } | null;
	seasonSkill: TieredSkill | undefined;
	seasonTop: number | null;
}): Array<UserCardStat> {
	const stats: Array<UserCardStat> = [];

	const xpValues: Array<UserCardStatXPValue> = [];
	if (xpUnverified) {
		xpValues.push({
			isVerified: false,
			div: xpUnverified.div,
			points: xpUnverified.points,
		});
	}
	if (xpVerified) {
		xpValues.push({
			isVerified: true,
			div: xpVerified.div,
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
