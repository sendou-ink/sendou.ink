import { addDays, subDays } from "date-fns";
import { describe, expect, test } from "vitest";
import type { TournamentSettings } from "~/db/tables-json";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as Engine from "../engine";
import type { BracketData } from "../engine/types";
import { Tournament } from "../Tournament";
import {
	matchesOfRound,
	playedOut,
	playedWhile,
	reportWinner,
	teamIds,
} from "../tests/bracket-fixtures";
import {
	testTournament,
	testTournamentData,
	tournamentCtxTeam,
} from "../tests/test-utils";

type ProgressionBracket = TournamentSettings["bracketProgression"][number];

const SINGLE_ELIMINATION: ProgressionBracket = {
	type: "single_elimination",
	name: "Main",
	requiresCheckIn: false,
	settings: {},
};
const TOP_CUT: ProgressionBracket = {
	type: "single_elimination",
	name: "Top Cut",
	requiresCheckIn: false,
	settings: {},
	sources: [{ bracketIdx: 0, placements: [1, 2] }],
};

describe("Bracket.canBeStarted", () => {
	const notStartedTournament = ({
		teamCount = 4,
		startsAt = subDays(new Date(), 1),
		bracketStartTime,
	}: {
		teamCount?: number;
		startsAt?: Date;
		bracketStartTime?: Date;
	}) =>
		testTournament({
			ctx: {
				startsAt: dateToDatabaseTimestamp(startsAt),
				settings: {
					bracketProgression: [
						{
							...SINGLE_ELIMINATION,
							startTime: bracketStartTime
								? dateToDatabaseTimestamp(bracketStartTime)
								: undefined,
						},
					],
				},
				teams: teamIds(teamCount).map((id) => tournamentCtxTeam(id)),
			},
		}).bracketByIdx(0)!;

	test("a starting bracket can be started once check-in has ended", () => {
		expect(notStartedTournament({}).canBeStarted).toBe(true);
	});

	test("a starting bracket can't be started before check-in has ended", () => {
		expect(
			notStartedTournament({ startsAt: addDays(new Date(), 1) }).canBeStarted,
		).toBe(false);
	});

	test("a bracket with fewer than two teams can't be started", () => {
		expect(notStartedTournament({ teamCount: 1 }).canBeStarted).toBe(false);
	});

	test.each([
		{ why: "is yet to come", days: 1, expected: false },
		{ why: "has passed", days: -1, expected: true },
	])(
		"a bracket whose start time $why can be started: $expected",
		({ days, expected }) => {
			expect(
				notStartedTournament({ bracketStartTime: addDays(new Date(), days) })
					.canBeStarted,
			).toBe(expected);
		},
	);

	test.each([
		{ why: "has finished", mainPlayed: playedOut, expected: true },
		{
			why: "is still being played",
			mainPlayed: (data: BracketData) =>
				playedWhile(data, (match) => match.roundId === data.round[0].id),
			expected: false,
		},
	])(
		"a follow-up bracket whose source bracket $why can be started: $expected",
		({ mainPlayed, expected }) => {
			const tournament = testTournament({
				ctx: {
					settings: { bracketProgression: [SINGLE_ELIMINATION, TOP_CUT] },
				},
				data: mainPlayed(
					Engine.create({
						type: "single_elimination",
						seeding: teamIds(8),
						settings: {},
					}),
				),
			});

			expect(tournament.bracketByIdx(1)!.canBeStarted).toBe(expected);
		},
	);
});

describe("Bracket.isStartingBracket", () => {
	test.each([
		{ why: "without sources", sources: undefined, expected: true },
		{ why: "with empty sources", sources: [], expected: true },
		{
			why: "sourced from another bracket",
			sources: [{ bracketIdx: 0, placements: [1, 2] }],
			expected: false,
		},
	])(
		"a bracket $why is a starting bracket: $expected",
		({ sources, expected }) => {
			const tournament = testTournament({
				ctx: {
					settings: {
						bracketProgression: [SINGLE_ELIMINATION, { ...TOP_CUT, sources }],
					},
				},
			});

			expect(tournament.bracketByIdx(1)!.isStartingBracket).toBe(expected);
		},
	);
});

describe("Bracket.simulatedMatch", () => {
	const startedTournament = (
		type: "single_elimination" | "double_elimination",
		data: BracketData,
		ctx: Parameters<typeof testTournament>[0]["ctx"] = {},
	) =>
		testTournament({
			ctx: {
				settings: {
					bracketProgression: [{ ...SINGLE_ELIMINATION, type }],
				},
				...ctx,
			},
			data,
		});

	const createdBracket = (type: "single_elimination" | "double_elimination") =>
		Engine.create({ type, seeding: teamIds(8), settings: {} });

	test("projects the better seed of each unplayed match into the final", () => {
		const data = createdBracket("single_elimination");
		const bracket = startedTournament("single_elimination", data).bracketByIdx(
			0,
		)!;

		expect(projectedTeams(bracket.simulatedMatch(finalOf(data).id))).toEqual([
			1, 2,
		]);
	});

	test("projects a team that upset a better seed to keep winning as that seed", () => {
		const created = createdBracket("single_elimination");
		const upsetMatchId = matchesOfRound(created, "winners", 1).find(
			(match) => match.opponent1?.id === 1,
		)!.id;
		const data = playedWhile(
			created,
			(match) => match.id === upsetMatchId,
			[8],
		);
		const bracket = startedTournament("single_elimination", data).bracketByIdx(
			0,
		)!;
		const simulatedFinal = bracket.simulatedMatch(finalOf(data).id);

		expect(projectedTeams(simulatedFinal)).toEqual([8, 2]);
		expect(simulatedFinal?.winnerSide).toBe("opponent1");
	});

	test("projects the better seed upset in the winners bracket to win the losers bracket", () => {
		const created = createdBracket("double_elimination");
		const upsetMatchId = matchesOfRound(created, "winners", 1).find(
			(match) => match.opponent1?.id === 1,
		)!.id;
		const data = playedWhile(
			created,
			(match) => match.id === upsetMatchId,
			[8],
		);
		const bracket = startedTournament("double_elimination", data).bracketByIdx(
			0,
		)!;

		expect(
			projectedTeams(
				bracket.simulatedMatch(matchesOfRound(data, "finals", 1)[0].id),
			),
		).toEqual([8, 1]);
	});

	test("projects the better seeds to keep winning after the first rounds went as seeded", () => {
		const created = createdBracket("double_elimination");
		const firstRoundIds = new Set(
			[
				...matchesOfRound(created, "winners", 1),
				...matchesOfRound(created, "losers", 1),
			].map((match) => match.id),
		);
		const data = playedWhile(created, (match) => firstRoundIds.has(match.id));
		const bracket = startedTournament("double_elimination", data).bracketByIdx(
			0,
		)!;

		expect(
			projectedTeams(
				bracket.simulatedMatch(matchesOfRound(data, "finals", 1)[0].id),
			),
		).toEqual([1, 2]);
		expect(
			projectedTeams(
				bracket.simulatedMatch(matchesOfRound(data, "losers", 4)[0].id),
			),
		).toEqual([2, 3]);
	});

	test("projects the losers bracket team that won the grand finals as the better seed to also win the bracket reset", () => {
		// team 2 upsets team 1 in the winners final, team 1 comes back through the losers bracket
		let data = playedWhile(
			Engine.create({
				type: "double_elimination",
				seeding: teamIds(4),
				settings: {},
			}),
			(match, current) =>
				current.round.find((round) => round.id === match.roundId)?.section !==
				"finals",
			[2],
		);
		data = reportWinner(
			data,
			matchesOfRound(data, "finals", 1)[0].id,
			"opponent2",
		);
		const bracketResetId = matchesOfRound(data, "finals", 2)[0].id;
		const simulatedReset = startedTournament("double_elimination", data)
			.bracketByIdx(0)!
			.simulatedMatch(bracketResetId);

		expect(projectedTeams(simulatedReset)).toEqual([2, 1]);
		expect(simulatedReset?.winnerSide).toBe("opponent2");
	});

	test("projects nothing once the tournament is finalized", () => {
		const data = createdBracket("single_elimination");
		const bracket = startedTournament("single_elimination", data, {
			isFinalized: 1,
		}).bracketByIdx(0)!;

		expect(bracket.simulatedMatch(finalOf(data).id)).toBeUndefined();
	});

	test("projects nothing for a bracket that has not started", () => {
		const bracket = testTournament({
			ctx: {
				settings: { bracketProgression: [SINGLE_ELIMINATION] },
				teams: teamIds(8).map((id) => tournamentCtxTeam(id)),
			},
		}).bracketByIdx(0)!;
		const final = bracket.data.match.at(-2)!;

		expect(bracket.simulatedMatch(final.id)).toBeUndefined();
	});

	function finalOf(data: BracketData) {
		const lastWinnersRound = Math.max(
			...data.round
				.filter((round) => round.section === "winners")
				.map((round) => round.number),
		);

		return matchesOfRound(data, "winners", lastWinnersRound)[0];
	}

	function projectedTeams(
		match: ReturnType<
			ReturnType<typeof startedTournament>["brackets"][number]["simulatedMatch"]
		>,
	) {
		return [match?.opponent1?.id, match?.opponent2?.id];
	}
});

describe("Bracket.generateMatchesData", () => {
	test("a preview bracket with two teams already has its match", () => {
		const bracket = testTournament({
			ctx: {
				settings: { bracketProgression: [SINGLE_ELIMINATION] },
				teams: teamIds(2).map((id) => tournamentCtxTeam(id)),
			},
		}).bracketByIdx(0)!;

		expect(bracket.data.match).toHaveLength(1);
	});

	const roundRobinPreview = (teams: ReturnType<typeof tournamentCtxTeam>[]) =>
		testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "round_robin",
							name: "Groups",
							requiresCheckIn: false,
							settings: { hasAbDivisions: true, groupCount: 1 },
						},
					],
				},
				teams,
			},
		}).bracketByIdx(0)!;

	test("an A/B divisions round robin preview pairs only teams of different divisions", () => {
		const divisionOf = new Map([
			[1, 0],
			[2, 0],
			[3, 1],
			[4, 1],
		] as const);
		const bracket = roundRobinPreview(
			[...divisionOf].map(([id, abDivision]) =>
				tournamentCtxTeam(id, { abDivision }),
			),
		);

		expect(pairings(bracket.data)).toEqual(["1-3", "1-4", "2-3", "2-4"]);
	});

	test("an A/B divisions round robin preview alternates the divisions by seed while teams are unassigned", () => {
		const bracket = roundRobinPreview(
			teamIds(4).map((id) => tournamentCtxTeam(id)),
		);

		expect(pairings(bracket.data)).toEqual(["1-2", "1-4", "2-3", "3-4"]);
	});

	test("an A/B divisions round robin preview alternates the divisions by seed when the assigned ones are unbalanced", () => {
		const bracket = roundRobinPreview(
			teamIds(4).map((id) =>
				tournamentCtxTeam(id, { abDivision: id === 4 ? 1 : 0 }),
			),
		);

		expect(pairings(bracket.data)).toEqual(["1-2", "1-4", "2-3", "3-4"]);
	});

	test("an A/B divisions round robin preview falls back to a regular round robin when no division split is valid", () => {
		const bracket = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "round_robin",
							name: "Groups",
							requiresCheckIn: false,
							settings: { hasAbDivisions: true, groupCount: 2 },
						},
					],
				},
				teams: teamIds(6).map((id) => tournamentCtxTeam(id)),
			},
		}).bracketByIdx(0)!;

		expect(bracket.data.match).toHaveLength(6);
	});

	function pairings(data: BracketData) {
		return data.match
			.map((match) =>
				[match.opponent1?.id, match.opponent2?.id]
					.toSorted((a, b) => a! - b!)
					.join("-"),
			)
			.toSorted((a, b) => a.localeCompare(b));
	}
});

describe("Bracket.everyMatchOver", () => {
	test.each(["single_elimination", "double_elimination"] as const)(
		"a %s bracket that has not started is not over, even without teams to play",
		(type) => {
			const bracket = testTournament({
				ctx: {
					settings: {
						bracketProgression: [{ ...SINGLE_ELIMINATION, type }],
					},
					teams: [tournamentCtxTeam(1)],
				},
			}).bracketByIdx(0)!;

			expect(bracket.everyMatchOver).toBe(false);
		},
	);

	test("a single elimination bracket with byes is over once every match is played", () => {
		const bracket = testTournament({
			ctx: { settings: { bracketProgression: [SINGLE_ELIMINATION] } },
			data: playedOut(
				Engine.create({
					type: "single_elimination",
					seeding: teamIds(5),
					settings: {},
				}),
			),
		}).bracketByIdx(0)!;

		expect(bracket.everyMatchOver).toBe(true);
	});
});

describe("Bracket.source", () => {
	test("a bracket without teams has not decided any placements", () => {
		const bracket = testTournament({
			ctx: { settings: { bracketProgression: [SINGLE_ELIMINATION] } },
		}).bracketByIdx(0)!;

		expect(bracket.source({ placements: [1] }).relevantMatchesFinished).toBe(
			false,
		);
	});
});

describe("Bracket.standings", () => {
	const ROSTER = [10, 11, 12, 13, 14];

	const playedOutTournament = (participatedUsers: number[] | undefined) =>
		new Tournament({
			...testTournamentData({
				ctx: {
					settings: { bracketProgression: [SINGLE_ELIMINATION] },
					teams: teamIds(4).map((id) =>
						tournamentCtxTeam(id, {
							memberUserIds: ROSTER.map((userId) => userId * id),
						}),
					),
				},
				data: playedOut(
					Engine.create({
						type: "single_elimination",
						seeding: teamIds(4),
						settings: {},
					}),
				),
			}),
			participatedUsers,
		});

	test("lists only the members who played in the tournament", () => {
		const winner = playedOutTournament([10, 11, 12, 13]).bracketByIdx(0)!
			.standings[0];

		expect(winner.team.memberUserIds).toEqual([10, 11, 12, 13]);
	});

	test("lists the full roster in views that did not load who played", () => {
		const winner = playedOutTournament(undefined).bracketByIdx(0)!.standings[0];

		expect(winner.team.memberUserIds).toEqual(ROSTER);
	});
});
