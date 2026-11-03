import { describe, expect, test } from "vitest";
import * as Leaderboard from "./Leaderboard";
import { setOf } from "./tests/fixtures";

describe("Leaderboard.rows", () => {
	test("counts sets and maps of finished sets only", () => {
		const rows = Leaderboard.rows({
			sets: [
				setOf({ winners: ["ALPHA", "BRAVO", "ALPHA"], confirmed: true }),
				setOf({ winners: ["BRAVO", "BRAVO"] }),
			],
			weapons: [],
		});

		expect(rows.find((row) => row.userId === 1)).toMatchObject({
			setWins: 1,
			setLosses: 0,
			mapWins: 2,
			mapLosses: 1,
			mapWinPercentage: 67,
		});
		expect(rows.find((row) => row.userId === 5)).toMatchObject({
			setWins: 0,
			setLosses: 1,
		});
	});

	test("a forfeit is a set win for the other side, the maps played counting as reported", () => {
		const rows = Leaderboard.rows({
			sets: [setOf({ winners: ["ALPHA"], forfeitingSide: "ALPHA" })],
			weapons: [],
		});

		expect(rows.find((row) => row.userId === 1)).toMatchObject({
			setWins: 0,
			setLosses: 1,
			mapWins: 1,
			mapLosses: 0,
		});
		expect(rows.find((row) => row.userId === 5)).toMatchObject({
			setWins: 1,
			setLosses: 0,
			mapWins: 0,
			mapLosses: 1,
		});
	});

	test("sorts by set wins, then map win percentage", () => {
		const rows = Leaderboard.rows({
			sets: [
				setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true }),
				setOf({
					winners: ["ALPHA", "BRAVO", "ALPHA"],
					confirmed: true,
					alpha: [5, 6, 7, 8],
					bravo: [1, 2, 3, 4],
				}),
			],
			weapons: [],
		});

		expect(rows.map((row) => row.userId).slice(0, 4)).toEqual([1, 2, 3, 4]);
	});

	test("players with the same record share the placement", () => {
		const rows = Leaderboard.rows({
			sets: [
				setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true }),
				setOf({
					winners: ["ALPHA", "BRAVO", "ALPHA"],
					confirmed: true,
					alpha: [1, 2, 5, 6],
					bravo: [3, 4, 7, 8],
				}),
			],
			weapons: [],
		});

		expect(
			rows.map((row) => [row.userId, row.placement]).sort(([a], [b]) => a - b),
		).toEqual([
			[1, 1],
			[2, 1],
			[3, 3],
			[4, 3],
			[5, 5],
			[6, 5],
			[7, 7],
			[8, 7],
		]);
	});

	test("lists weapons most played first", () => {
		const rows = Leaderboard.rows({
			sets: [setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true })],
			weapons: [
				{ userId: 1, weaponSplId: 40 },
				{ userId: 1, weaponSplId: 10 },
				{ userId: 1, weaponSplId: 10 },
			],
		});

		expect(rows.find((row) => row.userId === 1)?.weaponSplIds).toEqual([
			10, 40,
		]);
	});

	test("room members get a row before the first set is over", () => {
		const rows = Leaderboard.rows({
			sets: [setOf({ winners: ["ALPHA"] })],
			weapons: [],
			roomMemberIds: [1, 20],
		});

		expect(rows.map((row) => row.userId)).toEqual([1, 20]);
		expect(rows[0]).toMatchObject({
			setWins: 0,
			setLosses: 0,
			mapWinPercentage: null,
		});
	});

	test("room members without a finished set are left out once a set is over", () => {
		const rows = Leaderboard.rows({
			sets: [setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true })],
			weapons: [],
			roomMemberIds: [1, 20],
		});

		expect(rows.some((row) => row.userId === 20)).toBe(false);
		expect(rows.filter((row) => row.userId === 1)).toHaveLength(1);
	});

	test("sitting out isn't playing", () => {
		const rows = Leaderboard.rows({
			sets: [
				setOf({
					winners: ["ALPHA", "ALPHA"],
					confirmed: true,
					sittingOut: [9],
				}),
			],
			weapons: [],
		});

		expect(rows.some((row) => row.userId === 9)).toBe(false);
	});
});

describe("Leaderboard.headToHead", () => {
	test("sums the sets and maps of every pair on opposite sides", () => {
		const records = Leaderboard.headToHead([
			setOf({ winners: ["ALPHA", "BRAVO", "ALPHA"], confirmed: true }),
			setOf({
				winners: ["BRAVO", "BRAVO"],
				confirmed: true,
				alpha: [1, 2, 7, 8],
				bravo: [3, 4, 5, 6],
			}),
		]);

		expect(records[1][5]).toEqual({
			setWins: 1,
			setLosses: 1,
			mapWins: 2,
			mapLosses: 3,
		});
		expect(records[5][1]).toEqual({
			setWins: 1,
			setLosses: 1,
			mapWins: 3,
			mapLosses: 2,
		});
		expect(records[1][7]).toEqual({
			setWins: 1,
			setLosses: 0,
			mapWins: 2,
			mapLosses: 1,
		});
	});

	test("a forfeit is a set win for the other side, the maps played counting as reported", () => {
		const records = Leaderboard.headToHead([
			setOf({ winners: ["ALPHA"], forfeitingSide: "ALPHA" }),
		]);

		expect(records[1][5]).toEqual({
			setWins: 0,
			setLosses: 1,
			mapWins: 1,
			mapLosses: 0,
		});
		expect(records[5][1]).toEqual({
			setWins: 1,
			setLosses: 0,
			mapWins: 0,
			mapLosses: 1,
		});
	});

	test("teammates and players sitting out have no record against each other", () => {
		const records = Leaderboard.headToHead([
			setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true, sittingOut: [9] }),
		]);

		expect(records[1][2]).toBeUndefined();
		expect(records[1][9]).toBeUndefined();
		expect(records[9]).toBeUndefined();
	});

	test("unfinished sets don't count", () => {
		const records = Leaderboard.headToHead([
			setOf({ winners: ["ALPHA", "ALPHA"] }),
		]);

		expect(records).toEqual({});
	});
});
