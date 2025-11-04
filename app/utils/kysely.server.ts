import { type ColumnType, type ExpressionBuilder, sql } from "kysely";
import { jsonBuildObject } from "kysely/helpers/sqlite";
import type { Tables } from "~/db/tables";

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
