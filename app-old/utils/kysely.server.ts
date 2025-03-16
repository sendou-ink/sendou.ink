import { sql } from "kysely";
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

/** Prevents ParseJSONResultsPlugin from trying to parse this as JSON */
export function unJsonify<T>(value: T) {
	if (typeof value !== "string") {
		return value;
	}

	if (value.match(/^[\[\{]/) === null) {
		return value;
	}

	return `\\${value}`;
}
