import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as TournamentMatchRepository from "./TournamentMatchRepository.server";

const createTournament = () =>
	db
		.insertInto("Tournament")
		.values({
			mapPickingStyle: "TO",
			settings: JSON.stringify({ bracketProgression: [] }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createTeam = (tournamentId: number, name: string) =>
	db
		.insertInto("TournamentTeam")
		.values({
			tournamentId,
			name,
			inviteCode: `inv-${tournamentId}-${name}`,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createStage = (tournamentId: number, name: string, number: number) =>
	db
		.insertInto("TournamentStage")
		.values({
			tournamentId,
			name,
			number,
			type: "double_elimination",
			settings: "{}",
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createGroup = (stageId: number, number: number) =>
	db
		.insertInto("TournamentGroup")
		.values({ stageId, number })
		.returning("id")
		.executeTakeFirstOrThrow();

const createRound = (stageId: number, groupId: number, number: number) =>
	db
		.insertInto("TournamentRound")
		.values({
			stageId,
			groupId,
			number,
			maps: JSON.stringify({ count: 3, type: "BEST_OF" }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createMatch = async (args: {
	stageId: number;
	groupId: number;
	roundId: number;
	number: number;
	teamOneId: number;
	teamTwoId: number;
}) => {
	const match = await db
		.insertInto("TournamentMatch")
		.values({
			stageId: args.stageId,
			groupId: args.groupId,
			roundId: args.roundId,
			number: args.number,
			status: 4,
			opponentOne: JSON.stringify({ id: args.teamOneId, score: 2 }),
			opponentTwo: JSON.stringify({ id: args.teamTwoId, score: 0 }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await db
		.insertInto("TournamentMatchGameResult")
		.values({
			matchId: match.id,
			mode: "SZ",
			number: 1,
			reporterId: 1,
			source: "TO",
			stageId: 1,
			winnerTeamId: args.teamOneId,
		})
		.returning("id")
		.executeTakeFirstOrThrow()
		.then((result) =>
			db
				.insertInto("TournamentMatchGameResultParticipant")
				.values([
					{
						matchGameResultId: result.id,
						userId: 1,
						tournamentTeamId: args.teamOneId,
					},
					{
						matchGameResultId: result.id,
						userId: 2,
						tournamentTeamId: args.teamTwoId,
					},
				])
				.execute(),
		);

	return match;
};

describe("findByTournamentTeamId", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("preserves stage order: matches from an earlier stage come first even when later stage has lower group numbers", async () => {
		// Tournament with two stages. The first stage has a high group number
		// (think: round-robin pool 8) and the second stage has group number 1
		// (think: DE bracket winners). The team page should show stage 1's
		// matches first, then stage 2's.
		const tournament = await createTournament();
		const teamA = await createTeam(tournament.id, "A");
		const teamB = await createTeam(tournament.id, "B");

		// Insert team members so we have someone to attribute results to
		for (const userId of [1, 2]) {
			await db
				.insertInto("TournamentTeamMember")
				.values({ tournamentTeamId: teamA.id, userId, role: "OWNER" })
				.execute();
			await db
				.insertInto("TournamentTeamMember")
				.values({ tournamentTeamId: teamB.id, userId, role: "OWNER" })
				.execute();
		}

		const stage1 = await createStage(tournament.id, "Stage 1", 1);
		const stage1Group = await createGroup(stage1.id, 8);
		const stage1Round = await createRound(stage1.id, stage1Group.id, 1);
		const stage1Match = await createMatch({
			stageId: stage1.id,
			groupId: stage1Group.id,
			roundId: stage1Round.id,
			number: 1,
			teamOneId: teamA.id,
			teamTwoId: teamB.id,
		});

		const stage2 = await createStage(tournament.id, "Stage 2", 2);
		const stage2Group = await createGroup(stage2.id, 1);
		const stage2Round = await createRound(stage2.id, stage2Group.id, 1);
		const stage2Match = await createMatch({
			stageId: stage2.id,
			groupId: stage2Group.id,
			roundId: stage2Round.id,
			number: 1,
			teamOneId: teamA.id,
			teamTwoId: teamB.id,
		});

		const result = await TournamentMatchRepository.findByTournamentTeamId(
			teamA.id,
		);

		expect(result.map((s) => s.tournamentMatchId)).toEqual([
			stage1Match.id,
			stage2Match.id,
		]);
	});
});
