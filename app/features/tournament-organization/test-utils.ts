import { db } from "~/db/sql";

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
	const tournament = await db
		.insertInto("Tournament")
		.values({
			mapPickingStyle: "TO",
			settings: JSON.stringify({ bracketProgression: [] }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const event = await db
		.insertInto("CalendarEvent")
		.values({
			authorId: participantUserIds[0],
			name: `Event ${tournament.id}`,
			bracketUrl: "https://example.com/bracket",
			organizationId,
			tournamentId: tournament.id,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await db
		.insertInto("CalendarEventDate")
		.values({ eventId: event.id, startTime })
		.execute();

	const team = await db
		.insertInto("TournamentTeam")
		.values({
			tournamentId: tournament.id,
			name: `Team ${tournament.id}`,
			inviteCode: `inv-${tournament.id}`,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	if (checkIn !== "none") {
		await db
			.insertInto("TournamentTeamCheckIn")
			.values({
				tournamentTeamId: team.id,
				checkedInAt: startTime,
				isCheckOut: checkIn === "out" ? 1 : 0,
			})
			.execute();
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
			status: 4,
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
			reporterId: participantUserIds[0],
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
