import {
	type ColumnType,
	type Expression,
	type ExpressionBuilder,
	expressionBuilder,
	sql,
} from "kysely";
import { jsonArrayFrom, jsonBuildObject } from "kysely/helpers/sqlite";
import type { DB, Tables } from "~/db/tables";
import { IS_E2E_TEST_RUN } from "./e2e";

/**
 * Select list for the fields shared by every user representation across the app. Includes
 * `customAvatarUrl`, the full URL of the user's supporter custom avatar (resolved from
 * `User.customAvatarImgId`), or `null` when they have none. `"User"` must be in scope at the call
 * site (it always is, since the other fields reference `User.*`).
 */
export function commonUserSelect(eb: ExpressionBuilder<Tables, "User">) {
	return [
		"User.id",
		"User.username",
		"User.discordId",
		"User.discordAvatar",
		"User.customUrl",
		customAvatarUrl(eb).as("customAvatarUrl"),
	] as const;
}

/**
 * SQL expression resolving to the full URL of a user's supporter custom avatar (from
 * `User.customAvatarImgId`), or `null` when they have none. Alias it
 * (`.as("customAvatarUrl")`) when selecting it directly. Prefer {@link commonUserSelect} /
 * {@link commonUserJsonObject}; reach for this only when those don't fit (e.g. prefixed aliases or
 * a hand-built `jsonBuildObject`).
 */
export function customAvatarUrl(eb: ExpressionBuilder<Tables, "User">) {
	return concatUserSubmittedImagePrefix(
		eb
			.selectFrom("UserSubmittedImage")
			.select("UserSubmittedImage.url")
			.whereRef("UserSubmittedImage.id", "=", "User.customAvatarImgId")
			.$asScalar(),
	).$castTo<string | null>();
}

export type CommonUser = Pick<
	Tables["User"],
	"id" | "username" | "discordId" | "discordAvatar" | "customUrl"
> & { customAvatarUrl: string | null };

const userChatNameHueRaw = sql<
	string | null
>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme" ->> '--_chat-h', null)`;

export const userChatNameHue = userChatNameHueRaw.as("chatNameHue");

export function commonUserJsonObject(eb: ExpressionBuilder<Tables, "User">) {
	return jsonBuildObject({
		id: eb.ref("User.id"),
		username: eb.ref("User.username"),
		discordId: eb.ref("User.discordId"),
		discordAvatar: eb.ref("User.discordAvatar"),
		customUrl: eb.ref("User.customUrl"),
		customAvatarUrl: concatUserSubmittedImagePrefix(
			eb
				.selectFrom("UserSubmittedImage")
				.select("UserSubmittedImage.url")
				.whereRef("UserSubmittedImage.id", "=", "User.customAvatarImgId")
				.$asScalar(),
		).$castTo<string | null>(),
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
			sql.lit(`${import.meta.env.VITE_TOURNAMENT_DEFAULT_LOGO}`),
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
