import { describe, expect, test } from "vitest";
import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import * as Engine from "~/features/tournament-bracket/core/engine";
import { createResolved } from "~/features/tournament-bracket/core/engine/create";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import {
	mergeStages,
	progressions,
	testTournament,
	tournamentCtxTeam,
} from "~/features/tournament-bracket/core/tests/test-utils";
import invariant from "~/utils/invariant";
import {
	matchesPlayedByTeamId,
	reNumberPlacements,
	sprByTeamId,
	tournamentStandings,
} from "./Standings";

describe("tournamentStandings", () => {
	test("returns single-division standings for a tournament with one starting bracket", () => {
		const tournament = singleEliminationTournament();

		const result = tournamentStandings(tournament);

		expect(result.type).toBe("single");
		invariant(result.type === "single");
		expect(result.standings.length).toBeGreaterThan(0);
		expect(result.standings[0].placement).toBe(1);
		expect(result.standings[0].team.id).toBe(1);
	});

	test("returns one div per starting bracket for a tournament with multiple starting brackets", () => {
		const tournament = testTournament({
			ctx: {
				settings: { bracketProgression: progressions.manyStartBrackets },
				teams: [
					tournamentCtxTeam(1, { startingBracketIdx: 0, seed: 1 }),
					tournamentCtxTeam(2, { startingBracketIdx: 0, seed: 2 }),
					tournamentCtxTeam(3, { startingBracketIdx: 1, seed: 3 }),
					tournamentCtxTeam(4, { startingBracketIdx: 1, seed: 4 }),
				],
			},
		});

		const result = tournamentStandings(tournament);

		expect(result.type).toBe("multi");
		invariant(result.type === "multi");
		expect(result.standings).toHaveLength(2);
		for (const { div } of result.standings) {
			expect(typeof div).toBe("string");
			expect(div.length).toBeGreaterThan(0);
		}
		const divs = result.standings.map((s) => s.div);
		expect(new Set(divs).size).toBe(2);
	});

	test("splits A/B divisions finals into 'A' and 'B' divs with teams partitioned by abDivision", () => {
		const tournament = abDivisionsTournament();

		const result = tournamentStandings(tournament);

		expect(result.type).toBe("multi");
		invariant(result.type === "multi");
		expect(result.standings.map((s) => s.div)).toEqual(["A", "B"]);

		const [a, b] = result.standings;
		expect(a.standings.map((s) => s.team.id)).toEqual([1, 3]);
		expect(b.standings.map((s) => s.team.id)).toEqual([2, 4]);
		expect(a.standings.every((s) => s.team.abDivision === 0)).toBe(true);
		expect(b.standings.every((s) => s.team.abDivision === 1)).toBe(true);
	});

	test("re-numbers placements within each A/B division starting from 1", () => {
		const tournament = abDivisionsTournament();

		const result = tournamentStandings(tournament);

		invariant(result.type === "multi");
		const [a, b] = result.standings;
		expect(a.standings.map((s) => s.placement)).toEqual([1, 2]);
		expect(b.standings.map((s) => s.placement)).toEqual([1, 2]);
	});

	test("breaks ties of a bracket with the results of its underground bracket", () => {
		const tournament = singleEliminationWithUndergroundTournament();

		const result = tournamentStandings(tournament);

		invariant(result.type === "single");
		// teams 5-8 are tied as quarterfinal losers, the underground bracket (won by 8, then 7, 6, 5) orders them
		expect(result.standings.map((s) => s.team.id)).toEqual([
			1, 2, 3, 4, 8, 7, 6, 5,
		]);
		expect(result.standings.map((s) => s.placement)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8,
		]);
	});

	test("keeps teams that skipped the underground bracket tied below those who played it", () => {
		const tournament = singleEliminationWithUndergroundTournament({
			undergroundSeeding: [7, 8],
		});

		const result = tournamentStandings(tournament);

		invariant(result.type === "single");
		expect(result.standings.map((s) => s.team.id)).toEqual([
			1, 2, 3, 4, 8, 7, 5, 6,
		]);
		expect(result.standings.map((s) => s.placement)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 7,
		]);
	});

	test("does not break ties with an underground bracket that is still in progress", () => {
		// only the underground semi-finals were played, the two teams still alive have no placement yet
		const tournament = singleEliminationWithUndergroundTournament({
			undergroundConsolationFinal: false,
			undergroundMatchesPlayed: 2,
		});

		const result = tournamentStandings(tournament);

		invariant(result.type === "single");
		// teams 5-8 keep their main bracket tie: eliminated underground teams don't sort above those still in it
		expect(result.standings.map((s) => s.team.id)).toEqual([
			1, 2, 3, 4, 8, 5, 7, 6,
		]);
		expect(result.standings.map((s) => s.placement)).toEqual([
			1, 2, 3, 4, 5, 5, 5, 5,
		]);
	});

	test("places teams eliminated in a redemption bracket above the teams of a lower placed bracket", () => {
		const tournament = groupsToRedemptionAndConsolationTournament();

		const result = tournamentStandings(tournament);

		invariant(result.type === "single");
		// team 3 lost redemption (reached by placing 3rd in groups), so it is above the 5th-8th consolation teams
		expect(result.standings.map((s) => s.team.id)).toEqual([
			1, 2, 4, 3, 5, 6, 7, 8,
		]);
		expect(result.standings.map((s) => s.placement)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8,
		]);
	});

	test("does not break ties with an underground bracket that was never started", () => {
		// an underground bracket set in the progression can be skipped altogether
		const tournament = singleEliminationWithUndergroundTournament({
			undergroundStarted: false,
		});
		expect(tournament.bracketByIdx(1)?.preview).toBe(true);

		const result = tournamentStandings(tournament);

		invariant(result.type === "single");
		expect(result.standings.map((s) => s.team.id)).toEqual([
			1, 2, 3, 4, 8, 5, 7, 6,
		]);
		expect(result.standings.map((s) => s.placement)).toEqual([
			1, 2, 3, 4, 5, 5, 5, 5,
		]);
	});

	test("keeps quarterfinal losers 5th while the third place match is still pending", () => {
		const result = tournamentStandings(
			singleEliminationWithPendingThirdPlaceMatch(),
		);
		invariant(result.type === "single");

		const placementOf = (teamId: number) =>
			result.standings.find((standing) => standing.team.id === teamId)
				?.placement;

		expect(placementOf(1)).toBe(1);
		expect(placementOf(2)).toBe(2);
		expect([5, 6, 7, 8].map(placementOf)).toEqual([5, 5, 5, 5]);
	});

	test("lists the semifinal losers while the third place match is still pending", () => {
		const result = tournamentStandings(
			singleEliminationWithPendingThirdPlaceMatch(),
		);
		invariant(result.type === "single");

		const teamIds = result.standings.map((standing) => standing.team.id);

		expect(teamIds).toContain(3);
		expect(teamIds).toContain(4);
	});
});

describe("reNumberPlacements", () => {
	test("keeps already contiguous placements unchanged", () => {
		const result = reNumberPlacements([
			{ placement: 1 },
			{ placement: 2 },
			{ placement: 3 },
		]);

		expect(result.map((s) => s.placement)).toEqual([1, 2, 3]);
	});

	test("groups tied placements and skips numbers to match team count", () => {
		const result = reNumberPlacements([
			{ placement: 1 },
			{ placement: 1 },
			{ placement: 3 },
			{ placement: 3 },
			{ placement: 5 },
		]);

		expect(result.map((s) => s.placement)).toEqual([1, 1, 3, 3, 5]);
	});

	test("re-numbers from 1 when the input has been filtered (e.g. top finishers removed)", () => {
		const result = reNumberPlacements([
			{ placement: 3 },
			{ placement: 3 },
			{ placement: 5 },
			{ placement: 7 },
		]);

		expect(result.map((s) => s.placement)).toEqual([1, 1, 3, 4]);
	});

	test("adds the offset to every placement", () => {
		const result = reNumberPlacements(
			[{ placement: 1 }, { placement: 1 }, { placement: 3 }],
			10,
		);

		expect(result.map((s) => s.placement)).toEqual([11, 11, 13]);
	});

	test("preserves non-placement fields on each standing", () => {
		const result = reNumberPlacements([
			{ placement: 1, team: { id: 7 }, note: "a" },
			{ placement: 2, team: { id: 8 }, note: "b" },
		]);

		expect(result).toEqual([
			{ placement: 1, team: { id: 7 }, note: "a" },
			{ placement: 2, team: { id: 8 }, note: "b" },
		]);
	});

	test("returns an empty array when given an empty array", () => {
		expect(reNumberPlacements([])).toEqual([]);
		expect(reNumberPlacements([], 5)).toEqual([]);
	});
});

describe("sprByTeamId", () => {
	test("gives every team an SPR of 0 when they all place exactly as seeded", () => {
		const result = sprByTeamId(
			standings([
				{ id: 1, seed: 1, placement: 1 },
				{ id: 2, seed: 2, placement: 2 },
				{ id: 3, seed: 3, placement: 3 },
				{ id: 4, seed: 4, placement: 4 },
			]),
		);

		expect([...result.values()]).toEqual([0, 0, 0, 0]);
	});

	test("rewards a team for every placement it beat its seed by", () => {
		const result = sprByTeamId(
			standings([
				{ id: 4, seed: 4, placement: 1 },
				{ id: 1, seed: 1, placement: 2 },
				{ id: 2, seed: 2, placement: 3 },
				{ id: 3, seed: 3, placement: 4 },
			]),
		);

		expect(result.get(4)).toBe(3);
		expect(result.get(1)).toBe(-1);
		expect(result.get(2)).toBe(-1);
		expect(result.get(3)).toBe(-1);
	});

	test("counts tied placements as one step", () => {
		const result = sprByTeamId(
			standings([
				{ id: 3, seed: 3, placement: 1 },
				{ id: 1, seed: 1, placement: 2 },
				{ id: 2, seed: 2, placement: 3 },
				{ id: 4, seed: 4, placement: 3 },
			]),
		);

		expect(result.get(3)).toBe(2);
		expect(result.get(4)).toBe(0);
	});

	test("returns 0 for a team whose seed is outside the standings", () => {
		const result = sprByTeamId(
			standings([
				{ id: 1, seed: 1, placement: 1 },
				{ id: 2, seed: 9, placement: 2 },
			]),
		);

		expect(result.get(2)).toBe(0);
	});
});

describe("matchesPlayedByTeamId", () => {
	test("tags each match with the bracket index it was actually played in", () => {
		const tournament = roundRobinToSingleEliminationTournament();

		const matches = matchesPlayedByTeamId(tournament).get(1) ?? [];

		// team 1 plays 3 round robin matches (bracket idx 0) and 1 single elimination match (bracket idx 1)
		const roundRobinMatches = matches.filter((m) => m.bracketIdx === 0);
		const singleEliminationMatches = matches.filter((m) => m.bracketIdx === 1);

		expect(roundRobinMatches).toHaveLength(3);
		expect(singleEliminationMatches).toHaveLength(1);
	});

	test("includes matches of brackets that are not part of the standings, in the order they were played", () => {
		const tournament = roundRobinWithRedemptionTournament();

		const matches = matchesPlayedByTeamId(tournament).get(4) ?? [];

		// 3 round robin matches, the redemption bracket match and the final stage match
		expect(matches.map((match) => match.bracketIdx)).toEqual([0, 0, 0, 2, 1]);
	});
});

function roundRobinToSingleEliminationTournament() {
	const data = playOutLowerIdWins(
		mergeStages(
			createResolved({
				type: "round_robin",
				seeding: [1, 2, 3, 4],
				settings: { groupCount: 1 },
			}),
			createResolved({
				type: "single_elimination",
				seeding: [1, 2],
				settings: {},
			}),
		),
	);

	return testTournament({
		ctx: {
			settings: {
				bracketProgression: progressions.roundRobinToSingleElimination,
			},
			teams: [
				tournamentCtxTeam(1, { startingBracketIdx: 0, seed: 1 }),
				tournamentCtxTeam(2, { startingBracketIdx: 0, seed: 2 }),
				tournamentCtxTeam(3, { startingBracketIdx: 0, seed: 3 }),
				tournamentCtxTeam(4, { startingBracketIdx: 0, seed: 4 }),
			],
		},
		data,
	});
}

function roundRobinWithRedemptionTournament() {
	const merged = mergeStages(
		playOutLowerIdWins(
			createResolved({
				type: "round_robin",
				seeding: [1, 2, 3, 4],
				settings: { groupCount: 1 },
			}),
		),
		playOut(
			createResolved({
				type: "single_elimination",
				seeding: [3, 4],
				settings: {},
			}),
			(one, two) => one > two,
		),
		playOutLowerIdWins(
			createResolved({
				type: "single_elimination",
				seeding: [1, 2, 4],
				settings: {},
			}),
		),
	);

	// the redemption bracket (idx 2) was played before the final stage (idx 1)
	const stageNames = ["Groups Stage", "Redemption", "Final Stage"];
	const data = {
		...merged,
		stage: merged.stage.map((stage, stageIdx) => ({
			...stage,
			name: stageNames[stageIdx],
			createdAt: stageIdx + 1,
		})),
	};

	return testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "round_robin",
						name: "Groups Stage",
						requiresCheckIn: false,
						settings: {},
					},
					{
						type: "single_elimination",
						name: "Final Stage",
						requiresCheckIn: false,
						settings: {},
						sources: [
							{ bracketIdx: 0, placements: [1, 2] },
							{ bracketIdx: 2, placements: [1] },
						],
					},
					{
						type: "single_elimination",
						name: "Redemption",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [3, 4] }],
					},
				],
			},
			teams: [1, 2, 3, 4].map((id) =>
				tournamentCtxTeam(id, { startingBracketIdx: 0, seed: id }),
			),
		},
		data,
	});
}

function groupsToRedemptionAndConsolationTournament() {
	const data = mergeStages(
		playOutLowerIdWins(
			createResolved({
				type: "round_robin",
				seeding: [1, 2, 3, 4, 5, 6, 7, 8],
				settings: { groupCount: 1 },
			}),
		),
		// the higher seed wins so team 4 advances to the top cut and team 3 is eliminated
		playOut(
			createResolved({
				type: "single_elimination",
				seeding: [3, 4],
				settings: {},
			}),
			(one, two) => one > two,
		),
		playOutLowerIdWins(
			createResolved({
				type: "single_elimination",
				seeding: [1, 2, 4],
				settings: {},
			}),
		),
		playOutLowerIdWins(
			createResolved({
				type: "single_elimination",
				seeding: [5, 6, 7, 8],
				settings: { consolationFinal: true },
			}),
		),
	);

	return testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "round_robin",
						name: "Groups",
						requiresCheckIn: false,
						settings: { groupCount: 1 },
					},
					{
						type: "single_elimination",
						name: "Redemption",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [3, 4] }],
					},
					{
						type: "single_elimination",
						name: "Top Cut",
						requiresCheckIn: false,
						settings: {},
						sources: [
							{ bracketIdx: 1, placements: [1] },
							{ bracketIdx: 0, placements: [1, 2] },
						],
					},
					{
						type: "single_elimination",
						name: "Consolation",
						requiresCheckIn: false,
						settings: { thirdPlaceMatch: true },
						sources: [{ bracketIdx: 0, placements: [5, 6, 7, 8] }],
					},
				],
			},
			teams: [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
				tournamentCtxTeam(id, { startingBracketIdx: 0, seed: id }),
			),
		},
		data,
	});
}

function singleEliminationTournament() {
	const data = playOutLowerIdWins(
		createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		}),
	);

	return testTournament({
		ctx: {
			settings: {
				bracketProgression: progressions.singleElimination,
			},
			teams: [
				tournamentCtxTeam(1, { seed: 1 }),
				tournamentCtxTeam(2, { seed: 2 }),
				tournamentCtxTeam(3, { seed: 3 }),
				tournamentCtxTeam(4, { seed: 4 }),
			],
		},
		data,
	});
}

/** Eight teams, every match reported except the third place match. */
function singleEliminationWithPendingThirdPlaceMatch() {
	let data = createResolved({
		type: "single_elimination",
		seeding: [1, 2, 3, 4, 5, 6, 7, 8],
		settings: { consolationFinal: true },
	});
	const thirdPlaceGroupId = Math.max(...data.group.map((group) => group.id));

	while (true) {
		const pending = data.match.find(
			(match) =>
				match.groupId !== thirdPlaceGroupId &&
				typeof match.opponent1?.id === "number" &&
				typeof match.opponent2?.id === "number" &&
				!match.winnerSide,
		);
		if (!pending) break;

		const winnerIsOpp1 =
			(pending.opponent1!.id as number) < (pending.opponent2!.id as number);
		data = Engine.reportResult(data, {
			matchId: pending.id,
			scores: [winnerIsOpp1 ? 2 : 0, winnerIsOpp1 ? 0 : 2],
			winnerSide: winnerIsOpp1 ? "opponent1" : "opponent2",
		}).data;
	}

	return testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "single_elimination",
						name: "Main Bracket",
						requiresCheckIn: false,
						settings: { thirdPlaceMatch: true },
					},
				],
			},
			teams: [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
				tournamentCtxTeam(id, { seed: id }),
			),
		},
		data,
	});
}

function singleEliminationWithUndergroundTournament({
	undergroundSeeding = [5, 6, 7, 8],
	undergroundConsolationFinal = undergroundSeeding.length > 2,
	undergroundMatchesPlayed,
	undergroundStarted = true,
}: {
	undergroundSeeding?: number[];
	undergroundConsolationFinal?: boolean;
	undergroundMatchesPlayed?: number;
	undergroundStarted?: boolean;
} = {}) {
	const mainBracket = playOut(
		createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true },
		}),
		(one, two) => one < two,
	);

	const data = undergroundStarted
		? mergeStages(
				mainBracket,
				playOut(
					createResolved({
						type: "single_elimination",
						seeding: undergroundSeeding,
						settings: { consolationFinal: undergroundConsolationFinal },
					}),
					(one, two) => one > two,
					undergroundMatchesPlayed,
				),
			)
		: mainBracket;

	return testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "single_elimination",
						name: "Main Bracket",
						requiresCheckIn: false,
						settings: { thirdPlaceMatch: true },
					},
					{
						type: "single_elimination",
						name: "Underground",
						requiresCheckIn: false,
						settings: { thirdPlaceMatch: true },
						sources: [{ bracketIdx: 0, placements: [-1] }],
					},
				],
			},
			teams: [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
				tournamentCtxTeam(id, { startingBracketIdx: 0, seed: id }),
			),
		},
		data,
	});
}

function abDivisionsTournament() {
	let data = createResolved({
		type: "round_robin",
		seeding: [1, 2, 3, 4],
		abDivisions: [0, 1, 0, 1],
		settings: {
			groupCount: 1,
			hasAbDivisions: true,
		},
	});

	const winnerByMatchup: Record<string, number> = {
		"1-2": 1,
		"1-4": 1,
		"2-3": 2,
		"3-4": 3,
	};
	for (const match of data.match) {
		const a = match.opponent1!.id as number;
		const b = match.opponent2!.id as number;
		const key = a < b ? `${a}-${b}` : `${b}-${a}`;
		const winnerId = winnerByMatchup[key];
		invariant(winnerId, `unexpected matchup ${key}`);
		const loserScore = key === "2-3" || key === "3-4" ? 1 : 0;
		const winnerIsOpp1 = match.opponent1!.id === winnerId;
		data = Engine.reportResult(data, {
			matchId: match.id,
			scores: [winnerIsOpp1 ? 2 : loserScore, winnerIsOpp1 ? loserScore : 2],
			winnerSide: winnerIsOpp1 ? "opponent1" : "opponent2",
		}).data;
	}

	return testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "round_robin",
						name: "AB RR",
						requiresCheckIn: false,
						settings: { hasAbDivisions: true },
					},
				],
			},
			teams: [
				tournamentCtxTeam(1, { abDivision: 0, seed: 1 }),
				tournamentCtxTeam(2, { abDivision: 1, seed: 2 }),
				tournamentCtxTeam(3, { abDivision: 0, seed: 3 }),
				tournamentCtxTeam(4, { abDivision: 1, seed: 4 }),
			],
		},
		data,
	});
}

/** Plays every match of the bracket data, the lower team id always winning. */
function playOutLowerIdWins(data: BracketData) {
	return playOut(data, (one, two) => one < two);
}

/**
 * Plays every match of the bracket data, `opponent1Wins` deciding each match by team id.
 * `maxMatches` can be given to leave the bracket in progress.
 */
function playOut(
	data: BracketData,
	opponent1Wins: (opponent1Id: number, opponent2Id: number) => boolean,
	maxMatches = Number.POSITIVE_INFINITY,
) {
	let played = data;
	let playedCount = 0;

	while (playedCount < maxMatches) {
		const pending = played.match.find(
			(match) =>
				typeof match.opponent1?.id === "number" &&
				typeof match.opponent2?.id === "number" &&
				!match.winnerSide,
		);
		if (!pending) break;

		const winnerIsOpp1 = opponent1Wins(
			pending.opponent1!.id as number,
			pending.opponent2!.id as number,
		);
		played = Engine.reportResult(played, {
			matchId: pending.id,
			scores: [winnerIsOpp1 ? 2 : 0, winnerIsOpp1 ? 0 : 2],
			winnerSide: winnerIsOpp1 ? "opponent1" : "opponent2",
		}).data;
		playedCount++;
	}

	return played;
}

function standings(
	teams: Array<{ id: number; seed: number; placement: number }>,
): Standing[] {
	return teams.map(({ id, seed, placement }) => ({
		team: tournamentCtxTeam(id, { seed }),
		placement,
	}));
}
