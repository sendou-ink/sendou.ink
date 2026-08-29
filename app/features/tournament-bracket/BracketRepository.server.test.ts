import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { userChannel } from "~/features/events/events-types";
import {
	abortSubscriptions,
	subscribeTo,
} from "~/features/events/tests/fixtures";
import { resolveMatchMapList } from "~/features/tournament-match/core/mapList.server";
import { reportScore } from "~/features/tournament-match/core/reportScore.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import invariant from "~/utils/invariant";
import * as Engine from "./core/engine";
import { executeBracketOperation } from "./core/executeBracketOperation.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "./core/Tournament.server";

const users = UserFactory.pool();

beforeEach(async () => {
	await users.create(9);
});

afterEach(() => {
	abortSubscriptions();
});

const setupStartedMatch = async () => {
	const authorId = users.id(1);
	const teamAlphaUserIds = [users.id(2), users.id(3), users.id(4), users.id(5)];
	const teamBravoUserIds = [users.id(6), users.id(7), users.id(8), users.id(9)];

	const tournament = await TournamentFactory.create({ authorId });
	for (const memberUserIds of [teamAlphaUserIds, teamBravoUserIds]) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds },
			{ isCheckedIn: true },
		);
	}
	await TournamentFactory.startBracket(tournament.id);

	const match = await db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select(["TournamentMatch.id", "TournamentMatch.chatRoomId"])
		.where("TournamentStage.tournamentId", "=", tournament.id)
		.where("TournamentMatch.chatRoomId", "is not", null)
		.executeTakeFirstOrThrow();

	return {
		tournamentId: tournament.id,
		authorId,
		matchId: match.id,
		chatRoomId: match.chatRoomId!,
	};
};

/** Reports every game of the match through `reportScore` until the set is over. */
const playOutMatch = async (
	setup: Awaited<ReturnType<typeof setupStartedMatch>>,
) => {
	let position = 0;
	let setOver = false;

	while (!setOver) {
		const tournament = await tournamentFromDB(setup.tournamentId);
		const matchRow = await TournamentMatchRepository.findMatchById(
			setup.matchId,
		);
		invariant(matchRow, "Match not found");
		invariant(matchRow.opponentOne?.id, "Match has no first opponent");

		const reported = await reportScore({
			match: matchRow,
			tournament,
			mapList: await resolveMatchMapList({ match: matchRow, tournament }),
			user: { id: setup.authorId },
			position,
			winnerTeamId: matchRow.opponentOne.id,
			ko: false,
		});
		invariant(reported, `Game ${position} was already reported`);

		setOver = reported.setOver;
		position++;
	}

	clearTournamentDataCache(setup.tournamentId);
};

describe("BracketRepository.applyMatchChanges", () => {
	test("completing a match marks its chat room inactive", async () => {
		const setup = await setupStartedMatch();
		expect((await roomById(setup.chatRoomId)).inactive).toBe(0);

		await playOutMatch(setup);

		expect((await roomById(setup.chatRoomId)).inactive).toBe(1);
	});

	test("tells the match's participants their room list changed", async () => {
		const setup = await setupStartedMatch();
		const received = subscribeTo(userChannel(users.id(2)));

		await playOutMatch(setup);

		await vi.waitFor(() =>
			expect(received).toEqual([{ kind: "roomsChanged" }]),
		);
	});

	test("reopening a completed match marks its chat room back active", async () => {
		const setup = await setupStartedMatch();
		await playOutMatch(setup);

		const tournament = await tournamentFromDB(setup.tournamentId);
		await executeBracketOperation({
			tournamentId: setup.tournamentId,
			tournament,
			operation: (bracketData) =>
				Engine.reopenMatch(bracketData, setup.matchId),
			endDroppedTeams: false,
		});

		expect((await roomById(setup.chatRoomId)).inactive).toBe(0);
	});
});

const roomById = (id: number) =>
	db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirstOrThrow();
