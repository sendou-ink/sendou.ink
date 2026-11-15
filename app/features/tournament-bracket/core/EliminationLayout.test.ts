import * as R from "remeda";
import { describe, expect, test } from "vitest";
import * as EliminationLayout from "./EliminationLayout";
import * as Engine from "./engine";
import type { BracketData } from "./engine/types";
import { getRounds } from "./rounds";

describe("EliminationLayout.resolve", () => {
	test("hides the rounds with no match left to play when compactified", () => {
		const data = reportFirstRound(singleElimination(16));
		const rounds = getRounds({ type: "single", bracketData: data });

		const { hiddenRoundIds } = EliminationLayout.resolve({
			rounds,
			bracketData: data,
			isCompactified: true,
		});

		expect(roundNames(rounds, hiddenRoundIds)).toEqual(["Round 1"]);
	});

	test("keeps the last two rounds even when they are over", () => {
		const data = singleElimination(2);
		const [match] = data.match;
		const reported = Engine.reportResult(data, {
			matchId: match.id,
			scores: [2, 0],
			winnerSide: "opponent1",
		}).data;
		const rounds = getRounds({ type: "single", bracketData: reported });

		const { hiddenRoundIds } = EliminationLayout.resolve({
			rounds,
			bracketData: reported,
			isCompactified: true,
		});

		expect(hiddenRoundIds.size).toBe(0);
	});

	test("hides nothing when not compactified", () => {
		const data = reportFirstRound(singleElimination(16));

		const { hiddenRoundIds } = EliminationLayout.resolve({
			rounds: getRounds({ type: "single", bracketData: data }),
			bracketData: data,
			isCompactified: false,
		});

		expect(hiddenRoundIds.size).toBe(0);
	});

	test.each([
		{ teamCount: 5, isCompacted: true },
		{ teamCount: 6, isCompacted: true },
		{ teamCount: 7, isCompacted: false },
		{ teamCount: 8, isCompacted: false },
	])(
		"compacts a first round of at most one played match per pair ($teamCount teams: $isCompacted)",
		({ teamCount, isCompacted }) => {
			const data = singleElimination(teamCount);
			const rounds = getRounds({ type: "single", bracketData: data });

			const { compactedFirstRoundId } = EliminationLayout.resolve({
				rounds,
				bracketData: data,
				isCompactified: true,
			});

			expect(compactedFirstRoundId).toBe(isCompacted ? rounds[0].id : null);
		},
	);
});

describe("EliminationLayout.matchesOfRound", () => {
	test("gives the played match of each pair of a compacted round", () => {
		const data = singleElimination(6);
		const [firstRound] = getRounds({ type: "single", bracketData: data });

		const matches = EliminationLayout.matchesOfRound({
			roundId: firstRound.id,
			bracketData: data,
			compactedFirstRoundId: firstRound.id,
		});

		expect(matches).toHaveLength(2);
		expect(matches.every((match) => match.opponent1 && match.opponent2)).toBe(
			true,
		);
	});
});

function singleElimination(teamCount: number) {
	return Engine.create({
		type: "single_elimination",
		seeding: R.range(1, teamCount + 1),
		settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
	});
}

function reportFirstRound(data: BracketData) {
	const firstRoundId = data.round.find((round) => round.number === 1)?.id;

	return data.match
		.filter((match) => match.roundId === firstRoundId)
		.reduce(
			(reported, match) =>
				Engine.reportResult(reported, {
					matchId: match.id,
					scores: [2, 0],
					winnerSide: "opponent1",
				}).data,
			data,
		);
}

function roundNames(
	rounds: ReturnType<typeof getRounds>,
	roundIds: Set<number>,
) {
	return rounds
		.filter((round) => roundIds.has(round.id))
		.map((round) => round.name);
}
