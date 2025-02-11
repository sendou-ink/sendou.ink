import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { db } from "~/db/sql";
import { i18next } from "~/modules/i18n/i18next.server";
import { safeNumberParse } from "~/utils/number";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetUserResponse } from "../schema";

const paramsSchema = z.object({
	identifier: z.string(),
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const t = await i18next.getFixedT("en", ["weapons"]);
	const { identifier } = parseParams({ params, schema: paramsSchema });

	const user = notFoundIfFalsy(
		await db
			.selectFrom("User")
			.leftJoin("PlusTier", "PlusTier.userId", "User.id")
			.select(({ eb }) => [
				"User.id",
				"User.country",
				"User.discordName",
				"User.twitch",
				"User.battlefy",
				"User.bsky",
				"User.customUrl",
				"User.discordId",
				"User.discordAvatar",
				"PlusTier.tier",
				jsonArrayFrom(
					eb
						.selectFrom("UserWeapon")
						.select(["UserWeapon.isFavorite", "UserWeapon.weaponSplId"])
						.whereRef("UserWeapon.userId", "=", "User.id")
						.orderBy("UserWeapon.order asc"),
				).as("weapons"),
				jsonArrayFrom(
					eb
						.selectFrom("BadgeOwner")
						.innerJoin("Badge", "Badge.id", "BadgeOwner.badgeId")
						.select(({ fn }) => [
							"Badge.displayName",
							"Badge.code",
							fn.count<number>("BadgeOwner.badgeId").as("count"),
						])
						.groupBy(["BadgeOwner.badgeId", "BadgeOwner.userId"])
						.whereRef("BadgeOwner.userId", "=", "User.id"),
				).as("badges"),
				jsonArrayFrom(
					eb
						.selectFrom("SplatoonPlayer")
						.innerJoin(
							"XRankPlacement",
							"XRankPlacement.playerId",
							"SplatoonPlayer.id",
						)
						.select(["XRankPlacement.power"])
						.whereRef("SplatoonPlayer.userId", "=", "User.id"),
				).as("xRankPlacements"),
			])
			.where((eb) => {
				// we don't want to parse discord id's as numbers (length = 18)
				const parsedId =
					identifier.length < 10 ? safeNumberParse(identifier) : null;
				if (parsedId) {
					return eb("User.id", "=", parsedId);
				}

				return eb("User.discordId", "=", identifier);
			})
			.executeTakeFirst(),
	);

	const result: GetUserResponse = {
		id: user.id,
		name: user.discordName,
		discordId: user.discordId,
		avatarUrl: user.discordAvatar
			? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png`
			: null,
		url: `https://sendou.ink/u/${user.customUrl ?? user.discordId}`,
		country: user.country,
		plusServerTier: user.tier as GetUserResponse["plusServerTier"],
		socials: {
			twitch: user.twitch,
			battlefy: user.battlefy,
			bsky: user.bsky,
			twitter: null, // deprecated field
		},
		peakXp:
			user.xRankPlacements.length > 0
				? user.xRankPlacements.reduce((acc, cur) => {
						if (!cur.power) return acc;
						return Math.max(acc, cur.power);
					}, 0)
				: null,
		weaponPool: user.weapons.map((weapon) => ({
			id: weapon.weaponSplId,
			name: t(`weapons:MAIN_${weapon.weaponSplId}`),
			isFiveStar: Boolean(weapon.isFavorite),
		})),
		badges: user.badges.map((badge) => ({
			name: badge.displayName,
			count: badge.count,
			gifUrl: `https://sendou.ink/static-assets/badges/${badge.code}.gif`,
			imageUrl: `https://sendou.ink/static-assets/badges/${badge.code}.png`,
		})),
	};

	return await cors(request, json(result));
};
