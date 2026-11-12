import { describe, expect, test } from "vitest";
import type { TournamentSettings } from "~/db/tables-json";
import * as Engine from "../engine";
import type { BracketData } from "../engine/types";
import {
	matchesOfRound,
	playedOut,
	playedWhile,
	teamIds,
} from "../tests/bracket-fixtures";
import { testTournament } from "../tests/test-utils";
import type { BracketMapCounts } from "../toMapList";

const MAIN: TournamentSettings["bracketProgression"][number] = {
	type: "single_elimination",
	name: "Main",
	requiresCheckIn: false,
	settings: {},
};
const NO_THIRD_PLACE_MATCH = {
	skippedRounds: ["THIRD_PLACE_MATCH" as const],
};

describe("SingleEliminationBracket.defaultRoundBestOfs", () => {
	test.each([
		{ teamCount: 4, winners: [5, 5] },
		{ teamCount: 8, winners: [3, 5, 5] },
		{ teamCount: 16, winners: [3, 3, 5, 5] },
		{ teamCount: 32, winners: [3, 3, 5, 5, 5] },
	])(
		"plays the first rounds of $teamCount teams best of 3 and the rest from the semifinals or third round on best of 5",
		({ teamCount, winners }) => {
			const bracket = mainBracket(createdMain(teamCount));

			expect(
				bestOfsOfSection(bracket.defaultRoundBestOfs(bracket.data), "winners"),
			).toEqual(winners);
		},
	);

	test("plays the third place match best of 5", () => {
		const bracket = mainBracket(createdMain(16));

		expect(
			bestOfsOfSection(bracket.defaultRoundBestOfs(bracket.data), "finals"),
		).toEqual([5]);
	});
});

describe("SingleEliminationBracket.source", () => {
	test("does not source 3rd and 4th while the third place match is the last match left", () => {
		const data = createdMain(8);
		const thirdPlaceMatchId = matchesOfRound(data, "finals", 1)[0].id;
		const bracket = mainBracket(
			playedWhile(data, (match) => match.id !== thirdPlaceMatchId),
		);

		expect(bracket.source({ placements: [1, 2] }).relevantMatchesFinished).toBe(
			false,
		);
	});

	test("sources the third place match winner as 3rd once it is played", () => {
		const bracket = mainBracket(playedOut(createdMain(8)));

		expect(bracket.source({ placements: [3] })).toEqual({
			relevantMatchesFinished: true,
			teams: [3],
		});
	});

	test("with rest sources every team placed at or below the last listed placement", () => {
		const bracket = mainBracket(
			playedOut(createdMain(8, NO_THIRD_PLACE_MATCH)),
			NO_THIRD_PLACE_MATCH,
		);

		expect(
			bracket
				.source({ placements: [3], rest: true })
				.teams.toSorted((a, b) => a - b),
		).toEqual([3, 4, 5, 6, 7, 8]);
	});
});

describe("SingleEliminationBracket.standings", () => {
	test("keeps a grouped bracket's placements as is while teams are still playing", () => {
		const settings = { groupCount: 2 };
		const data = createdMain(16, settings);
		const firstRoundIds = new Set(
			data.round
				.filter((round) => round.section === "winners" && round.number === 1)
				.map((round) => round.id),
		);
		const bracket = mainBracket(
			playedWhile(data, (match) => firstRoundIds.has(match.roundId)),
			settings,
		);

		expect(bracket.standings.map((standing) => standing.placement)).toEqual(
			Array(8).fill(5),
		);
	});
});

describe("SingleEliminationBracket.matchExitDestinations", () => {
	const destinations = (
		names: string[],
		placements: number[][],
	): TournamentSettings["bracketProgression"] =>
		names.map((name, idx) => ({
			type: "single_elimination",
			name,
			requiresCheckIn: false,
			settings: {},
			sources: [{ bracketIdx: 0, placements: placements[idx] }],
		}));

	test("the final, the third place match and the first round send their teams to the brackets taking their placements", () => {
		const data = createdMain(8);
		const exits = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						MAIN,
						...destinations(
							["Champion", "Runner-up", "Bronze", "Fourth", "Underground"],
							[[1], [2], [3], [4], [-1]],
						),
					],
				},
			},
			data,
		})
			.bracketByIdx(0)!
			.matchExitDestinations();

		expect(exitsOfRound(exits, data, "winners", 3)).toEqual([
			{ winner: 1, loser: 2 },
		]);
		expect(exitsOfRound(exits, data, "finals", 1)).toEqual([
			{ winner: 3, loser: 4 },
		]);
		expect(exitsOfRound(exits, data, "winners", 2)).toEqual([
			undefined,
			undefined,
		]);
		expect(exitsOfRound(exits, data, "winners", 1)).toEqual(
			Array(4).fill({ winner: null, loser: 5 }),
		);
	});

	test("without a third place match the semifinal losers leave to the bracket taking 3rd", () => {
		const data = createdMain(8, NO_THIRD_PLACE_MATCH);
		const exits = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{ ...MAIN, settings: NO_THIRD_PLACE_MATCH },
						...destinations(["Bronze"], [[3]]),
					],
				},
			},
			data,
		})
			.bracketByIdx(0)!
			.matchExitDestinations();

		expect(exitsOfRound(exits, data, "winners", 2)).toEqual([
			{ winner: null, loser: 1 },
			{ winner: null, loser: 1 },
		]);
		expect(exitsOfRound(exits, data, "winners", 3)).toEqual([undefined]);
	});

	test("first round losers leave by their placement when no underground bracket takes them", () => {
		const data = createdMain(8);
		const exits = testTournament({
			ctx: {
				settings: {
					bracketProgression: [MAIN, ...destinations(["Fifth"], [[5]])],
				},
			},
			data,
		})
			.bracketByIdx(0)!
			.matchExitDestinations();

		expect(exitsOfRound(exits, data, "winners", 1)).toEqual(
			Array(4).fill({ winner: null, loser: 1 }),
		);
	});
});

function createdMain(
	teamCount: number,
	settings: TournamentSettings["bracketProgression"][number]["settings"] = {},
) {
	return Engine.create({
		type: "single_elimination",
		seeding: teamIds(teamCount),
		settings,
	});
}

function mainBracket(
	data: BracketData,
	settings: TournamentSettings["bracketProgression"][number]["settings"] = {},
) {
	return testTournament({
		ctx: { settings: { bracketProgression: [{ ...MAIN, settings }] } },
		data,
	}).bracketByIdx(0)!;
}

function bestOfsOfSection(
	counts: BracketMapCounts,
	section: "winners" | "finals",
) {
	return [...(counts.get(`0:${section}`)?.entries() ?? [])]
		.toSorted(([a], [b]) => a - b)
		.map(([, { count }]) => count);
}

function exitsOfRound(
	exits: ReturnType<ReturnType<typeof mainBracket>["matchExitDestinations"]>,
	data: BracketData,
	section: "winners" | "finals",
	number: number,
) {
	return matchesOfRound(data, section, number).map((match) =>
		exits.get(match.id),
	);
}
