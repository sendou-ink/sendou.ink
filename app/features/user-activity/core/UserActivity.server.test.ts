import { subHours } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import {
	progressions,
	testTournament,
	tournamentCtxTeam,
} from "~/features/tournament-bracket/core/tests/test-utils";
import * as UserActivity from "./UserActivity.server";

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

const runningTournamentWithMatch = ({
	tournamentId,
	teamOneUserIds,
	teamTwoUserIds,
	isLeague,
}: {
	tournamentId: number;
	teamOneUserIds: number[];
	teamTwoUserIds: number[];
	isLeague?: boolean;
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
			teams: [
				tournamentCtxTeam(1, { memberUserIds: teamOneUserIds }),
				tournamentCtxTeam(2, { memberUserIds: teamTwoUserIds }),
			],
		},
	});
};

describe("UserActivity.resolve", () => {
	beforeEach(async () => {
		await users.create(8);
		RunningTournaments.clear();
		await refreshSendouQInstance();
	});

	test("returns empty activity for a user doing nothing", () => {
		const activity = UserActivity.resolve(users.id(1));

		expect(activity.sendouq).toBeNull();
		expect(activity.tournaments).toEqual([]);
	});

	test("resolves the user's SendouQ group with its received like count", async () => {
		const likerGroup = await SQGroupFactory.create({
			memberUserIds: [users.id(5)],
		});
		const group = await SQGroupFactory.create(
			{ memberUserIds: [users.id(1), users.id(2)] },
			{ likedByGroupIds: [likerGroup.id] },
		);
		await refreshSendouQInstance();

		const activity = UserActivity.resolve(users.id(1));

		expect(activity.sendouq?.group.id).toBe(group.id);
		expect(activity.sendouq?.likesReceivedCount).toBe(1);
		expect(activity.sendouq?.expired).toBe(false);
	});

	test("a given like does not count as received", async () => {
		const likerGroup = await SQGroupFactory.create({
			memberUserIds: [users.id(5)],
		});
		await SQGroupFactory.create(
			{ memberUserIds: [users.id(1)] },
			{ likedByGroupIds: [likerGroup.id] },
		);
		await refreshSendouQInstance();

		expect(UserActivity.resolve(users.id(5)).sendouq?.likesReceivedCount).toBe(
			0,
		);
	});

	test("marks a group inactive for too long as expired", async () => {
		const group = await SQGroupFactory.create({
			memberUserIds: [users.id(1)],
		});
		await backdate("Group", group.id, {
			latestActionAt: subHours(new Date(), 2),
		});
		await refreshSendouQInstance();

		expect(UserActivity.resolve(users.id(1)).sendouq?.expired).toBe(true);
	});

	test("resolves running tournament statuses", () => {
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: [users.id(1)],
				teamTwoUserIds: [users.id(2)],
			}),
		);

		const activity = UserActivity.resolve(users.id(1));

		expect(activity.tournaments).toHaveLength(1);
		expect(activity.tournaments[0].status.type).toBe("MATCH");
	});

	test("omits leagues, whose matches are not something the user is doing right now", () => {
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: [users.id(1)],
				teamTwoUserIds: [users.id(2)],
				isLeague: true,
			}),
		);

		expect(UserActivity.resolve(users.id(1)).tournaments).toEqual([]);
	});

	test("resolves SendouQ and tournament activity at the same time", async () => {
		await SQGroupFactory.create({ memberUserIds: [users.id(1)] });
		await refreshSendouQInstance();
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: [users.id(1)],
				teamTwoUserIds: [users.id(2)],
			}),
		);

		const activity = UserActivity.resolve(users.id(1));

		expect(activity.sendouq).not.toBeNull();
		expect(activity.tournaments).toHaveLength(1);
	});
});
