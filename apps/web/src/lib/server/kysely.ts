import {
	type AliasedRawBuilder,
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
import { Config } from "#lib/config.ts";
import {
	jsonValuedNode,
	jsonValuedSelection,
	selectionOutputName,
} from "#lib/server/db/json-selections.ts";
import { db } from "#lib/server/db/sql.ts";
import type { DB, Tables } from "#lib/server/db/tables.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

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
 * joined under another name. Prefer {@link commonUserSelect}; reach for this only when it
 * doesn't fit (e.g. a hand-built `jsonBuildObject`).
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

/** Resolves the name a user is shown under in tournaments: `tournamentName` when set, otherwise `username`. */
export function tournamentUsername(alias = "User") {
	return sql<string>`coalesce(${sql.ref(`${alias}.tournamentName`)}, ${sql.ref(
		`${alias}.username`,
	)})`;
}

const USER_SUBMITTED_IMAGE_ROOT =
	(typeof process !== "undefined" &&
		process.env.NODE_ENV === "development" &&
		!Config.prodMode) ||
	IS_E2E_TEST_RUN ||
	(typeof process !== "undefined" && process.env.NODE_ENV === "test")
		? "http://127.0.0.1:9000/sendou"
		: "https://sendou.nyc3.cdn.digitaloceanspaces.com";

/**
 * Groups a season's `Skill` rows to the latest one per user or per team
 * identifier via SQLite's bare column rule: with a `max()` aggregate the other
 * selected columns come from the row that produced the max. This form is
 * plan-stable regardless of stats: a single grouped scan of the covering index,
 * no temp b-tree per partition.
 */
export function latestSkillPerSeason<By extends "userId" | "identifier">({
	season,
	by,
}: {
	season: number;
	by: By;
}) {
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
