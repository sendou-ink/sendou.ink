import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { db } from "~/db/sql";
import i18next from "~/modules/i18n/i18next.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { parseParams } from "~/utils/remix.server";
import { userSubmittedImage } from "~/utils/urls";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetTournamentTeamsResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
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
			"UserSubmittedImage.url as avatarUrl",
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
						"UserSubmittedImage.url as logoUrl",
						"AllTeam.deletedAt",
					]),
			).as("team"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.innerJoin("User", "User.id", "TournamentTeamMember.userId")
					.select([
						"User.id as userId",
						"User.username",
						"User.discordId",
						"User.discordAvatar",
						"User.battlefy",
						"TournamentTeamMember.inGameName",
						"TournamentTeamMember.isOwner",
						"TournamentTeamMember.createdAt",
					])
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					)
					.orderBy("TournamentTeamMember.createdAt asc"),
			).as("members"),
			jsonArrayFrom(
				eb
					.selectFrom("MapPoolMap")
					.select(["MapPoolMap.stageId", "MapPoolMap.mode"])
					.whereRef("MapPoolMap.tournamentTeamId", "=", "TournamentTeam.id"),
			).as("mapPool"),
		])
		.where("TournamentTeam.tournamentId", "=", id)
		.orderBy("TournamentTeam.createdAt asc")
		.execute();

	const logoUrl = (team: (typeof teams)[number]) => {
		const url = team.team?.logoUrl ?? team.avatarUrl;
		if (!url) return null;

		return userSubmittedImage(url);
	};

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
			members: team.members.map((member) => {
				return {
					userId: member.userId,
					name: member.username,
					battlefy: member.battlefy,
					discordId: member.discordId,
					avatarUrl: member.discordAvatar
						? `https://cdn.discordapp.com/avatars/${member.discordId}/${member.discordAvatar}.png`
						: null,
					captain: Boolean(member.isOwner),
					inGameName: member.inGameName,
					joinedAt: databaseTimestampToDate(member.createdAt).toISOString(),
				};
			}),
			logoUrl: logoUrl(team),
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

	return await cors(request, json(result));
};
