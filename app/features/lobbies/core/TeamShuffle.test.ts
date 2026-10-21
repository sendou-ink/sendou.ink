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

		expect(TeamShuffle.pickSitOuts([...others, ...given])).toEqual(expected);
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
			alpha: [["BACKLINE"], [], [], []],
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
			TeamShuffle.roleStackCost({
				alpha: alpha.map((roles, i) => withRoles(i + 1, roles)),
				bravo: bravo.map((roles, i) => withRoles(i + 5, roles)),
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

describe("TeamShuffle cost terms", () => {
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

	test("the split cost weighs the terms", () => {
		const coolers = split([
			player(1, { roles: ["TACTICOOLER"] }),
			player(2, { roles: ["TACTICOOLER"] }),
			player(3),
			player(4),
		]);

		expect(TeamShuffle.splitCost(coolers, NO_HISTORY)).toBeCloseTo(
			TeamShuffle.BALANCE_WEIGHT * TeamShuffle.balanceCost(coolers) +
				2 * TeamShuffle.ROLE_STACK_WEIGHT,
		);
	});
});
