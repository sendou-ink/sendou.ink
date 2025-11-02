import { type ColumnType, type ExpressionBuilder, sql } from "kysely";
import { jsonBuildObject } from "kysely/helpers/sqlite";
import type { Tables } from "~/db/tables";
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

export const userChatNameColor = sql<
	string | null
>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."css" ->> 'chat', null)`.as(
	"chatNameColor",
);

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
	IS_E2E_TEST_RUN
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
	/** Expression builder scoped to the CalendarEvent table */
	eb: ExpressionBuilder<Tables, "CalendarEvent">,
) {
	return sql.raw<string | null>(`IIF(
		"CalendarEvent"."avatarImgId",
		${eb.fn<string>("concat", [
			sql.lit(`${USER_SUBMITTED_IMAGE_ROOT}/`),
			eb
				.selectFrom("UnvalidatedUserSubmittedImage")
				.select(["UnvalidatedUserSubmittedImage.url"])
				.whereRef(
					"CalendarEvent.avatarImgId",
					"=",
					"UnvalidatedUserSubmittedImage.id",
				),
		])},
		NULL
	)`);
}

/**
 * Constructs a SQL expression that returns the full URL for a tournament's logo.
 * If the tournament has a custom logo (via avatarImgId), returns that logo's URL.
 * Otherwise, falls back to the default tournament logo.
 *
 * @returns A SQL expression that concatenates the image root URL with either the custom logo URL or default logo
 */
export function tournamentLogoWithDefault(
	/** Expression builder scoped to the CalendarEvent table */
	eb: ExpressionBuilder<Tables, "CalendarEvent">,
) {
	// xxx: check other places where we could use coalesce
	return eb.fn<string>("concat", [
		sql.lit(`${USER_SUBMITTED_IMAGE_ROOT}/`),
		eb.fn.coalesce(
			eb
				.selectFrom("UnvalidatedUserSubmittedImage")
				.select(["UnvalidatedUserSubmittedImage.url"])
				.whereRef(
					"CalendarEvent.avatarImgId",
					"=",
					"UnvalidatedUserSubmittedImage.id",
				),
			sql.lit(`${import.meta.env.VITE_TOURNAMENT_DEFAULT_LOGO}`),
		),
	]);
}

// xxx: how to do this?
// export function userSubmittedImagePrefix()

/** Prevents ParseJSONResultsPlugin from trying to parse this as JSON */
export function unJsonify<T>(value: T) {
	if (typeof value !== "string") {
		return value;
	}

	if (value.match(/^[[{]/) === null) {
		return value;
	}

	return `\\${value}`;
}

export type JSONColumnTypeNullable<SelectType extends object | null> =
	ColumnType<SelectType | null, string | null, string | null>;
