import { describe, expect, test } from "vitest";
import * as Engine from "~/features/tournament-bracket/core/engine";
import {
	byRound,
	teamIds,
} from "~/features/tournament-bracket/core/tests/bracket-fixtures";
import {
	mergeStages,
	progressions,
	testTournament,
} from "~/features/tournament-bracket/core/tests/test-utils";
import * as PlayOrder from "./PlayOrder";

const DOUBLE_ELIMINATION_PROGRESSION = [
	{
		name: "Main Bracket",
		type: "double_elimination",
		requiresCheckIn: false,
		settings: {},
	},
] as const;

const ROUND_ROBIN_PROGRESSION = [
	{
		name: "Main Bracket",
		type: "round_robin",
		requiresCheckIn: false,
		settings: {},
	},
] as const;

const doubleElimination = () => {
	const data = Engine.create({
		type: "double_elimination",
		seeding: teamIds(8),
		settings: null,
	});

	return {
		data,
		tournament: testTournament({
			data,
			ctx: {
				settings: { bracketProgression: [...DOUBLE_ELIMINATION_PROGRESSION] },
			},
		}),
	};
};

/** Two groups of four. */
const roundRobin = () => {
	const data = Engine.create({
		type: "round_robin",
		seeding: teamIds(8),
		settings: null,
	});

	return {
		data,
		tournament: testTournament({
			data,
			ctx: { settings: { bracketProgression: [...ROUND_ROBIN_PROGRESSION] } },
		}),
	};
};

const depthsOf = (tournament: ReturnType<typeof testTournament>) =>
	new Map(
		Array.from(PlayOrder.byMatchId(tournament)).map(([matchId, position]) => [
			matchId,
			position.depth,
		]),
	);

const matchIdsInPlayOrder = (tournament: ReturnType<typeof testTournament>) =>
	Array.from(PlayOrder.byMatchId(tournament))
		.toSorted(([, a], [, b]) => a.rank - b.rank)
		.map(([matchId]) => matchId);

describe("PlayOrder.byMatchId", () => {
	test("gives elimination matches the longest chain of matches feeding them", () => {
		const { data, tournament } = doubleElimination();

		expect(byRound(depthsOf(tournament), data)).toEqual({
			"winners 1": [0, 0, 0, 0],
			"winners 2": [1, 1],
			"winners 3": [2],
			"losers 1": [1, 1],
			"losers 2": [2, 2],
			"losers 3": [3],
			"losers 4": [4],
			"finals 1": [5],
			"finals 2": [6],
		});
	});

	test("orders winners before losers of the same depth, then by match number", () => {
		const { data, tournament } = doubleElimination();
		const roundOf = (matchId: number) => {
			const match = data.match.find((candidate) => candidate.id === matchId)!;
			const round = data.round.find(
				(candidate) => candidate.id === match.roundId,
			)!;

			return `${round.section} ${round.number}.${match.number}`;
		};

		expect(matchIdsInPlayOrder(tournament).slice(0, 8).map(roundOf)).toEqual([
			"winners 1.1",
			"winners 1.2",
			"winners 1.3",
			"winners 1.4",
			"winners 2.1",
			"winners 2.2",
			"losers 1.1",
			"losers 1.2",
		]);
	});

	test("gives round robin matches their round", () => {
		const { data, tournament } = roundRobin();

		expect(byRound(depthsOf(tournament), data)).toEqual({
			"null 1": [0, 0, 0, 0],
			"null 2": [1, 1, 1, 1],
			"null 3": [2, 2, 2, 2],
		});
	});

	test("takes turns between groups in the same round", () => {
		const { data, tournament } = roundRobin();
		const [firstGroup, secondGroup] = data.group.map((group) => group.id);
		const firstRoundOf = (groupId: number) =>
			data.match
				.filter(
					(match) =>
						match.groupId === groupId &&
						data.round.find((round) => round.id === match.roundId)?.number ===
							1,
				)
				.map((match) => match.id);

		expect(matchIdsInPlayOrder(tournament).slice(0, 4)).toEqual([
			firstRoundOf(firstGroup)[0],
			firstRoundOf(secondGroup)[0],
			firstRoundOf(firstGroup)[1],
			firstRoundOf(secondGroup)[1],
		]);
	});

	test("continues a bracket after the deepest match of the bracket feeding it", () => {
		const groups = Engine.create({
			type: "round_robin",
			seeding: teamIds(4),
			settings: null,
		});
		const topCut = Engine.create({
			type: "single_elimination",
			seeding: [1, 2],
			settings: null,
		});
		const data = mergeStages(groups, topCut);
		const tournament = testTournament({
			data,
			ctx: {
				settings: {
					bracketProgression: progressions.roundRobinToSingleElimination,
				},
			},
		});
		const topCutMatchId = data.match.at(-1)!.id;

		expect(PlayOrder.byMatchId(tournament).get(topCutMatchId)).toEqual({
			depth: 3,
			rank: data.match.length - 1,
		});
	});

	test("continues a bracket fed by several brackets after the deepest of them", () => {
		const groups = Engine.create({
			type: "round_robin",
			seeding: teamIds(4),
			settings: null,
		});
		const redemption = Engine.create({
			type: "single_elimination",
			seeding: [3, 4],
			settings: null,
		});
		const topCut = Engine.create({
			type: "single_elimination",
			seeding: [1, 3],
			settings: null,
		});
		const data = mergeStages(groups, redemption, topCut);
		const tournament = testTournament({
			data,
			ctx: {
				settings: {
					bracketProgression: [
						...progressions.multiSourceTopCut.slice(0, 2),
						{
							...progressions.multiSourceTopCut[2],
							sources: [
								{ bracketIdx: 0, placements: [1] },
								{ bracketIdx: 1, placements: [1] },
							],
						},
					],
				},
			},
		});
		const topCutMatchId = data.match.at(-1)!.id;

		// groups: depths 0-2, redemption: 3, top cut after redemption
		expect(PlayOrder.byMatchId(tournament).get(topCutMatchId)?.depth).toBe(4);
	});
});
