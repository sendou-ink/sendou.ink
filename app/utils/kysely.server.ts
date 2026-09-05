import {
	type AliasedRawBuilder,
	type ColumnType,
	type Expression,
	type ExpressionBuilder,
	type RawBuilder,
	sql,
} from "kysely";
import type {
	jsonArrayFrom as sqliteJsonArrayFrom,
	jsonBuildObject as sqliteJsonBuildObject,
	jsonObjectFrom as sqliteJsonObjectFrom,
} from "kysely/helpers/sqlite";
import { Config } from "~/config";
import {
	jsonValuedNode,
	jsonValuedSelection,
	selectionOutputName,
} from "~/db/json-selections";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { IS_E2E_TEST_RUN } from "./e2e";
import { safeNumberParse } from "./number";

/** Base query selecting the user by URL identifier (user id, Discord id or custom URL). */
export function userByIdentifierQuery(identifier: string) {
	return db
		.selectFrom("User")
		.select("User.id")
		.where((eb) => {
			// we don't want to parse discord id's as numbers (length = 18)
			const parsedId =
				identifier.length < 10 ? safeNumberParse(identifier) : null;
			if (parsedId) {
				return eb("User.id", "=", parsedId);
			}

			if (/^\d+$/.test(identifier)) {
				return eb("User.discordId", "=", identifier);
			}

			return eb("User.customUrl", "=", identifier);
		});
}

/**
 * SQLite expression extracting a Splatoon player's overall peak XP from the denormalized `peakXp`
 * JSON column. `"SplatoonPlayer"` must be in scope at the call site.
 */
export function peakXpOverallSql<T extends number | null = number | null>() {
	return sql<T>`"SplatoonPlayer"."peakXp" ->> '$.overall'`;
}

type CommonUserSelectOptions = {
	alias?: string;
	prefix?: string;
	idAs?: string;
	/** For tournament scoped queries: `username` resolves to {@link tournamentUsername}. */
	inTournament?: boolean;
};

type UserTableAlias<O> = O extends { alias: infer A extends string }
	? A
	: "User";

type PrefixedUserColumn<O, C extends string> = O extends {
	prefix: infer P extends string;
}
	? `${P}${Capitalize<C>}`
	: C;

type UserIdColumn<O> = O extends { idAs: infer I extends string }
	? I
	: PrefixedUserColumn<O, "id">;

type CommonUserSelectResult<O> = readonly [
	`${UserTableAlias<O>}.id as ${UserIdColumn<O>}`,
	`${UserTableAlias<O>}.username as ${PrefixedUserColumn<O, "username">}`,
	`${UserTableAlias<O>}.discordId as ${PrefixedUserColumn<O, "discordId">}`,
	`${UserTableAlias<O>}.discordAvatar as ${PrefixedUserColumn<O, "discordAvatar">}`,
	`${UserTableAlias<O>}.customUrl as ${PrefixedUserColumn<O, "customUrl">}`,
	AliasedRawBuilder<string | null, PrefixedUserColumn<O, "customAvatarUrl">>,
];

/**
 * Select list for the fields shared by every user representation, incl. `customAvatarUrl` (full
 * supporter avatar URL or `null`). Reads from `"User"` unless `alias` is given; `prefix` prefixes
 * every output column (`sender` → `senderId`, ...), `idAs` renames only the id column and
 * `inTournament` resolves `username` via {@link tournamentUsername}.
 */
export function commonUserSelect<const O extends CommonUserSelectOptions>(
	eb: ExpressionBuilder<DB, any>,
	options?: O,
): CommonUserSelectResult<O> {
	const alias = options?.alias ?? "User";
	const prefix = options?.prefix;

	const outputName = (column: string) =>
		prefix ? `${prefix}${column[0].toUpperCase()}${column.slice(1)}` : column;
	const idName = options?.idAs ?? outputName("id");

	return [
		`${alias}.id as ${idName}`,
		options?.inTournament
			? tournamentUsername(alias).as(outputName("username"))
			: `${alias}.username as ${outputName("username")}`,
		`${alias}.discordId as ${outputName("discordId")}`,
		`${alias}.discordAvatar as ${outputName("discordAvatar")}`,
		`${alias}.customUrl as ${outputName("customUrl")}`,
		customAvatarUrl(eb, alias).as(outputName("customAvatarUrl")),
	] as unknown as CommonUserSelectResult<O>;
}

/**
 * Full URL of a user's supporter custom avatar, or `null`. Alias it when selecting directly.
 * Prefer {@link commonUserSelect} / {@link commonUserJsonObject} when they fit.
 */
export function customAvatarUrl(
	eb: ExpressionBuilder<DB, any>,
	alias = "User",
) {
	return concatUserSubmittedImagePrefix(
		eb
			.selectFrom("UserSubmittedImage")
			.select("UserSubmittedImage.url")
			.whereRef(
				"UserSubmittedImage.id",
				"=",
				sql.ref(`${alias}.customAvatarImgId`),
			)
			.$asScalar(),
	).$castTo<string | null>();
}

export type CommonUser = Pick<
	Tables["User"],
	"id" | "username" | "discordId" | "discordAvatar" | "customUrl"
> & { customAvatarUrl: string | null };

/** Represents User joined with PlusTier table */
export type UserWithPlusTier = Tables["User"] & {
	plusTier: Tables["PlusTier"]["tier"] | null;
};

const userChatNameHueRaw = sql<
	string | null
>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme" ->> '--_chat-h', null)`;

export const userChatNameHue = userChatNameHueRaw.as("chatNameHue");

/**
 * The {@link CommonUser} fields as a plain record of Kysely expressions, for spreading into a
 * hand-built `jsonBuildObject` alongside extra fields. Prefer {@link commonUserJsonObject} when the
 * common fields are the whole object.
 */
export function commonUserObjectFields(eb: ExpressionBuilder<Tables, "User">) {
	return {
		id: eb.ref("User.id"),
		username: eb.ref("User.username"),
		discordId: eb.ref("User.discordId"),
		discordAvatar: eb.ref("User.discordAvatar"),
		customUrl: eb.ref("User.customUrl"),
		customAvatarUrl: customAvatarUrl(eb),
	};
}

export function commonUserJsonObject(eb: ExpressionBuilder<Tables, "User">) {
	return jsonBuildObject(commonUserObjectFields(eb));
}

type ExtractedExpressionTypes<E extends Record<string, Expression<unknown>>> = {
	[K in keyof E]: E[K] extends Expression<infer T> ? T : never;
};

/**
 * `json_group_array` aggregate building one object per member row from the {@link CommonUser}
 * fields plus `extras`. `"User"` must be in scope at the call site. Alias it (`.as("members")`)
 * when selecting.
 */
export function commonUserMembersAgg<
	E extends Record<string, Expression<unknown>>,
>(eb: ExpressionBuilder<DB, any>, extras: E) {
	return eb.fn
		.agg("json_group_array", [
			jsonBuildObject({
				...commonUserObjectFields(
					eb as unknown as ExpressionBuilder<Tables, "User">,
				),
				...extras,
			}),
		])
		.$castTo<Array<CommonUser & ExtractedExpressionTypes<E>>>();
}

const USER_SUBMITTED_IMAGE_ROOT =
	(process.env.NODE_ENV === "development" && !Config.prodMode) ||
	IS_E2E_TEST_RUN ||
	process.env.NODE_ENV === "test"
		? "http://127.0.0.1:9000/sendou"
		: "https://sendou.nyc3.cdn.digitaloceanspaces.com";

/** Full URL of the tournament's custom logo (via `avatarImgId`), or null when it has none. */
export function tournamentLogoOrNull(
	eb: ExpressionBuilder<Tables, "CalendarEvent">,
) {
	return eb.fn<string | null>("iif", [
		eb("CalendarEvent.avatarImgId", "is not", null),
		eb.fn<string>("concat", [
			sql.lit(`${USER_SUBMITTED_IMAGE_ROOT}/`),
			eb
				.selectFrom("UnvalidatedUserSubmittedImage")
				.select(["UnvalidatedUserSubmittedImage.url"])
				.whereRef(
					"CalendarEvent.avatarImgId",
					"=",
					"UnvalidatedUserSubmittedImage.id",
				),
		]),
		sql`null`,
	]);
}

/** Full URL of the tournament's custom logo (via `avatarImgId`), falling back to the default logo. */
export function tournamentLogoWithDefault(
	eb: ExpressionBuilder<Tables, "CalendarEvent">,
) {
	return concatUserSubmittedImagePrefix(
		eb.fn.coalesce(
			eb
				.selectFrom("UnvalidatedUserSubmittedImage")
				.select("UnvalidatedUserSubmittedImage.url")
				.whereRef(
					"CalendarEvent.avatarImgId",
					"=",
					"UnvalidatedUserSubmittedImage.id",
				)
				.$asScalar(),
			sql.lit(Config.tournamentDefaultLogo),
		),
	);
}

/**
 * Subquery for the event's earliest `CalendarEventDate` start time (`null` without dates).
 * Correlates on `"CalendarEvent"."id"`; alias when selecting, usable in `orderBy` as is.
 */
export function calendarEventStartTime(
	eb: ExpressionBuilder<Tables, "CalendarEvent">,
) {
	return eb
		.selectFrom("CalendarEventDate")
		.select((eb2) => eb2.fn.min<number>("startsAt").as("startsAt"))
		.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id");
}

/** Subquery counting a tournament's non-placeholder teams. Correlates on `"Tournament"."id"`. */
export function tournamentTeamCount(
	eb: ExpressionBuilder<Tables, "Tournament">,
) {
	return eb
		.selectFrom("TournamentTeam")
		.select((eb2) => eb2.fn.countAll<number>().as("count"))
		.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
		.where("TournamentTeam.isPlaceholder", "=", 0);
}

/** Expression resolving to whether any of a tournament's brackets has been started. */
function tournamentHasStarted(eb: ExpressionBuilder<DB, "Tournament">) {
	return eb.exists(
		eb
			.selectFrom("TournamentStage")
			.select("TournamentStage.id")
			.whereRef("TournamentStage.tournamentId", "=", "Tournament.id"),
	);
}

/**
 * Non-placeholder teams still relevant to a tournament: all registered teams until a bracket has
 * started, only checked in ones after. Mirrors the tournament page's own team resolution, keep in
 * sync. Correlates on `"Tournament"."id"`. Has no select; a team can have several check in rows,
 * so aggregate with `.distinct()`.
 */
function tournamentCheckedInTeams(eb: ExpressionBuilder<DB, "Tournament">) {
	return eb
		.selectFrom("TournamentTeam")
		.leftJoin(
			"TournamentTeamCheckIn",
			"TournamentTeamCheckIn.tournamentTeamId",
			"TournamentTeam.id",
		)
		.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
		.where("TournamentTeam.isPlaceholder", "=", 0)
		.where((eb2) =>
			eb2.or([
				eb2("TournamentTeamCheckIn.checkedInAt", "is not", null),
				eb2.not(tournamentHasStarted(eb)),
			]),
		);
}

/** Subquery counting the teams of {@link tournamentCheckedInTeams}. Correlates on `"Tournament"."id"`. */
export function tournamentTeamsCount(eb: ExpressionBuilder<DB, "Tournament">) {
	return tournamentCheckedInTeams(eb).select(({ fn }) => [
		fn.count<number>("TournamentTeam.id").distinct().as("count"),
	]);
}

/**
 * Tournament participant count: rostered players of {@link tournamentCheckedInTeams} while ongoing,
 * players with a result once finalized. Correlates on `"Tournament"."id"`.
 */
export function tournamentMembersCount(
	eb: ExpressionBuilder<DB, "Tournament">,
) {
	return eb
		.case()
		.when("Tournament.isFinalized", "=", 1)
		.then(
			eb
				.selectFrom("TournamentResult")
				.whereRef("TournamentResult.tournamentId", "=", "Tournament.id")
				.select(({ fn }) => [
					fn.count<number>("TournamentResult.userId").distinct().as("count"),
				]),
		)
		.else(
			tournamentCheckedInTeams(eb)
				.innerJoin(
					"TournamentTeamMember",
					"TournamentTeamMember.tournamentTeamId",
					"TournamentTeam.id",
				)
				.select(({ fn }) => [
					fn
						.count<number>("TournamentTeamMember.userId")
						.distinct()
						.as("count"),
				]),
		)
		.end();
}

/**
 * Grouped subquery picking each user's (`by: "userId"`) or team's (`by: "identifier"`) latest
 * Skill row of a season: `latestId`, `ordinal`, `matchesCount` and the `by` column.
 * Use as `.selectFrom(latestSkillPerSeason(...).as("Latest"))`; extra `.where`s compose before aliasing.
 */
export function latestSkillPerSeason<By extends "userId" | "identifier">({
	season,
	by,
}: {
	season: number;
	by: By;
}) {
	// Relies on SQLite's bare column rule: with `max()` the other columns come from the max row.
	// A self-join against a `max(id)` subquery took ~12s when the planner misjudged a fresh
	// season's row count; this form is plan-stable: one grouped scan of the
	// `skill_season_{user_id,identifier}_leaderboard` covering index.
	return db
		.selectFrom("Skill")
		.select(({ fn }) => [
			fn.max("Skill.id").as("latestId"),
			"Skill.ordinal" as const,
			"Skill.matchesCount" as const,
			`Skill.${by}` as `Skill.${By}`,
		])
		.where("Skill.season", "=", season)
		.where(`Skill.${by}`, "is not", null)
		.groupBy(`Skill.${by}`);
}

/**
 * Predicate for the user's `Skill` rows representing a played set: a SendouQ match or a ranked
 * tournament they have a result in (excludes teams they dropped from before results).
 */
export function skillCountsAsSeasonSet(
	eb: ExpressionBuilder<DB, "Skill">,
	userId: number,
) {
	return eb.or([
		eb("Skill.groupMatchId", "is not", null),
		eb.exists(
			eb
				.selectFrom("TournamentResult")
				.select("TournamentResult.userId")
				.whereRef("TournamentResult.tournamentId", "=", "Skill.tournamentId")
				.where("TournamentResult.userId", "=", userId),
		),
	]);
}

/** Prefixes the file name (called `url` in the DB schema) with the root URL. */
export function concatUserSubmittedImagePrefix<T extends string | null>(
	expr: Expression<T>,
) {
	// null-propagating || so a correlated subquery expr is evaluated only once per row
	return sql<T extends null ? string | null : string>`(${sql.lit(
		`${USER_SUBMITTED_IMAGE_ROOT}/`,
	)} || ${expr})`;
}

export type JSONColumnTypeNullable<
	SelectType extends object | string | number | null,
> = ColumnType<SelectType | null, string | null, string | null>;

const TEN_STAR_CASE = sql<number>`case when "TenStarWeapon"."weaponSplId" is not null then 1 else 0 end`;

/** Match profile weapons (from UserWeaponPool) with TenStarWeapon join. Correlates on "User"."id". */
export function matchProfileWeapons(eb: ExpressionBuilder<DB, any>) {
	return jsonArrayFrom(
		eb
			.selectFrom("UserWeaponPool")
			.leftJoin("TenStarWeapon", (join) =>
				join
					.onRef("TenStarWeapon.userId", "=", "UserWeaponPool.userId")
					.onRef(
						"TenStarWeapon.weaponSplId",
						"=",
						"UserWeaponPool.weaponSplId",
					),
			)
			.select([
				"UserWeaponPool.weaponSplId",
				"UserWeaponPool.isFavorite",
				TEN_STAR_CASE.as("isTenStar"),
			])
			.whereRef("UserWeaponPool.userId", "=", "User.id")
			.orderBy("UserWeaponPool.sortOrder", "asc"),
	);
}

/** User profile weapons (from UserWeapon) with TenStarWeapon join. Correlates on "User"."id". */
export function userProfileWeapons(eb: ExpressionBuilder<DB, any>) {
	return jsonArrayFrom(
		eb
			.selectFrom("UserWeapon")
			.leftJoin("TenStarWeapon", (join) =>
				join
					.onRef("TenStarWeapon.userId", "=", "UserWeapon.userId")
					.onRef("TenStarWeapon.weaponSplId", "=", "UserWeapon.weaponSplId"),
			)
			.select([
				"UserWeapon.weaponSplId",
				"UserWeapon.isFavorite",
				TEN_STAR_CASE.as("isTenStar"),
			])
			.whereRef("UserWeapon.userId", "=", "User.id")
			.orderBy("UserWeapon.order", "asc"),
	);
}

/**
 * Name shown inside tournaments: `User.tournamentName` falling back to `username`.
 * Prefer `commonUserSelect(eb, { inTournament: true })` when selecting the common user fields.
 */
export function tournamentUsername(alias = "User") {
	return sql<string>`coalesce(${sql.ref(`${alias}.tournamentName`)}, ${sql.ref(
		`${alias}.username`,
	)})`;
}

type SelectQueryBuilderExpression<O> = Parameters<
	typeof sqliteJsonArrayFrom<O>
>[0];

/**
 * Drop-in replacement for kysely's sqlite `jsonArrayFrom` that wraps JSON-valued selections
 * (per {@link jsonValuedSelection}) in `json(...)`. SQLite's JSON subtype doesn't survive a
 * subquery boundary, so without it nested documents would arrive as strings; the dialect parses
 * each result column exactly once. Always use this over the kysely one.
 */
export function jsonArrayFrom<O>(
	expr: SelectQueryBuilderExpression<O>,
): ReturnType<typeof sqliteJsonArrayFrom<O>> {
	return sql`(select coalesce(json_group_array(json_object(${sql.join(
		jsonObjectArgs(expr, "agg"),
	)})), '[]') from ${expr} as agg)` as ReturnType<
		typeof sqliteJsonArrayFrom<O>
	>;
}

/** Drop-in replacement for kysely's sqlite `jsonObjectFrom`, see {@link jsonArrayFrom}. */
export function jsonObjectFrom<O>(
	expr: SelectQueryBuilderExpression<O>,
): ReturnType<typeof sqliteJsonObjectFrom<O>> {
	return sql`(select json_object(${sql.join(
		jsonObjectArgs(expr, "obj"),
	)}) from ${expr} as obj)` as ReturnType<typeof sqliteJsonObjectFrom<O>>;
}

/** Drop-in replacement for kysely's sqlite `jsonBuildObject`, see {@link jsonArrayFrom}. */
export function jsonBuildObject<O extends Record<string, Expression<unknown>>>(
	obj: O,
): ReturnType<typeof sqliteJsonBuildObject<O>> {
	return sql`json_object(${sql.join(
		Object.keys(obj).flatMap((key) => [
			sql.lit(key),
			jsonValuedNode(obj[key].toOperationNode())
				? sql`json(${obj[key]})`
				: obj[key],
		]),
	)})` as ReturnType<typeof sqliteJsonBuildObject<O>>;
}

/**
 * Re-tags an expression with `json()` so it stays nested inside {@link jsonBuildObject}/{@link jsonArrayFrom}.
 * Only needed when the helpers can't recognize it as JSON, e.g. a raw `IIF(...)` over a JSON column.
 */
export function asJson<T>(expr: Expression<T>): RawBuilder<T> {
	return sql<T>`json(${expr})`;
}

function jsonObjectArgs(
	expr: SelectQueryBuilderExpression<unknown>,
	table: string,
) {
	const args: Expression<unknown>[] = [];

	for (const { selection } of expr.toOperationNode().selections ?? []) {
		const name = selectionOutputName(selection);
		if (!name) {
			throw new Error(
				"jsonArrayFrom and jsonObjectFrom can only handle explicit selections. selectAll() is not allowed in the subquery.",
			);
		}

		const ref = sql.ref(`${table}.${name}`);

		args.push(
			sql.lit(name),
			jsonValuedSelection(selection) ? sql`json(${ref})` : ref,
		);
	}

	return args;
}
