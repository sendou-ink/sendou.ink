import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { nullifyingAvg } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { requireBearerAuth } from "../api-public-utils.server";
import type { GetTournamentTeamsResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	requireBearerAuth(request);

	const t = await i18next.getFixedT("en", ["game-misc"]);
	const { id } = parseParams({
		params,
		schema: paramsSchema,
	});

	const teams = await db
		.selectFrom("TournamentTeam")
		.leftJoin("UserSubmittedImage", "avatarImgId", "UserSubmittedImage.id")
		.leftJoin("TournamentTeamCheckIn", (join) =>
			join
				.onRef(
					"TournamentTeam.id",
					"=",
					"TournamentTeamCheckIn.tournamentTeamId",
				)
				.on("TournamentTeamCheckIn.bracketIdx", "is", null),
		)
		.select(({ eb }) => [
			"TournamentTeam.id",
			"TournamentTeam.name",
			"TournamentTeam.seed",
			"TournamentTeam.createdAt",
			"TournamentTeamCheckIn.checkedInAt",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
			jsonObjectFrom(
				eb
					.selectFrom("AllTeam")
					.leftJoin(
						"UserSubmittedImage",
						"AllTeam.avatarImgId",
						"UserSubmittedImage.id",
					)
					.whereRef("AllTeam.id", "=", "TournamentTeam.teamId")
					.select([
						"AllTeam.customUrl",
						concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
							"logoUrl",
						),
						"AllTeam.deletedAt",
					]),
			).as("team"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.innerJoin("User", "User.id", "TournamentTeamMember.userId")
					.leftJoin("SeedingSkill as RankedSeedingSkill", (join) =>
						join
							.onRef("User.id", "=", "RankedSeedingSkill.userId")
							.on("RankedSeedingSkill.type", "=", "RANKED"),
					)
					.leftJoin("SeedingSkill as UnrankedSeedingSkill", (join) =>
						join
							.onRef("User.id", "=", "UnrankedSeedingSkill.userId")
							.on("UnrankedSeedingSkill.type", "=", "UNRANKED"),
					)
					.select([
						"User.id as userId",
						"User.username",
						"User.discordId",
						"User.discordAvatar",
						"User.battlefy",
						"User.country",
						"User.pronouns",
						"TournamentTeamMember.inGameName",
						"TournamentTeamMember.isOwner",
						"TournamentTeamMember.createdAt",
						"RankedSeedingSkill.mu as rankedOrdinal",
						"UnrankedSeedingSkill.mu as unrankedOrdinal",
					])
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					)
					.orderBy("TournamentTeamMember.createdAt", "asc"),
			).as("members"),
			jsonArrayFrom(
				eb
					.selectFrom("MapPoolMap")
					.select(["MapPoolMap.stageId", "MapPoolMap.mode"])
					.whereRef("MapPoolMap.tournamentTeamId", "=", "TournamentTeam.id"),
			).as("mapPool"),
		])
		.where("TournamentTeam.tournamentId", "=", id)
		.orderBy("TournamentTeam.createdAt", "asc")
		.execute();

	const friendCodes = await TournamentRepository.friendCodesByTournamentId(id);

	const result: GetTournamentTeamsResponse = teams.map((team) => {
		return {
			id: team.id,
			name: team.name,
			url: `https://sendou.ink/to/${id}/teams/${team.id}`,
			teamPageUrl:
				team.team?.customUrl && !team.team.deletedAt
					? `https://sendou.ink/t/${team.team.customUrl}`
					: null,
			seed: team.seed,
			registeredAt: databaseTimestampToDate(team.createdAt).toISOString(),
			checkedIn: Boolean(team.checkedInAt),
			seedingPower: {
				ranked: toSeedingPowerSP(
					team.members.map((member) => member.rankedOrdinal),
				),
				unranked: toSeedingPowerSP(
					team.members.map((member) => member.unrankedOrdinal),
				),
			},
			members: team.members.map((member) => {
				return {
					userId: member.userId,
					name: member.username,
					battlefy: member.battlefy,
					discordId: member.discordId,
					avatarUrl: member.discordAvatar
						? `https://cdn.discordapp.com/avatars/${member.discordId}/${member.discordAvatar}.png`
						: null,
					country: member.country,
					captain: Boolean(member.isOwner),
					inGameName: member.inGameName,
					pronouns: member.pronouns,
					friendCode: friendCodes[member.userId],
					joinedAt: databaseTimestampToDate(member.createdAt).toISOString(),
				};
			}),
			logoUrl: team.team?.logoUrl ?? team.avatarUrl,
			mapPool:
				team.mapPool.length > 0
					? team.mapPool.map((map) => {
							return {
								mode: map.mode,
								stage: {
									id: map.stageId,
									name: t(`game-misc:STAGE_${map.stageId}`),
								},
							};
						})
					: null,
		};
	});

	return Response.json(result);
};

function toSeedingPowerSP(ordinals: (number | null)[]) {
	const avg = nullifyingAvg(
		ordinals.filter((ordinal) => typeof ordinal === "number"),
	);

	if (typeof avg !== "number") return null;

	return ordinalToSp(avg);
}
