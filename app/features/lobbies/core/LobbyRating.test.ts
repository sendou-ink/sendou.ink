import { ordinal } from "openskill";
import { describe, expect, test } from "vitest";
import * as LobbyRating from "./LobbyRating";
import { setOf } from "./tests/fixtures";

const ordinalOf = (
	ratings: ReturnType<typeof LobbyRating.ratings>,
	userId: number,
) => ordinal(LobbyRating.ratingOf(ratings, userId));

describe("LobbyRating.ratings", () => {
	test("everyone starts equal", () => {
		const ratings = LobbyRating.ratings([]);

		expect(ordinalOf(ratings, 1)).toBe(ordinalOf(ratings, 5));
	});

	test("winners go up and losers down", () => {
		const ratings = LobbyRating.ratings([
			setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true }),
		]);

		expect(ordinalOf(ratings, 1)).toBeGreaterThan(0);
		expect(ordinalOf(ratings, 5)).toBeLessThan(ordinalOf(ratings, 1));
	});

	test("ignores sets not yet confirmed", () => {
		const ratings = LobbyRating.ratings([
			setOf({ winners: ["ALPHA", "ALPHA"] }),
		]);

		expect(ratings.size).toBe(0);
	});

	test("winning 2-1 counts as 3 wins and 1 loss", () => {
		const twoOne = LobbyRating.ratings([
			setOf({ winners: ["ALPHA", "BRAVO", "ALPHA"], confirmed: true }),
		]);
		// the same map results in order, the set win being the last "map"
		const threeWinsOneLoss = LobbyRating.ratings([
			setOf({
				winners: ["ALPHA", "BRAVO", "ALPHA", "ALPHA"],
				bestOf: 9,
				confirmed: true,
			}),
		]);

		expect(ordinalOf(twoOne, 1)).toBeCloseTo(ordinalOf(threeWinsOneLoss, 1));
		expect(ordinalOf(twoOne, 5)).toBeCloseTo(ordinalOf(threeWinsOneLoss, 5));
	});

	test("a forfeit rates the maps played and the set win of the side that stayed", () => {
		const ratings = LobbyRating.ratings([
			setOf({ winners: ["ALPHA"], forfeitingSide: "ALPHA" }),
		]);
		const alphaOnly = LobbyRating.ratings([
			setOf({ winners: ["ALPHA"], bestOf: 1, confirmed: true }),
		]);

		// 1 map win and a set loss ends up level-ish, below a clean map + set win
		expect(ordinalOf(ratings, 1)).toBeLessThan(ordinalOf(alphaOnly, 1));
		expect(ordinalOf(ratings, 5)).toBeGreaterThan(ordinalOf(alphaOnly, 5));
	});

	test("players sitting out aren't rated", () => {
		const ratings = LobbyRating.ratings([
			setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true, sittingOut: [9] }),
		]);

		expect(ratings.has(9)).toBe(false);
	});
});

describe("LobbyRating.winProbability", () => {
	test("equal teams are a coin flip", () => {
		const ratings = LobbyRating.ratings([]);
		const team = [1, 2, 3, 4].map((id) => LobbyRating.ratingOf(ratings, id));

		expect(LobbyRating.winProbability(team, team)).toBeCloseTo(0.5);
	});

	test("the team that won before is favored", () => {
		const ratings = LobbyRating.ratings([
			setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true }),
		]);
		const alpha = [1, 2, 3, 4].map((id) => LobbyRating.ratingOf(ratings, id));
		const bravo = [5, 6, 7, 8].map((id) => LobbyRating.ratingOf(ratings, id));

		expect(LobbyRating.winProbability(alpha, bravo)).toBeGreaterThan(0.5);
	});
});
