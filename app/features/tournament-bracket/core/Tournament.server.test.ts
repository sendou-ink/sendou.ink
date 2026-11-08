import { addHours, addMinutes, subHours, subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as Engine from "./engine";
import { RunningTournaments } from "./RunningTournaments.server";
import {
	clearTournamentDataCache,
	evictStaleRunningTournaments,
	refreshTournamentCache,
	serializeBracket,
	tournamentSharedCached,
	tournamentTeamsFullCached,
} from "./Tournament.server";
import { progressions, testTournament } from "./tests/test-utils";

const users = UserFactory.pool();

const SWISS_SETTINGS = { groupCount: 2, roundCount: 3 };

const swissBracket = () => {
	const tournament = testTournament({
		data: Engine.create({
			type: "swiss",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: SWISS_SETTINGS,
		}),
		ctx: {
			settings: {
				bracketProgression: [
					{
						name: "Main Bracket",
						type: "swiss",
						requiresCheckIn: false,
						settings: SWISS_SETTINGS,
					},
				],
			},
		},
	});

	return tournament.bracketByIdx(0)!;
};

describe("serializeBracket", () => {
	test("ships every group's match data by default", () => {
		const bracket = swissBracket();

		const serialized = serializeBracket(bracket);

		expect(serialized.data.match).toEqual(bracket.data.match);
		expect(serialized.data.round).toEqual(bracket.data.round);
	});

	test("ships the match data of one group only", () => {
		const bracket = swissBracket();
		const groupId = bracket.data.group[1].id;

		const serialized = serializeBracket(bracket, { groupId });

		expect(serialized.data.match.length).toBeGreaterThan(0);
		expect(
			serialized.data.match.every((match) => match.groupId === groupId),
		).toBe(true);
		expect(serialized.data.round.length).toBeGreaterThan(0);
		expect(
			serialized.data.round.every((round) => round.groupId === groupId),
		).toBe(true);
	});

	test("ships every group of the bracket so that the view can switch between them", () => {
		const bracket = swissBracket();

		const serialized = serializeBracket(bracket, {
			groupId: bracket.data.group[1].id,
		});

		expect(serialized.data.group).toEqual(bracket.data.group);
	});
});

describe("evictStaleRunningTournaments", () => {
	beforeEach(() => {
		RunningTournaments.clear();
	});

	const tournamentStarted = ({
		startsAt,
		bracketStartedAt,
		nextBracketStartsAt,
		isTest,
	}: {
		startsAt: Date;
		bracketStartedAt: Date;
		/** Schedules a follow-up bracket, as a tournament running over several days has. */
		nextBracketStartsAt?: Date;
		isTest?: boolean;
	}) => {
		const data = Engine.create({
			type: "swiss",
			seeding: [1, 2],
			settings: {},
		});

		return testTournament({
			data: {
				...data,
				stage: data.stage.map((stage) => ({
					...stage,
					createdAt: dateToDatabaseTimestamp(bracketStartedAt),
				})),
			},
			ctx: {
				startsAt: dateToDatabaseTimestamp(startsAt),
				settings: {
					isTest,
					bracketProgression: nextBracketStartsAt
						? [
								...progressions.swissOneGroup,
								{
									...progressions.roundRobinToSingleElimination[1],
									startTime: dateToDatabaseTimestamp(nextBracketStartsAt),
								},
							]
						: progressions.swissOneGroup,
				},
			},
		});
	};

	test("keeps a tournament whose bracket was actually started recently despite an old scheduled start", () => {
		RunningTournaments.add(
			tournamentStarted({
				startsAt: subHours(new Date(), 24),
				bracketStartedAt: subMinutes(new Date(), 5),
			}),
		);

		evictStaleRunningTournaments();

		expect(RunningTournaments.has(1)).toBe(true);
	});

	test("evicts a test tournament even when its bracket was started recently", () => {
		RunningTournaments.add(
			tournamentStarted({
				startsAt: subMinutes(new Date(), 30),
				bracketStartedAt: subMinutes(new Date(), 5),
				isTest: true,
			}),
		);

		evictStaleRunningTournaments();

		expect(RunningTournaments.has(1)).toBe(false);
	});

	test("evicts a tournament whose every start is older than the liveness window", () => {
		RunningTournaments.add(
			tournamentStarted({
				startsAt: subHours(new Date(), 24),
				bracketStartedAt: subHours(new Date(), 7),
			}),
		);

		evictStaleRunningTournaments();

		expect(RunningTournaments.has(1)).toBe(false);
	});

	test("keeps a long paused tournament whose next bracket's check-in has opened", () => {
		RunningTournaments.add(
			tournamentStarted({
				startsAt: subHours(new Date(), 24),
				bracketStartedAt: subHours(new Date(), 7),
				nextBracketStartsAt: addMinutes(new Date(), 30),
			}),
		);

		evictStaleRunningTournaments();

		expect(RunningTournaments.has(1)).toBe(true);
	});

	test("evicts it again while that bracket's check-in has yet to open", () => {
		RunningTournaments.add(
			tournamentStarted({
				startsAt: subHours(new Date(), 24),
				bracketStartedAt: subHours(new Date(), 7),
				nextBracketStartsAt: addHours(new Date(), 5),
			}),
		);

		evictStaleRunningTournaments();

		expect(RunningTournaments.has(1)).toBe(false);
	});
});

describe("refreshTournamentCache", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("stores the rebuild for the next viewer", async () => {
		const { id: tournamentId } = await TournamentFactory.create({
			authorId: users.id(1),
		});

		clearTournamentDataCache(tournamentId);
		const refreshed = await refreshTournamentCache(tournamentId);

		expect(await tournamentSharedCached(tournamentId)).toBe(refreshed);
	});
});

describe("clearTournamentDataCache", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	const setupWithRosterCached = async () => {
		const { id: tournamentId } = await TournamentFactory.create({
			authorId: users.id(1),
		});
		await TournamentTeamFactory.create({
			tournamentId,
			memberUserIds: [users.id(2)],
		});
		await tournamentTeamsFullCached({ tournamentId });
		await TournamentTeamFactory.create({
			tournamentId,
			memberUserIds: [users.id(3)],
		});

		return tournamentId;
	};

	test("keeps the rosters cached with keepRosters", async () => {
		const tournamentId = await setupWithRosterCached();

		clearTournamentDataCache(tournamentId, { keepRosters: true });

		expect(await tournamentTeamsFullCached({ tournamentId })).toHaveLength(1);
	});

	test("drops the rosters by default", async () => {
		const tournamentId = await setupWithRosterCached();

		clearTournamentDataCache(tournamentId);

		expect(await tournamentTeamsFullCached({ tournamentId })).toHaveLength(2);
	});
});
