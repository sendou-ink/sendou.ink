import { describe, expect, test } from "vitest";
import { createResolved } from "../create";
import * as Engine from "../index";
import type { BracketData } from "../types";

const BRACKETS = [
	{ type: "single_elimination" as const, settings: {}, outcomes: ["WINNER"] },
	{
		type: "single_elimination" as const,
		settings: { consolationFinal: true },
		outcomes: ["LOSER", "WINNER"],
	},
	{
		type: "double_elimination" as const,
		settings: {},
		outcomes: ["LOSER", "WINNER"],
	},
];

describe("feederMatchesByMatchId", () => {
	test.each(BRACKETS)(
		"names the side each team of a $type bracket comes to",
		({ type, settings }) => {
			const initial = createResolved({
				type,
				seeding: [1, 2, 3, 4, 5, 6, 7, 8],
				settings,
			});
			const feeders = Engine.feederMatchesByMatchId(initial);

			const played = playAll(initial);

			expect(feeders.size).toBeGreaterThan(0);
			for (const [fedMatchId, matchFeeders] of feeders) {
				const fed = matchById(played, fedMatchId);
				for (const feeder of matchFeeders) {
					const feederMatch = matchById(played, feeder.matchId);
					const winnerIsOpponent1 = feederMatch.winnerSide === "opponent1";
					const [winner, loser] = winnerIsOpponent1
						? [feederMatch.opponent1?.id, feederMatch.opponent2?.id]
						: [feederMatch.opponent2?.id, feederMatch.opponent1?.id];

					expect(fed[feeder.side]?.id).toBe(
						feeder.outcome === "WINNER" ? winner : loser,
					);
				}
			}
		},
	);

	test.each(BRACKETS)(
		"gives every side of a $type bracket not known at the start a feeder",
		({ type, settings, outcomes }) => {
			const data = createResolved({
				type,
				seeding: [1, 2, 3, 4, 5, 6, 7, 8],
				settings,
			});
			const feeders = Engine.feederMatchesByMatchId(data);

			const sidesToFeed = data.match.flatMap((match) => {
				if (isBracketReset(data, match.roundId)) return [];

				return (["opponent1", "opponent2"] as const)
					.filter((side) => match[side]?.id === null)
					.map((side) => `${match.id}-${side}`);
			});
			const fedSides = [...feeders].flatMap(([fedMatchId, matchFeeders]) =>
				matchFeeders.map((feeder) => `${fedMatchId}-${feeder.side}`),
			);
			const feederOutcomes = new Set(
				[...feeders.values()].flat().map((feeder) => feeder.outcome),
			);

			expect(sidesToFeed.length).toBeGreaterThan(0);
			expect(fedSides.toSorted(byText)).toEqual(sidesToFeed.toSorted(byText));
			expect([...feederOutcomes].toSorted(byText)).toEqual(outcomes);
		},
	);
});

/**
 * Reports every match, won by opponent1 or opponent2 by match id so that a winner and loser mix-up shows. Grand
 * finals are won by the winners bracket side, so there's no reset.
 */
function playAll(initial: BracketData) {
	let data = initial;

	while (true) {
		const playable = data.match.find(
			(match) =>
				typeof match.opponent1?.id === "number" &&
				typeof match.opponent2?.id === "number" &&
				!match.winnerSide,
		);
		if (!playable) return data;

		const isGrandFinals = data.round.some(
			(round) => round.id === playable.roundId && round.section === "finals",
		);
		const winnerSide =
			isGrandFinals || playable.id % 2 === 0 ? "opponent1" : "opponent2";

		data = Engine.reportResult(data, {
			matchId: playable.id,
			scores: winnerSide === "opponent1" ? [1, 0] : [0, 1],
			winnerSide,
		}).data;
	}
}

function byText(a: string, b: string) {
	return a.localeCompare(b);
}

function isBracketReset(data: BracketData, roundId: number) {
	const round = data.round.find((candidate) => candidate.id === roundId);

	return round?.section === "finals" && round.number === 2;
}

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
