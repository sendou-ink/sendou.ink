import { addHours, addMinutes, subHours } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as SQReadyCheckFactory from "~/db/seed/factories/SQReadyCheckFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import * as PendingCheckIns from "~/features/tournament/core/PendingCheckIns.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import {
	runningTournamentWithMatch,
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
		PendingCheckIns.clearCache();
		await refreshSendouQInstance();
	});

	/** A tournament inside its check-in window, with the users' team registered. */
	const tournamentWithCheckInOpen = async ({
		isCheckedIn,
	}: {
		isCheckedIn?: boolean;
	} = {}) => {
		const { id: tournamentId } = await TournamentFactory.create({
			authorId: users.id(8),
			startTimes: [dateToDatabaseTimestamp(addMinutes(new Date(), 30))],
		});
		await TournamentTeamFactory.create(
			{ tournamentId, memberUserIds: userIds([1, 2, 3, 4]) },
			{ isCheckedIn },
		);

		return tournamentId;
	};

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
			expiresAt: expect.any(Number),
		});
	});

	test("resolves a group inactive for too long as expired", async () => {
		const group = await SQGroupFactory.create({
			memberUserIds: userIds([1, 2]),
		});
		await backdate("Group", group.id, {
			latestActionAt: subHours(new Date(), 2),
		});
		await refreshSendouQInstance();

		expect(await resolveGlobalStatus(users.id(1))).toEqual({
			state: "SQ_EXPIRED",
			url: SENDOUQ_LOOKING_PAGE,
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

	test("resolves a tournament the user has yet to check in to", async () => {
		const tournamentId = await tournamentWithCheckInOpen();

		expect(await resolveGlobalStatus(users.id(1))).toEqual({
			state: "TO_CHECKIN",
			url: tournamentRegisterPage(tournamentId),
			logoUrl: expect.any(String),
		});
	});

	test("resolves nothing once the team has checked in", async () => {
		await tournamentWithCheckInOpen({ isCheckedIn: true });

		expect(await resolveGlobalStatus(users.id(1))).toBeNull();
	});

	test("resolves nothing while check-in has yet to open", async () => {
		const { id: tournamentId } = await TournamentFactory.create({
			authorId: users.id(8),
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 5))],
		});
		await TournamentTeamFactory.create({
			tournamentId,
			memberUserIds: userIds([1, 2, 3, 4]),
		});

		expect(await resolveGlobalStatus(users.id(1))).toBeNull();
	});

	test("an ongoing tournament match beats a check-in of another tournament", async () => {
		await tournamentWithCheckInOpen();
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 100,
				teamOneUserIds: userIds([1]),
				teamTwoUserIds: userIds([2]),
			}),
		);

		expect((await resolveGlobalStatus(users.id(1)))?.state).toBe("TO_MATCH");
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
