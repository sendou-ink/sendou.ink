import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentSettings } from "~/db/tables-json";
import { userChannel } from "~/features/events/events-types";
import {
	abortSubscriptions,
	subscribeTo,
} from "~/features/events/tests/fixtures";
import { resolveMatchMapList } from "~/features/tournament-match/core/mapList.server";
import { reportScore } from "~/features/tournament-match/core/reportScore.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import * as BracketRepository from "./BracketRepository.server";
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

/** KOs are only reported in round robin brackets. */
const ROUND_ROBIN: TournamentSettings["bracketProgression"] = [
	{
		name: "Groups",
		type: "round_robin",
		requiresCheckIn: false,
		settings: { teamsPerGroup: 2 },
	},
];

const setupStartedMatch = async (
	overrides?: Partial<Parameters<typeof TournamentFactory.create>[0]>,
	options?: Parameters<typeof TournamentFactory.create>[1],
	startBracketArgs?: Parameters<typeof TournamentFactory.startBracket>[1],
) => {
	const authorId = users.id(1);
	const teamAlphaUserIds = [users.id(2), users.id(3), users.id(4), users.id(5)];
	const teamBravoUserIds = [users.id(6), users.id(7), users.id(8), users.id(9)];

	const tournament = await TournamentFactory.create(
		{ authorId, ...overrides },
		options,
	);
	for (const memberUserIds of [teamAlphaUserIds, teamBravoUserIds]) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds },
			{ isCheckedIn: true },
		);
	}
	await TournamentFactory.startBracket(tournament.id, startBracketArgs);

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

type GameResult = { winner: "one" | "two"; ko: boolean };

/** Reports every game of the match through `reportScore` until the set is over. */
const playOutMatch = async (
	setup: Awaited<ReturnType<typeof setupStartedMatch>>,
	resultOfGame: (position: number) => GameResult = () => ({
		winner: "one",
		ko: false,
	}),
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
		invariant(matchRow.opponentTwo?.id, "Match has no second opponent");

		const { winner, ko } = resultOfGame(position);

		const reported = await reportScore({
			match: matchRow,
			tournament,
			mapList: await resolveMatchMapList({ match: matchRow, tournament }),
			user: { id: setup.authorId },
			position,
			winnerTeamId:
				winner === "one" ? matchRow.opponentOne.id : matchRow.opponentTwo.id,
			ko,
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

describe("BracketRepository league chat room expiry", () => {
	const setupLeagueMatch = () =>
		setupStartedMatch({ bracketProgression: ROUND_ROBIN }, { isLeague: true });

	test("a league match's room lives two months", async () => {
		const setup = await setupLeagueMatch();

		expect(await roomLifespanDays(setup.chatRoomId)).toBe(60);
	});

	test("completing a league match cuts its room down to a week", async () => {
		const setup = await setupLeagueMatch();

		await playOutMatch(setup);

		expect(await roomLifespanDays(setup.chatRoomId)).toBe(7);
	});

	test("reopening a league match restores its room's lifespan", async () => {
		const setup = await setupLeagueMatch();
		await playOutMatch(setup);

		await executeBracketOperation({
			tournamentId: setup.tournamentId,
			tournament: await tournamentFromDB(setup.tournamentId),
			operation: (bracketData) =>
				Engine.reopenMatch(bracketData, setup.matchId),
			endDroppedTeams: false,
		});

		expect(await roomLifespanDays(setup.chatRoomId)).toBe(60);
	});

	test("a real-time league bracket's room lives a week, also after reopening", async () => {
		const setup = await setupStartedMatch(
			{ bracketProgression: ROUND_ROBIN },
			{ isLeague: true },
			{ isRealtime: true },
		);
		expect(await roomLifespanDays(setup.chatRoomId)).toBe(7);

		await playOutMatch(setup);
		await executeBracketOperation({
			tournamentId: setup.tournamentId,
			tournament: await tournamentFromDB(setup.tournamentId),
			operation: (bracketData) =>
				Engine.reopenMatch(bracketData, setup.matchId),
			endDroppedTeams: false,
		});

		expect(await roomLifespanDays(setup.chatRoomId)).toBe(7);
	});
});

describe("BracketRepository.findByTournamentId", () => {
	test("counts each opponent's KO wins into totalKos", async () => {
		const setup = await setupStartedMatch({ bracketProgression: ROUND_ROBIN });
		const kosOfGame: Array<GameResult> = [
			{ winner: "two", ko: true },
			{ winner: "one", ko: true },
			{ winner: "one", ko: true },
		];

		await playOutMatch(setup, (position) => kosOfGame[position]);

		const { match } = await BracketRepository.findByTournamentId(
			setup.tournamentId,
		);
		const playedMatch = match.find(
			(bracketMatch) => bracketMatch.id === setup.matchId,
		);

		expect(playedMatch?.opponent1?.totalKos).toBe(2);
		expect(playedMatch?.opponent2?.totalKos).toBe(1);
	});

	test("does not count games won without a KO", async () => {
		const setup = await setupStartedMatch({ bracketProgression: ROUND_ROBIN });

		await playOutMatch(setup);

		const { match } = await BracketRepository.findByTournamentId(
			setup.tournamentId,
		);
		const playedMatch = match.find(
			(bracketMatch) => bracketMatch.id === setup.matchId,
		);

		expect(playedMatch?.opponent1?.totalKos).toBe(0);
		expect(playedMatch?.opponent2?.totalKos).toBe(0);
	});
});

const roomLifespanDays = async (id: number) =>
	Math.round(
		((await roomById(id)).expiresAt - databaseTimestampNow()) / (24 * 60 * 60),
	);

const roomById = (id: number) =>
	db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirstOrThrow();
