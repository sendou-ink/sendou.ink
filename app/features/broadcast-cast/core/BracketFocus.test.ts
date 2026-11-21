import * as R from "remeda";
import { describe, expect, test } from "vitest";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import type {
	BroadcastBracketSidesFocus,
	BroadcastEliminationBracket,
} from "../broadcast-cast-types";
import * as BracketFocus from "./BracketFocus";

describe("BracketFocus.layout", () => {
	test("lays out both sides of a bracket not started yet with every round", () => {
		const bracket = layout({ data: doubleElimination(8) });

		expect(roundsOf(bracket)).toEqual({
			winners: [
				["WB Round 1", 4, "pairs"],
				["WB Semis", 2, "pairs"],
				["WB Finals", 1, "straight"],
				["Grand Finals", 1, "straight"],
				["Bracket Reset", 1, null],
			],
			losers: [
				["LB Round 1", 2, "straight"],
				["LB Round 2", 2, "pairs"],
				["LB Semis", 1, "straight"],
				["LB Finals", 1, null],
			],
		});
		expect(bracket.sides.map((side) => side.slotCount)).toEqual([4, 2]);
	});

	test("hides the rounds every match of which is over when focused on the remaining rounds", () => {
		const data = reportAll(doubleElimination(8), firstRoundIds);

		expect(roundNamesOf(layout({ data }))).toEqual({
			winners: ["WB Semis", "WB Finals", "Grand Finals", "Bracket Reset"],
			losers: ["LB Round 1", "LB Round 2", "LB Semis", "LB Finals"],
		});
		expect(
			roundNamesOf(layout({ data, focus: { winners: 0, losers: 0 } })).winners,
		).toContain("WB Round 1");
	});

	test("focuses each side on its own", () => {
		const data = reportAll(doubleElimination(8), firstRoundIds);

		expect(
			roundNamesOf(layout({ data, focus: { winners: 0, losers: 2 } })),
		).toEqual({
			winners: [
				"WB Round 1",
				"WB Semis",
				"WB Finals",
				"Grand Finals",
				"Bracket Reset",
			],
			losers: ["LB Semis", "LB Finals"],
		});
	});

	test("skips the rounds before the one focused on, finished or not", () => {
		const data = reportAll(
			reportAll(doubleElimination(8), firstRoundIds),
			secondRoundIds,
		);

		expect(
			roundsOf(layout({ data, focus: { winners: 1, losers: "hidden" } })),
		).toEqual({
			winners: [
				["WB Semis", 2, "pairs"],
				["WB Finals", 1, "straight"],
				["Grand Finals", 1, "straight"],
				["Bracket Reset", 1, null],
			],
		});
		expect(
			layout({
				data,
				focus: { winners: 1, losers: "hidden" },
			}).sides[0].rounds[0].matches.every((match) => !match?.isFed),
		).toBe(true);
	});

	test("shows the last round of a side focused on a round past its end", () => {
		expect(
			roundNamesOf(
				layout({
					data: doubleElimination(8),
					focus: { winners: "hidden", losers: 99 },
				}),
			),
		).toEqual({ losers: ["LB Finals"] });
	});

	test.each<{ focus: BroadcastBracketSidesFocus; sides: string[] }>([
		{
			focus: { winners: "remaining", losers: "remaining" },
			sides: ["winners", "losers"],
		},
		{ focus: { winners: 0, losers: "hidden" }, sides: ["winners"] },
		{ focus: { winners: "hidden", losers: "remaining" }, sides: ["losers"] },
	])("shows the sides not hidden: $sides", ({ focus, sides }) => {
		expect(
			layout({ data: doubleElimination(8), focus }).sides.map(
				(side) => side.type,
			),
		).toEqual(sides);
	});

	test.each<{ focus: BroadcastBracketSidesFocus }>([
		{ focus: { winners: "remaining", losers: "remaining" } },
		{ focus: { winners: "hidden", losers: "remaining" } },
	])(
		"lays out single elimination as one side with winners $focus.winners",
		({ focus }) => {
			const bracket = layout({
				type: "single_elimination",
				data: Engine.create({
					type: "single_elimination",
					seeding: R.range(1, 9),
					settings: {},
				}),
				focus,
			});

			expect(roundsOf(bracket)).toEqual({
				winners: [
					["Round 1", 4, "pairs"],
					["Semis", 2, "pairs"],
					["Finals", 1, null],
					["3rd place match", 1, null],
				],
			});
			expect(
				bracket.sides[0].rounds.at(-1)?.matches.every((match) => !match?.isFed),
			).toBe(true);
		},
	);

	test("keeps byes as empty slots that feed nothing", () => {
		const bracket = layout({ data: doubleElimination(7) });
		const [firstRound, secondRound] = bracket.sides[0].rounds;

		expect(firstRound.matches.filter((match) => match === null)).toHaveLength(
			1,
		);
		expect(secondRound.matches.map((match) => match?.isFed)).toEqual([
			true,
			true,
		]);
		expect(firstRound.matches.every((match) => !match?.isFed)).toBe(true);
	});

	test("shows the featured match's result only once the view has the set over", () => {
		const data = doubleElimination(4);
		const featuredMatchId = firstRoundIds(data)[0];
		const reported = report(data, featuredMatchId);
		const winnerId = teamIdsOf(reported, featuredMatchId)[0];

		const live = layout({
			data: reported,
			featured: {
				id: featuredMatchId,
				progress: { resultCount: 1, scores: [1, 0], isOver: false },
			},
		});
		expect(matchOf(live, featuredMatchId)).toMatchObject({
			scores: [1, 0],
			winner: null,
			isFeatured: true,
		});
		expect(teamIdsShown(live, featuredMatchId)).not.toContain(winnerId);

		const over = layout({
			data: reported,
			featured: {
				id: featuredMatchId,
				progress: { resultCount: 2, scores: [2, 0], isOver: true },
			},
		});
		expect(matchOf(over, featuredMatchId)?.winner).toBe(0);
		expect(teamIdsShown(over, featuredMatchId)).toContain(winnerId);
	});

	test("shows no scores for a featured match not started on air", () => {
		const data = doubleElimination(4);
		const featuredMatchId = firstRoundIds(data)[0];

		const bracket = layout({
			data: report(data, featuredMatchId),
			featured: {
				id: featuredMatchId,
				progress: { resultCount: 0, scores: [0, 0], isOver: false },
			},
		});

		expect(matchOf(bracket, featuredMatchId)?.scores).toBeNull();
	});
});

describe("BracketFocus.sideRoundNames", () => {
	test("names the rounds of a side in order", () => {
		const data = doubleElimination(8);

		expect(
			BracketFocus.sideRoundNames({
				type: "double_elimination",
				side: "losers",
				data,
				groupId: data.group[0]?.id,
			}),
		).toEqual(["LB Round 1", "LB Round 2", "LB Semis", "LB Finals"]);
	});
});

describe("BracketFocus.resolveBracketIdx", () => {
	test.each([
		{
			why: "the producer's pick",
			args: { pickedIdx: 1, featuredMatchBracketIdx: 2 },
			expected: 1,
		},
		{
			why: "the featured match's bracket without a pick",
			args: { pickedIdx: null, featuredMatchBracketIdx: 2 },
			expected: 2,
		},
		{
			why: "the featured match's bracket when the pick can't be shown",
			args: { pickedIdx: 0, featuredMatchBracketIdx: 2 },
			expected: 2,
		},
		{
			why: "the last bracket when neither can be shown",
			args: { pickedIdx: 0, featuredMatchBracketIdx: null },
			expected: 3,
		},
	])("resolves to $why", ({ args, expected }) => {
		expect(
			BracketFocus.resolveBracketIdx({ ...args, showableIdxs: [1, 2, 3] }),
		).toBe(expected);
	});

	test("resolves to nothing without a bracket to show", () => {
		expect(
			BracketFocus.resolveBracketIdx({
				pickedIdx: 0,
				featuredMatchBracketIdx: 0,
				showableIdxs: [],
			}),
		).toBeNull();
	});
});

function doubleElimination(teamCount: number) {
	return Engine.create({
		type: "double_elimination",
		seeding: R.range(1, teamCount + 1),
		settings: {},
	});
}

function layout({
	type = "double_elimination",
	data,
	focus = { winners: "remaining", losers: "remaining" },
	featured = null,
}: {
	type?: Parameters<typeof BracketFocus.layout>[0]["type"];
	data: BracketData;
	focus?: BroadcastBracketSidesFocus;
	featured?: Parameters<typeof BracketFocus.layout>[0]["featured"];
}) {
	return BracketFocus.layout({
		idx: 0,
		name: "Main bracket",
		type,
		data,
		groupId: data.group[0]?.id,
		focus,
		featured,
		teamById: (id) => ({ id, name: `Team ${id}`, logoUrl: null, seed: id }),
	});
}

function firstRoundIds(data: BracketData) {
	const firstRound = data.round.find(
		(round) => round.section === "winners" && round.number === 1,
	);

	return data.match
		.filter(
			(match) =>
				match.roundId === firstRound?.id && match.opponent1 && match.opponent2,
		)
		.map((match) => match.id);
}

function secondRoundIds(data: BracketData) {
	const secondRound = data.round.find(
		(round) => round.section === "winners" && round.number === 2,
	);

	return data.match
		.filter((match) => match.roundId === secondRound?.id)
		.map((match) => match.id);
}

function report(data: BracketData, matchId: number) {
	return Engine.reportResult(data, {
		matchId,
		scores: [2, 0],
		winnerSide: "opponent1",
	}).data;
}

function reportAll(
	data: BracketData,
	matchIds: (data: BracketData) => number[],
) {
	return matchIds(data).reduce(report, data);
}

function teamIdsOf(data: BracketData, matchId: number) {
	const match = data.match.find((candidate) => candidate.id === matchId);

	return [match?.opponent1?.id, match?.opponent2?.id];
}

function matchesOf(bracket: BroadcastEliminationBracket) {
	return bracket.sides.flatMap((side) =>
		side.rounds.flatMap((round) => round.matches),
	);
}

function matchOf(bracket: BroadcastEliminationBracket, matchId: number) {
	return matchesOf(bracket).find((match) => match?.id === matchId);
}

function teamIdsShown(
	bracket: BroadcastEliminationBracket,
	exceptMatchId: number,
) {
	return matchesOf(bracket)
		.filter((match) => match?.id !== exceptMatchId)
		.flatMap((match) =>
			(match?.teams ?? []).flatMap((team) => (team ? [team.id] : [])),
		);
}

function roundsOf(bracket: BroadcastEliminationBracket) {
	return Object.fromEntries(
		bracket.sides.map((side) => [
			side.type,
			side.rounds.map((round) => [
				round.name,
				round.matches.length,
				round.connector,
			]),
		]),
	);
}

function roundNamesOf(bracket: BroadcastEliminationBracket) {
	return Object.fromEntries(
		bracket.sides.map((side) => [
			side.type,
			side.rounds.map((round) => round.name),
		]),
	);
}
