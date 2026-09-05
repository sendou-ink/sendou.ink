import { sql } from "kysely";
import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { db } from "~/db/sql";
import type { TournamentSettings } from "~/db/tables-json";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	seedsByStartingBracket,
	sortTeamsBySeeding,
} from "~/features/tournament/tournament-utils";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { getFixedTForLanguage } from "~/modules/i18n/i18next.server";
import { nullifyingAvg } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	tournamentUsername,
} from "~/utils/kysely.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetTournamentTeamsResponse } from "../schema";

const paramsSchema = v.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const t = await getFixedTForLanguage("en", ["game-misc"]);
	const { id } = parseParams({
		params,
		schema: paramsSchema,
	});

	const tournament = await db
		.selectFrom("Tournament")
		.select(({ exists, selectFrom }) => [
			"Tournament.settings",
			exists(
				selectFrom("TournamentStage")
					.select("TournamentStage.id")
					.where("TournamentStage.tournamentId", "=", id),
			).as("hasStarted"),
		])
		.where("Tournament.id", "=", id)
		.executeTakeFirst();

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
			"TournamentTeam.startingBracketIdx",
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
						tournamentUsername().as("username"),
						"User.discordId",
						"User.discordAvatar",
						"User.country",
						"User.pronouns",
						"TournamentTeamMember.inGameName",
						"TournamentTeamMember.role",
						"TournamentTeamMember.createdAt",
						"RankedSeedingSkill.ordinal as rankedOrdinal",
						"UnrankedSeedingSkill.ordinal as unrankedOrdinal",
					])
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					)
					.orderBy(sql`"TournamentTeamMember"."role" = 'OWNER'`, "desc")
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
		.where("TournamentTeam.isPlaceholder", "=", 0)
		.orderBy("TournamentTeam.createdAt", "asc")
		.execute();

	const friendCodes =
		await TournamentRepository.findFriendCodesByTournamentId(id);

	const seedByTeamId =
		tournament?.hasStarted && tournament.settings
			? seedsOfStartedTournament({ teams, settings: tournament.settings })
			: null;

	const result: GetTournamentTeamsResponse = teams.map((team) => {
		return {
			id: team.id,
			name: team.name,
			url: `https://sendou.ink/to/${id}/teams/${team.id}`,
			teamPageUrl:
				team.team?.customUrl && !team.team.deletedAt
					? `https://sendou.ink/t/${team.team.customUrl}`
					: null,
			seed: seedByTeamId ? (seedByTeamId.get(team.id) ?? null) : team.seed,
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
					discordId: member.discordId,
					avatarUrl: member.discordAvatar
						? `https://cdn.discordapp.com/avatars/${member.discordId}/${member.discordAvatar}.png`
						: null,
					country: member.country,
					captain: member.role === "OWNER",
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

/**
 * Seeds as the site shows them once the tournament has started: all teams are put in seed order, then
 * those who did not check in are left out and the rest numbered per starting bracket, the same
 * derivation the tournament pages do.
 */
function seedsOfStartedTournament({
	teams,
	settings,
}: {
	teams: Array<{
		id: number;
		seed: number | null;
		createdAt: number;
		startingBracketIdx: number | null;
		checkedInAt: number | null;
		members: Array<{
			userId: number;
			rankedOrdinal: number | null;
			unrankedOrdinal: number | null;
		}>;
	}>;
	settings: TournamentSettings;
}) {
	const isMultiStartingBracket =
		Progression.startingBrackets(settings.bracketProgression).length > 1;

	const teamsInSeedOrder = sortTeamsBySeeding(
		teams.map((team) => ({
			id: team.id,
			seed: team.seed,
			createdAt: team.createdAt,
			checkedInAt: team.checkedInAt,
			startingBracketIdx: isMultiStartingBracket
				? team.startingBracketIdx
				: null,
			memberUserIds: team.members.map((member) => member.userId),
			avgSeedingSkillOrdinal: nullifyingAvg(
				team.members
					.map((member) =>
						settings.isRanked ? member.rankedOrdinal : member.unrankedOrdinal,
					)
					.filter((ordinal) => typeof ordinal === "number"),
			),
		})),
		settings.minMembersPerTeam ?? 4,
	);

	return seedsByStartingBracket(
		teamsInSeedOrder.filter((team) => team.checkedInAt),
	);
}

function toSeedingPowerSP(ordinals: (number | null)[]) {
	const avg = nullifyingAvg(
		ordinals.filter((ordinal) => typeof ordinal === "number"),
	);

	if (typeof avg !== "number") return null;

	return ordinalToSp(avg);
}
