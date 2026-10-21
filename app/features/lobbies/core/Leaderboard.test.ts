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

	test("room members without a finished set are listed last", () => {
		const rows = Leaderboard.rows({
			sets: [setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true })],
			weapons: [],
			roomMemberIds: [1, 20],
		});

		expect(rows.at(-1)).toMatchObject({
			userId: 20,
			setWins: 0,
			setLosses: 0,
			mapWinPercentage: null,
		});
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
