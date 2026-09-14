import { beforeEach, describe, expect, test, vi } from "vitest";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as SQReadyCheckFactory from "~/db/seed/factories/SQReadyCheckFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import {
	progressions,
	testTournament,
	tournamentCtxTeam,
} from "~/features/tournament-bracket/core/tests/test-utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_READY_PAGE,
	sendouQMatchPage,
	tournamentRegisterPage,
} from "~/utils/urls";
import { resolveGlobalStatus } from "./global-status.server";

const { mockSeasonCurrentOrPrevious } = vi.hoisted(() => ({
	mockSeasonCurrentOrPrevious: vi.fn(() => ({
		nth: 1,
		starts: new Date("2023-01-01"),
		ends: new Date("2030-12-31"),
	})),
}));

vi.mock("~/features/mmr/core/Seasons", () => ({
	currentOrPrevious: mockSeasonCurrentOrPrevious,
}));

/** Users are interchangeable here, so tests name them by 1-based position. */
const users = UserFactory.pool();

const userIds = (positions: number[]) =>
	positions.map((position) => users.id(position));

const runningTournamentWithMatch = ({
	tournamentId,
	teamOneUserIds,
	teamTwoUserIds,
	isLeague,
	lockFirstMatchForCast,
}: {
	tournamentId: number;
	teamOneUserIds: number[];
	teamTwoUserIds: number[];
	isLeague?: boolean;
	lockFirstMatchForCast?: boolean;
}) => {
	const data = Engine.create({
		type: "swiss",
		seeding: [1, 2],
		settings: {},
	});

	return testTournament({
		data,
		ctx: {
			id: tournamentId,
			settings: {
				bracketProgression: progressions.swissOneGroup,
				isLeague,
			},
			castedMatchesInfo: lockFirstMatchForCast
				? {
						lockedMatches: [
							{ matchId: data.match[0].id, twitchAccount: "test" },
						],
						castedMatches: [],
					}
				: null,
			teams: [
				tournamentCtxTeam(1, { memberUserIds: teamOneUserIds }),
				tournamentCtxTeam(2, { memberUserIds: teamTwoUserIds }),
			],
		},
	});
};

const runningTournamentWithOpenCheckIn = ({
	tournamentId,
	teamUserIds,
}: {
	tournamentId: number;
	teamUserIds: number[];
}) =>
	testTournament({
		ctx: {
			id: tournamentId,
			startsAt: dateToDatabaseTimestamp(new Date(Date.now() + 30 * 60 * 1000)),
			teams: [
				tournamentCtxTeam(1, { memberUserIds: teamUserIds, checkIns: [] }),
			],
		},
	});

describe("resolveGlobalStatus", () => {
	beforeEach(async () => {
		await users.create(8);
		RunningTournaments.clear();
		await refreshSendouQInstance();
	});

	test("returns null for a user with nothing ongoing", async () => {
		expect(await resolveGlobalStatus(users.id(1))).toBeNull();
	});

	test("resolves a preparing group", async () => {
		await SQGroupFactory.create({
			status: "PREPARING",
			memberUserIds: userIds([1, 2]),
		});
		await refreshSendouQInstance();

		expect(await resolveGlobalStatus(users.id(1))).toEqual({
			state: "SQ_PREPARING",
			url: SENDOUQ_PREPARING_PAGE,
			groupSize: { members: 2, max: 4 },
		});
	});

	test("resolves a queued group with its likes received", async () => {
		const likerGroup = await SQGroupFactory.create({
			memberUserIds: userIds([5]),
		});
		const group = await SQGroupFactory.create(
			{ memberUserIds: userIds([1, 2]) },
			{ likedByGroupIds: [likerGroup.id] },
		);
		await refreshSendouQInstance();

		expect(await resolveGlobalStatus(users.id(1))).toEqual({
			state: "SQ_QUEUED",
			url: SENDOUQ_LOOKING_PAGE,
			groupSize: { members: 2, max: 4 },
			count: 1,
			groupId: group.id,
		});
	});

	test("resolves a ready check", async () => {
		const alphaGroup = await SQGroupFactory.create({
			memberUserIds: userIds([1, 2, 3, 4]),
		});
		const bravoGroup = await SQGroupFactory.create({
			memberUserIds: userIds([5, 6, 7, 8]),
		});
		await SQReadyCheckFactory.create({
			alphaGroupId: alphaGroup.id,
			bravoGroupId: bravoGroup.id,
			confirmedByUserId: users.id(1),
		});
		await refreshSendouQInstance();

		expect(await resolveGlobalStatus(users.id(5))).toEqual({
			state: "SQ_READY_CHECK",
			url: SENDOUQ_READY_PAGE,
		});
	});

	test("resolves an ongoing match", async () => {
		const match = await SQMatchFactory.create({
			alphaUserIds: userIds([1, 2, 3, 4]),
			bravoUserIds: userIds([5, 6, 7, 8]),
		});
		await refreshSendouQInstance();

		expect(await resolveGlobalStatus(users.id(1))).toEqual({
			state: "SQ_MATCH",
			url: sendouQMatchPage(match.id),
		});
	});

	test("resolves a reported match as awaiting the confirmation", async () => {
		const match = await SQMatchFactory.create(
			{
				alphaUserIds: userIds([1, 2, 3, 4]),
				bravoUserIds: userIds([5, 6, 7, 8]),
			},
			{ isReported: true },
		);
		await refreshSendouQInstance();

		expect(await resolveGlobalStatus(users.id(5))).toEqual({
			state: "SQ_AWAITING_REPORT",
			url: sendouQMatchPage(match.id),
		});
	});

	test("SendouQ status beats a tournament status", async () => {
		await SQGroupFactory.create({ memberUserIds: userIds([1]) });
		await refreshSendouQInstance();
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: userIds([1]),
				teamTwoUserIds: userIds([2]),
			}),
		);

		expect((await resolveGlobalStatus(users.id(1)))?.state).toBe("SQ_QUEUED");
	});

	test("resolves an ongoing tournament match with the tournament's logo", async () => {
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: userIds([1]),
				teamTwoUserIds: userIds([2]),
			}),
		);

		const status = await resolveGlobalStatus(users.id(1));

		expect(status?.state).toBe("TO_MATCH");
		expect(status?.url).toMatch(/^\/to\/1\/matches\/\d+$/);
		expect(status?.logoUrl).toBe("/test.avif");
	});

	test("resolves a match locked for cast as waiting for it", async () => {
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: userIds([1]),
				teamTwoUserIds: userIds([2]),
				lockFirstMatchForCast: true,
			}),
		);

		expect((await resolveGlobalStatus(users.id(1)))?.state).toBe(
			"TO_WAITING_FOR_CAST",
		);
	});

	test("resolves an open regular check-in", async () => {
		RunningTournaments.add(
			runningTournamentWithOpenCheckIn({
				tournamentId: 1,
				teamUserIds: userIds([1]),
			}),
		);

		const status = await resolveGlobalStatus(users.id(1));

		expect(status?.state).toBe("TO_CHECKIN");
		expect(status?.url).toBe(tournamentRegisterPage(1));
	});

	test("ignores leagues", async () => {
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: userIds([1]),
				teamTwoUserIds: userIds([2]),
				isLeague: true,
			}),
		);

		expect(await resolveGlobalStatus(users.id(1))).toBeNull();
	});

	test("the most urgent status of many running tournaments wins", async () => {
		RunningTournaments.add(
			runningTournamentWithOpenCheckIn({
				tournamentId: 1,
				teamUserIds: userIds([1]),
			}),
		);
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 2,
				teamOneUserIds: userIds([1]),
				teamTwoUserIds: userIds([2]),
			}),
		);

		expect((await resolveGlobalStatus(users.id(1)))?.state).toBe("TO_MATCH");
	});
});
