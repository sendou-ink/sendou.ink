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

/**
 * Base query selecting the user matching a URL identifier, which can be their user id, their Discord
 * id or their custom URL. Extend it with the columns the caller needs.
 */
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
 * Select list for the fields shared by every user representation across the app. Includes
 * `customAvatarUrl`, the full URL of the user's supporter custom avatar (resolved from
 * `User.customAvatarImgId`), or `null` when they have none. By default reads from `"User"` which
 * must be in scope at the call site; pass `alias` when the table is joined under another name
 * (`alias: "LinkedUser"`), `prefix` to prefix every output column (`prefix: "sender"` →
 * `senderId`, `senderUsername`, ...), `idAs` to rename only the id column (`idAs: "userId"`) and
 * `inTournament` to resolve `username` via {@link tournamentUsername}.
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
 * SQL expression resolving to the full URL of a user's supporter custom avatar (from
 * `User.customAvatarImgId`), or `null` when they have none. Alias it
 * (`.as("customAvatarUrl")`) when selecting it directly. Pass `alias` when the `User` table is
 * joined under another name. Prefer {@link commonUserSelect} / {@link commonUserJsonObject};
 * reach for this only when those don't fit (e.g. a hand-built `jsonBuildObject`).
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

/**
 * Constructs a SQL expression that returns the full URL for a tournament's logo.
 * If the tournament has a custom logo (via avatarImgId), returns that logo's URL.
 * Otherwise, returns null.
 *
 * @returns A SQL expression that concatenates the image root URL with either the custom logo URL or default logo
 */
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

/**
 * Constructs a SQL expression that returns the full URL for a tournament's logo.
 * If the tournament has a custom logo (via avatarImgId), returns that logo's URL.
 * Otherwise, falls back to the default tournament logo.
 *
 * @returns A SQL expression that concatenates the image root URL with either the custom logo URL or default logo
 */
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
 * Subquery resolving to the event's earliest `CalendarEventDate` start time, or `null` when it has
 * no dates. Correlates on `"CalendarEvent"."id"`. Alias it `.as("startTime")` when selecting it
 * directly. Can also be passed to `orderBy` as is.
 */
export function calendarEventStartTime(
	eb: ExpressionBuilder<Tables, "CalendarEvent">,
) {
	return eb
		.selectFrom("CalendarEventDate")
		.select((eb2) => eb2.fn.min<number>("startsAt").as("startsAt"))
		.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id");
}

/**
 * Subquery counting a tournament's non-placeholder teams. Correlates on `"Tournament"."id"`.
 * Alias it `.as("teamsCount")` when selecting it directly.
 */
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
 * Subquery resolving to the non-placeholder teams of a tournament that are still relevant to it:
 * every registered team as long as no bracket has been started, only the checked in ones after
 * that. Mirrors how the tournament page itself resolves its teams, so keep the two in sync.
 * Correlates on `"Tournament"."id"`. Has no select of its own, so extend it with the aggregate the
 * caller needs. A team can have several check in rows, so aggregate with `.distinct()`, e.g.
 * `.select(({ fn }) => fn.count("TournamentTeam.id").distinct().as("count"))`.
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

/**
 * Subquery counting the teams of {@link tournamentCheckedInTeams}. Correlates on
 * `"Tournament"."id"`. Alias it `.as("teamsCount")` when selecting it directly.
 */
export function tournamentTeamsCount(eb: ExpressionBuilder<DB, "Tournament">) {
	return tournamentCheckedInTeams(eb).select(({ fn }) => [
		fn.count<number>("TournamentTeam.id").distinct().as("count"),
	]);
}

/**
 * Expression resolving to a tournament's participant count: rostered players of the teams from
 * {@link tournamentCheckedInTeams} while the tournament is still ongoing, players who actually got
 * a result once it has been finalized. Correlates on `"Tournament"."id"`. Alias it
 * `.as("membersCount")` when selecting it directly.
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
 * Skill row of a season: `latestId` plus that row's `ordinal`, `matchesCount` and the `by`
 * column. Wrap it with `.selectFrom(latestSkillPerSeason(...).as("Latest"))`; extra `.where`s
 * compose before aliasing.
 */
export function latestSkillPerSeason<By extends "userId" | "identifier">({
	season,
	by,
}: {
	season: number;
	by: By;
}) {
	// The latest row per user/team is picked via SQLite's bare column rule: with a `max()`
	// aggregate the other selected columns come from the row that produced the max.
	// A self-join against a `max(id)` subquery is avoided because it lets the planner
	// pick a nested-loop plan when it misjudges the season's row count (e.g. a freshly
	// started season whose stats are dwarfed by older seasons), which made this query
	// take ~12s. This form is plan-stable regardless of stats: a single grouped scan of
	// the `skill_season_user_id_leaderboard` / `skill_season_identifier_leaderboard`
	// covering index, no temp b-tree per partition.
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
 * Predicate for `Skill` rows of the user that represent a played set: either a SendouQ match or
 * a ranked tournament the user has a result in. Filters out e.g. skills of tournament teams the
 * user dropped from before results. `"Skill"` must be in scope at the call site.
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

/** Concats the file name (a bit misleadingly called `url` in the DB schema) with the root URL, giving the full URL for the image */
export function concatUserSubmittedImagePrefix<T extends string | null>(
	expr: Expression<T>,
) {
	// null-propagating || instead of iif(expr is not null, concat(...), null)
	// so a correlated subquery passed as expr is evaluated only once per row
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
 * The name a user is shown under inside tournaments: the name organizers have given them
 * (`User.tournamentName`) falling back to their `username`. Alias it (`.as("username")`) when
 * selecting it directly. Prefer `commonUserSelect(eb, { inTournament: true })`; reach for this
 * only when the query doesn't select the common user fields.
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
 * Drop-in replacement for kysely's sqlite `jsonArrayFrom`. Emits the same query, except
 * JSON-valued selections (per {@link jsonValuedSelection}: JSON columns, nested json helpers) get
 * `json(...)` applied at the `json_object` argument position. SQLite's JSON subtype never
 * survives a subquery boundary, so without the re-tag such values would be embedded as
 * strings; the dialect parses each result column exactly once and relies on documents
 * arriving fully nested. Always use this over the kysely one.
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
 * Re-tags a JSON-valued expression with SQLite's `json()` so it stays a nested document
 * (instead of an escaped string) inside {@link jsonBuildObject}/{@link jsonArrayFrom}.
 * Only needed for expressions the helpers can not recognize as JSON on their own, e.g. a
 * raw `IIF(...)` over a JSON column.
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
