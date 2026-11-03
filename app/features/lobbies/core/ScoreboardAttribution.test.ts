import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { LobbySide } from "../lobbies-constants";
import * as ScoreboardAttribution from "./ScoreboardAttribution";

const NAMES: Record<number, string> = {
	1: "Sendou",
	2: "pee-liter",
	3: "± Acing",
	4: "Jp",
	5: "Pita",
	6: "biキersweet",
	7: "hfcRed",
	8: "n.",
};

/** Three sets in which every two of the players 1-8 played on opposite sides at least once. */
const RESHUFFLED_SETS = [0, 1, 2].map((bit) => {
	const userIds = [1, 2, 3, 4, 5, 6, 7, 8];
	const isAlpha = (userId: number) => ((userId - 1) & (1 << bit)) === 0;

	return {
		alpha: userIds.filter(isAlpha),
		bravo: userIds.filter((userId) => !isAlpha(userId)),
	};
});

describe("ScoreboardAttribution.rowUserIds", () => {
	test("attributes every row once every two players have been on opposite sides", () => {
		const games = RESHUFFLED_SETS.map((set) => gameOf(set));

		expect(ScoreboardAttribution.rowUserIds(games)).toEqual(
			RESHUFFLED_SETS.map(seatsOf),
		);
	});

	test("leaves the rows unknown while the same players have always shared a side", () => {
		const set = { alpha: [1, 2, 3, 4], bravo: [5, 6, 7, 8] };

		expect(
			ScoreboardAttribution.rowUserIds([gameOf(set), gameOf(set)]).flat(),
		).toEqual(Array(16).fill(null));
	});

	test("leaves only the players who always shared a side unknown", () => {
		const [first, second] = RESHUFFLED_SETS;

		const [result] = ScoreboardAttribution.rowUserIds([
			gameOf(first!),
			gameOf(second!),
		]);

		// 1 & 5, 2 & 6, 3 & 7 and 4 & 8 played on the same side in both sets
		expect(result).toEqual(Array(8).fill(null));
	});

	test("pools misread variants of a name", () => {
		const games = [
			...RESHUFFLED_SETS.slice(0, 2).map((set) => gameOf(set)),
			gameOf({
				...RESHUFFLED_SETS[2]!,
				names: { ...NAMES, 1: "Sendov", 3: "± Acino" },
			}),
		];

		expect(ScoreboardAttribution.rowUserIds(games).at(-1)).toEqual(
			seatsOf(RESHUFFLED_SETS[2]!),
		);
	});

	test("places a name changed mid-set when the side's other rows are known", () => {
		const games = [
			...RESHUFFLED_SETS.map((set) => gameOf(set)),
			gameOf({
				...RESHUFFLED_SETS[2]!,
				names: { ...NAMES, 1: "NewName" },
			}),
		];

		expect(ScoreboardAttribution.rowUserIds(games).at(-1)).toEqual(
			seatsOf(RESHUFFLED_SETS[2]!),
		);
	});

	test("places the row of a name whose player sat the game out only by elimination", () => {
		const games = [
			...RESHUFFLED_SETS.flatMap((set) => [gameOf(set), gameOf(set)]),
			gameOf({
				alpha: [9, 2, 3, 4],
				bravo: [5, 6, 7, 8],
				names: { ...NAMES, 9: NAMES[1]! },
			}),
		];

		expect(ScoreboardAttribution.rowUserIds(games).at(-1)).toEqual([
			4, 3, 2, 9, 8, 7, 6, 5,
		]);
	});

	test("anchors rows to the players' in-game names on the site", () => {
		const game = gameOf({
			alpha: [1, 2, 3, 4],
			bravo: [5, 6, 7, 8],
			inGameNames: { 1: "Sendou#2955", 2: "pee-liter#9771", 3: "± Acing#1669" },
		});

		const [result] = ScoreboardAttribution.rowUserIds([game]);

		expect(result).toEqual([4, 3, 2, 1, null, null, null, null]);
	});

	test("anchors rows to the players who reported the weapon only that row of their side played", () => {
		const game = gameOf({
			alpha: [1, 2, 3, 4],
			bravo: [5, 6, 7, 8],
			reportedWeapons: { 5: 50, 6: 60, 7: 70 },
		});

		const [result] = ScoreboardAttribution.rowUserIds([game]);

		expect(result).toEqual([null, null, null, null, 8, 7, 6, 5]);
	});

	test("a reported weapon two rows of the side played anchors nobody", () => {
		const game = gameOf({
			alpha: [1, 2, 3, 4],
			bravo: [5, 6, 7, 8],
			weapons: { 5: 50, 6: 50 },
			reportedWeapons: { 5: 50, 7: 70 },
		});

		const [result] = ScoreboardAttribution.rowUserIds([game]);

		expect(result!.slice(4)).toEqual([null, 7, null, null]);
	});

	test("keeps the POV seat's player", () => {
		const game = gameOf({ alpha: [1, 2, 3, 4], bravo: [5, 6, 7, 8] });
		game.rows[2]!.userId = 2;

		const [result] = ScoreboardAttribution.rowUserIds([game]);

		expect(result).toEqual([null, null, 2, null, null, null, null, null]);
	});
});

/** A game's scoreboard: alpha's rows then bravo's, each side's players in reverse. User x played weapon x * 10 unless given. */
function gameOf({
	alpha,
	bravo,
	names = NAMES,
	inGameNames = {},
	weapons = {},
	reportedWeapons = {},
}: {
	alpha: number[];
	bravo: number[];
	names?: Record<number, string>;
	inGameNames?: Record<number, string>;
	weapons?: Record<number, number>;
	reportedWeapons?: Record<number, number>;
}): ScoreboardAttribution.AttributionGame {
	const sides = [
		...alpha.map((userId) => ({ userId, side: "ALPHA" as LobbySide })),
		...bravo.map((userId) => ({ userId, side: "BRAVO" as LobbySide })),
	];
	const seats = seatsOf({ alpha, bravo }).map(
		(userId) => sides.find((player) => player.userId === userId)!,
	);

	return {
		rows: seats.map(({ userId, side }) => ({
			name: names[userId]!,
			side,
			weaponSplId: (weapons[userId] ?? userId * 10) as MainWeaponId,
		})),
		players: sides.map(({ userId, side }) => ({
			userId,
			side,
			inGameName: inGameNames[userId] ?? null,
			reportedWeaponSplId: (reportedWeapons[userId] ??
				null) as MainWeaponId | null,
		})),
	};
}

function seatsOf({ alpha, bravo }: { alpha: number[]; bravo: number[] }) {
	return [...alpha.toReversed(), ...bravo.toReversed()];
}
