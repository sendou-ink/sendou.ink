import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import { db } from "~/db/sql";
import { withUserId } from "~/utils/Test";
import * as TournamentTeamRepository from "../tournament/TournamentTeamRepository.server";

/**
 * Seeds a played tournament hosted by `organizationId`, starting at `startTime`
 * (a database timestamp in seconds), with one team whose roster is
 * `participantUserIds`. The team is checked in by default.
 *
 * Creates the full chain the active-participants query relies on:
 * CalendarEvent → CalendarEventDate → Tournament → TournamentTeam
 * (+ TournamentTeamCheckIn) → stage/group/round/match → game result +
 * participants.
 *
 * Only meant for use in tests.
 */
export async function seedOrgEventWithParticipants({
	organizationId,
	startTime,
	participantUserIds,
	checkIn = "in",
}: {
	organizationId: number;
	startTime: number;
	participantUserIds: number[];
	checkIn?: "in" | "out" | "none";
}) {
	const [ownerUserId, ...memberUserIds] = participantUserIds;

	const tournament = await TournamentFactory.create({
		authorId: ownerUserId,
		organizationId,
		startTimes: [startTime],
	});

	const team = await TournamentTeamFactory.create(
		{
			tournamentId: tournament.id,
			userId: ownerUserId,
			additionalMemberUserIds: memberUserIds,
		},
		{ isCheckedIn: checkIn === "in" },
	);

	if (checkIn === "out") {
		// a check out leaves a row of its own only when it concerns one bracket,
		// otherwise checking out simply undoes the check in
		await withUserId(ownerUserId, async () => {
			await TournamentTeamRepository.checkIn(team.id, { bracketIdx: 0 });
			await TournamentTeamRepository.checkOut({
				tournamentTeamId: team.id,
				bracketIdx: 0,
			});
		});
	}

	const stage = await db
		.insertInto("TournamentStage")
		.values({
			tournamentId: tournament.id,
			name: "Stage",
			number: 1,
			type: "single_elimination",
			settings: "{}",
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const group = await db
		.insertInto("TournamentGroup")
		.values({ stageId: stage.id, number: 1 })
		.returning("id")
		.executeTakeFirstOrThrow();

	const round = await db
		.insertInto("TournamentRound")
		.values({
			stageId: stage.id,
			groupId: group.id,
			number: 1,
			maps: JSON.stringify({ count: 3, type: "BEST_OF" }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const match = await db
		.insertInto("TournamentMatch")
		.values({
			stageId: stage.id,
			groupId: group.id,
			roundId: round.id,
			number: 1,
			opponentOne: JSON.stringify({ id: team.id, score: 1 }),
			opponentTwo: JSON.stringify({ id: team.id, score: 0 }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const gameResult = await db
		.insertInto("TournamentMatchGameResult")
		.values({
			matchId: match.id,
			mode: "SZ",
			number: 1,
			reporterId: ownerUserId,
			source: "TO",
			stageId: 1,
			winnerTeamId: team.id,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await db
		.insertInto("TournamentMatchGameResultParticipant")
		.values(
			participantUserIds.map((userId) => ({
				matchGameResultId: gameResult.id,
				userId,
				tournamentTeamId: team.id,
			})),
		)
		.execute();

	return { tournamentId: tournament.id, teamId: team.id };
}
