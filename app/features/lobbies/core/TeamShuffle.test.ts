import { rating } from "openskill";
import { describe, expect, test } from "vitest";
import type { PlayerRole } from "./PlayerRoles";
import * as TeamShuffle from "./TeamShuffle";

const NO_HISTORY = TeamShuffle.teammateHistory([]);

function player(
	userId: number,
	overrides: Partial<TeamShuffle.ShufflePlayer> = {},
): TeamShuffle.ShufflePlayer {
	return {
		userId,
		rating: rating(),
		roles: [],
		sitOutCount: 0,
		satOutPreviousSet: false,
		...overrides,
	};
}

const players = (count: number) =>
	Array.from({ length: count }, (_, i) => player(i + 1));

const sameTeam = (result: TeamShuffle.ShuffleResult, a: number, b: number) =>
	(result.alpha.includes(a) && result.alpha.includes(b)) ||
	(result.bravo.includes(a) && result.bravo.includes(b));

const split = (alpha: TeamShuffle.ShufflePlayer[]) => {
	const all = players(8).map(
		(p) => alpha.find((a) => a.userId === p.userId) ?? p,
	);
	const alphaIds = alpha.map((p) => p.userId);

	return {
		alpha: all.filter((p) => alphaIds.includes(p.userId)),
		bravo: all.filter((p) => !alphaIds.includes(p.userId)),
	};
};

const evenSplit = split(players(4));

describe("TeamShuffle.shuffle", () => {
	test("splits 8 players 4v4 with nobody sitting out", () => {
		const result = TeamShuffle.shuffle({
			players: players(8),
			history: NO_HISTORY,
		});

		expect(result.alpha).toHaveLength(4);
		expect(result.bravo).toHaveLength(4);
		expect(result.sittingOut).toEqual([]);
		expect([...result.alpha, ...result.bravo].sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8,
		]);
	});

	test("balances strong players across the teams", () => {
		const strong = rating({ mu: 40 });
		const result = TeamShuffle.shuffle({
			players: [
				player(1, { rating: strong }),
				player(2, { rating: strong }),
				...players(8).slice(2),
			],
			history: NO_HISTORY,
		});

		expect(sameTeam(result, 1, 2)).toBe(false);
	});

	test("avoids teaming up the previous set's teammates", () => {
		const history = TeamShuffle.teammateHistory([
			{ alpha: [1, 2, 3, 4], bravo: [5, 6, 7, 8] },
		]);

		for (let i = 0; i < 20; i++) {
			const result = TeamShuffle.shuffle({ players: players(8), history });

			// with even ratings the best splits put two of each old team on each side
			const oldTeammatesTogether = [
				[1, 2],
				[1, 3],
				[1, 4],
				[2, 3],
				[2, 4],
				[3, 4],
			].filter(([a, b]) => sameTeam(result, a, b)).length;
			expect(oldTeammatesTogether).toBe(2);
		}
	});

	test("balance beats teammate variety", () => {
		const strong = rating({ mu: 40 });
		const history = TeamShuffle.teammateHistory([
			{ alpha: [1, 3, 5, 7], bravo: [2, 4, 6, 8] },
		]);

		const result = TeamShuffle.shuffle({
			players: [
				player(1, { rating: strong }),
				player(2, { rating: strong }),
				...players(8).slice(2),
			],
			history,
		});

		expect(sameTeam(result, 1, 2)).toBe(false);
	});

	test("gives both teams a player with a backline weapon over teammate variety", () => {
		const history = TeamShuffle.teammateHistory([
			{ alpha: [1, 2, 3, 4], bravo: [5, 6, 7, 8] },
		]);

		for (let i = 0; i < 20; i++) {
			const result = TeamShuffle.shuffle({
				players: [
					player(1, { roles: ["BACKLINE_IN_POOL"] }),
					player(2, { roles: ["BACKLINE_IN_POOL"] }),
					...players(8).slice(2),
				],
				history,
			});

			expect(sameTeam(result, 1, 2)).toBe(false);
		}
	});

	test("separates backline only players over teammate variety, even when a flex player covers the other team", () => {
		// 1 and 2 are the only pair who haven't been teammates yet
		const history = TeamShuffle.teammateHistory([
			{ alpha: [1, 3, 4, 5], bravo: [2, 6, 7, 8] },
			{ alpha: [1, 6, 7, 8], bravo: [2, 3, 4, 5] },
		]);

		for (let i = 0; i < 20; i++) {
			const result = TeamShuffle.shuffle({
				players: [
					player(1, { roles: ["BACKLINE", "BACKLINE_IN_POOL"] }),
					player(2, { roles: ["BACKLINE", "BACKLINE_IN_POOL"] }),
					player(3, { roles: ["BACKLINE_IN_POOL"] }),
					...players(8).slice(3),
				],
				history,
			});

			expect(sameTeam(result, 1, 2)).toBe(false);
		}
	});

	test("finds the only even split of the room", () => {
		const mus = [11, 17, 32, 40, 21, 24, 26, 29];

		const result = TeamShuffle.shuffle({
			players: mus.map((mu, i) => player(i + 1, { rating: rating({ mu }) })),
			history: NO_HISTORY,
		});

		expect([...result.alpha].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
	});

	test("picks randomly between equally good splits", () => {
		const shuffleWith = (randomValue: number) =>
			TeamShuffle.shuffle({
				players: players(8),
				history: NO_HISTORY,
				random: () => randomValue,
			});

		expect(shuffleWith(0).alpha).not.toEqual(shuffleWith(0.99).alpha);
	});

	test("sits out the players over 8", () => {
		const result = TeamShuffle.shuffle({
			players: players(10),
			history: NO_HISTORY,
		});

		expect(result.sittingOut).toHaveLength(2);
		expect(result.alpha.length + result.bravo.length).toBe(8);
	});
});

describe("TeamShuffle.pickSitOuts", () => {
	test.each([
		{
			why: "fewest sat out first",
			players: [player(1, { sitOutCount: 1 }), player(2)],
			expected: [2],
		},
		{
			why: "not twice in a row",
			players: [player(1, { satOutPreviousSet: true }), player(2)],
			expected: [2],
		},
	])("$why", ({ players: given, expected }) => {
		// 7 others who've sat out a lot, so one of the two given sits out
		const others = players(7).map((p) =>
			player(p.userId + 10, { sitOutCount: 9 }),
		);
		const tiedRandom = () => 0;

		expect(TeamShuffle.pickSitOuts([...others, ...given], tiedRandom)).toEqual(
			expected,
		);
	});

	test("nobody sits out with 8", () => {
		expect(TeamShuffle.pickSitOuts(players(8))).toEqual([]);
	});
});

describe("TeamShuffle.roleStackCost", () => {
	const withRoles = (userId: number, roles: PlayerRole[]) =>
		player(userId, { roles });

	test.each([
		{
			why: "spread evenly",
			alpha: [["TACTICOOLER"], [], [], []],
			bravo: [["TACTICOOLER"], [], [], []],
			expected: 0,
		},
		{
			why: "both coolers on one team",
			alpha: [["TACTICOOLER"], ["TACTICOOLER"], [], []],
			bravo: [[], [], [], []],
			expected: 2,
		},
		{
			why: "an odd one out is free",
			alpha: [["TACTICOOLER"], [], [], []],
			bravo: [[], [], [], []],
			expected: 0,
		},
		{
			why: "an odd one out is free on the other team too",
			alpha: [[], [], [], []],
			bravo: [["TACTICOOLER"], [], [], []],
			expected: 0,
		},
		{
			why: "other roles don't count",
			alpha: [["BACKLINE"], ["BACKLINE"], [], []],
			bravo: [[], [], [], []],
			expected: 0,
		},
	] as Array<{
		why: string;
		alpha: PlayerRole[][];
		bravo: PlayerRole[][];
		expected: number;
	}>)("$why", ({ alpha, bravo, expected }) => {
		expect(
			TeamShuffle.roleStackCost(
				{
					alpha: alpha.map((roles, i) => withRoles(i + 1, roles)),
					bravo: bravo.map((roles, i) => withRoles(i + 5, roles)),
				},
				"TACTICOOLER",
			),
		).toBe(expected);
	});
});

describe("TeamShuffle.backlineCoverageCost", () => {
	const withBackline = player(1, { roles: ["BACKLINE_IN_POOL"] });

	test.each([
		{ why: "one on each team", alpha: [1], bravo: [5], expected: 0 },
		{ why: "both on one team", alpha: [1, 2], bravo: [], expected: 1 },
		{ why: "nobody has one", alpha: [], bravo: [], expected: 2 },
	])("$why", ({ alpha, bravo, expected }) => {
		const team = (userIds: number[], from: number) =>
			Array.from({ length: 4 }, (_, i) =>
				userIds.includes(from + i)
					? { ...withBackline, userId: from + i }
					: player(from + i),
			);

		expect(
			TeamShuffle.backlineCoverageCost({
				alpha: team(alpha, 1),
				bravo: team(bravo, 5),
			}),
		).toBe(expected);
	});
});

describe("TeamShuffle.teammateHistory", () => {
	test("counts sets together and remembers the previous set", () => {
		const history = TeamShuffle.teammateHistory([
			{ alpha: [1, 2, 3, 4], bravo: [5, 6, 7, 8] },
			{ alpha: [1, 2, 5, 6], bravo: [3, 4, 7, 8] },
		]);

		expect(history.setsTogether.get(TeamShuffle.pairKey(1, 2))).toBe(2);
		expect(history.setsTogether.get(TeamShuffle.pairKey(3, 1))).toBe(1);
		expect(history.previousSetPairs.has(TeamShuffle.pairKey(6, 1))).toBe(true);
		expect(history.previousSetPairs.has(TeamShuffle.pairKey(1, 3))).toBe(false);
	});
});

describe("TeamShuffle.balanceCost", () => {
	test("an even split has no balance cost", () => {
		expect(TeamShuffle.balanceCost(evenSplit)).toBeCloseTo(0);
	});

	test("a stronger team costs balance", () => {
		const strong = rating({ mu: 40 });
		const stacked = split(
			players(4).map((p) => player(p.userId, { rating: strong })),
		);

		expect(TeamShuffle.balanceCost(stacked)).toBeGreaterThan(0.3);
	});
});

describe("TeamShuffle.teammateRepeatCost", () => {
	test("repeat teammates cost per set together, more for the previous set", () => {
		const history = TeamShuffle.teammateHistory([
			{ alpha: [1, 2, 5, 6], bravo: [3, 4, 7, 8] },
			{ alpha: [1, 2, 7, 8], bravo: [3, 4, 5, 6] },
		]);

		// 1-2, 3-4, 5-6 and 7-8 were teammates in both sets
		expect(TeamShuffle.teammateRepeatCost(evenSplit, history)).toBe(
			4 *
				(2 * TeamShuffle.TEAMMATE_REPEAT_WEIGHT +
					TeamShuffle.PREVIOUS_SET_TEAMMATE_WEIGHT),
		);
	});
});

describe("TeamShuffle.splitCost", () => {
	test("weighs the cost terms", () => {
		const stacked = split([
			player(1, { roles: ["TACTICOOLER", "BACKLINE", "BACKLINE_IN_POOL"] }),
			player(2, { roles: ["TACTICOOLER", "BACKLINE", "BACKLINE_IN_POOL"] }),
			player(3),
			player(4),
		]);

		expect(TeamShuffle.splitCost(stacked, NO_HISTORY)).toBeCloseTo(
			TeamShuffle.BALANCE_WEIGHT * TeamShuffle.balanceCost(stacked) +
				TeamShuffle.BACKLINE_COVERAGE_WEIGHT +
				2 * TeamShuffle.BACKLINE_STACK_WEIGHT +
				2 * TeamShuffle.TACTICOOLER_STACK_WEIGHT,
		);
	});
});
