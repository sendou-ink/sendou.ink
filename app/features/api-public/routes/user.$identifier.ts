import { jsonArrayFrom } from "kysely/helpers/sqlite";
import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import { peakXpOverallSql } from "~/features/top-search/XRankPlacementRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { safeNumberParse } from "~/utils/number";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { badgeUrl } from "~/utils/urls";
import type { GetUserResponse } from "../schema";

const paramsSchema = z.object({
	identifier: z.string(),
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT("en", ["weapons"]);
	const { identifier } = parseParams({ params, schema: paramsSchema });

	const user = notFoundIfFalsy(
		await db
			.selectFrom("User")
			.leftJoin("PlusTier", "PlusTier.userId", "User.id")
			.leftJoin("SplatoonPlayer", "SplatoonPlayer.userId", "User.id")
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
				"User.inGameName",
				"User.pronouns",
				"PlusTier.tier",
				jsonArrayFrom(
					eb
						.selectFrom("UserWeapon")
						.select(["UserWeapon.isFavorite", "UserWeapon.weaponSplId"])
						.whereRef("UserWeapon.userId", "=", "User.id")
						.orderBy("UserWeapon.order", "asc"),
				).as("weapons"),
				peakXpOverallSql().as("peakXp"),
				jsonArrayFrom(
					eb
						.selectFrom("TeamMemberWithSecondary")
						.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
						.select(["Team.id", "TeamMemberWithSecondary.role"])
						.whereRef("TeamMemberWithSecondary.userId", "=", "User.id")
						.orderBy("TeamMemberWithSecondary.isMainTeam", "desc")
						.orderBy("TeamMemberWithSecondary.createdAt", "asc"),
				).as("teams"),
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

	const badges = await UserRepository.ownedBadgesByUserId(user.id);

	const season = Seasons.currentOrPrevious(new Date())!.nth;

	const { isAccurateTiers, userSkills } = _userSkills(season);
	const skill = isAccurateTiers ? userSkills[user.id] : null;

	const result: GetUserResponse = {
		id: user.id,
		name: user.discordName,
		discordId: user.discordId,
		avatarUrl: user.discordAvatar
			? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png`
			: null,
		url: `https://sendou.ink/u/${user.customUrl ?? user.discordId}`,
		country: user.country,
		inGameName: user.inGameName,
		pronouns: user.pronouns,
		plusServerTier: user.tier as GetUserResponse["plusServerTier"],
		socials: {
			twitch: user.twitch,
			battlefy: user.battlefy,
			bsky: user.bsky,
			twitter: null, // deprecated field
		},
		currentRank: skill?.tier
			? {
					season,
					tier: skill.tier,
				}
			: null,
		peakXp: user.peakXp,
		weaponPool: user.weapons.map((weapon) => ({
			id: weapon.weaponSplId,
			name: t(`weapons:MAIN_${weapon.weaponSplId}`),
			isFiveStar: Boolean(weapon.isFavorite),
		})),
		badges: badges.map((badge) => ({
			name: badge.displayName,
			count: badge.count,
			gifUrl: badgeUrl({ code: badge.code, extension: "gif" }),
			imageUrl: badgeUrl({ code: badge.code }),
		})),
		teams: user.teams.map((team) => ({
			id: team.id,
			role: team.role,
		})),
	};

	return Response.json(result);
};
