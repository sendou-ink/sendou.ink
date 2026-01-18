import {
	type ColumnType,
	type Expression,
	type ExpressionBuilder,
	expressionBuilder,
	sql,
} from "kysely";
import { jsonBuildObject } from "kysely/helpers/sqlite";
import type { DB, Tables } from "~/db/tables";
import { IS_E2E_TEST_RUN } from "./e2e";

export const COMMON_USER_FIELDS = [
	"User.id",
	"User.username",
	"User.discordId",
	"User.discordAvatar",
	"User.customUrl",
] as const;

export type CommonUser = Pick<
	Tables["User"],
	"id" | "username" | "discordId" | "discordAvatar" | "customUrl"
>;

const userChatNameColorRaw = sql<
	string | null
>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme" ->> 'chat', null)`;

export const userChatNameColor = userChatNameColorRaw.as("chatNameColor");

export const userChatNameColorForJson = userChatNameColorRaw;

export function commonUserJsonObject(eb: ExpressionBuilder<Tables, "User">) {
	return jsonBuildObject({
		id: eb.ref("User.id"),
		username: eb.ref("User.username"),
		discordId: eb.ref("User.discordId"),
		discordAvatar: eb.ref("User.discordAvatar"),
		customUrl: eb.ref("User.customUrl"),
	});
}

const USER_SUBMITTED_IMAGE_ROOT =
	(process.env.NODE_ENV === "development" &&
		import.meta.env.VITE_PROD_MODE !== "true") ||
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
			sql.lit(`${import.meta.env.VITE_TOURNAMENT_DEFAULT_LOGO}
  `),
		),
	);
}

/** Concats the file name (a bit misleadingly called `url` in the DB schema) with the root URL, giving the full URL for the image */
export function concatUserSubmittedImagePrefix<T extends string | null>(
	expr: Expression<T>,
) {
	const eb = expressionBuilder<DB>();

	return eb.fn<T extends null ? string | null : string>("iif", [
		eb(expr, "is not", null),
		eb.fn<string>("concat", [sql.lit(`${USER_SUBMITTED_IMAGE_ROOT}/`), expr]),
		sql`null`,
	]);
}

export type JSONColumnTypeNullable<SelectType extends object | null> =
	ColumnType<SelectType | null, string | null, string | null>;
