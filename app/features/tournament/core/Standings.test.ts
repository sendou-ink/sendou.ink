import { describe, expect, it } from "vitest";
import {
	progressions,
	testTournament,
	tournamentCtxTeam,
} from "~/features/tournament-bracket/core/tests/test-utils";
import { BracketsManager } from "~/modules/brackets-manager";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import invariant from "~/utils/invariant";
import { reNumberPlacements, tournamentStandings } from "./Standings";

describe("tournamentStandings", () => {
	it("returns single-division standings for a tournament with one starting bracket", () => {
		const tournament = singleEliminationTournament();

		const result = tournamentStandings(tournament);

		expect(result.type).toBe("single");
		invariant(result.type === "single");
		expect(result.standings.length).toBeGreaterThan(0);
		expect(result.standings[0].placement).toBe(1);
		expect(result.standings[0].team.id).toBe(1);
	});

	it("returns one div per starting bracket for a tournament with multiple starting brackets", () => {
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

	it("splits A/B divisions finals into 'A' and 'B' divs with teams partitioned by abDivision", () => {
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

	it("re-numbers placements within each A/B division starting from 1", () => {
		const tournament = abDivisionsTournament();

		const result = tournamentStandings(tournament);

		invariant(result.type === "multi");
		const [a, b] = result.standings;
		expect(a.standings.map((s) => s.placement)).toEqual([1, 2]);
		expect(b.standings.map((s) => s.placement)).toEqual([1, 2]);
	});
});

describe("reNumberPlacements", () => {
	it("keeps already contiguous placements unchanged", () => {
		const result = reNumberPlacements([
			{ placement: 1 },
			{ placement: 2 },
			{ placement: 3 },
		]);

		expect(result.map((s) => s.placement)).toEqual([1, 2, 3]);
	});

	it("groups tied placements and skips numbers to match team count", () => {
		const result = reNumberPlacements([
			{ placement: 1 },
			{ placement: 1 },
			{ placement: 3 },
			{ placement: 3 },
			{ placement: 5 },
		]);

		expect(result.map((s) => s.placement)).toEqual([1, 1, 3, 3, 5]);
	});

	it("re-numbers from 1 when the input has been filtered (e.g. top finishers removed)", () => {
		const result = reNumberPlacements([
			{ placement: 3 },
			{ placement: 3 },
			{ placement: 5 },
			{ placement: 7 },
		]);

		expect(result.map((s) => s.placement)).toEqual([1, 1, 3, 4]);
	});

	it("adds the offset to every placement", () => {
		const result = reNumberPlacements(
			[{ placement: 1 }, { placement: 1 }, { placement: 3 }],
			10,
		);

		expect(result.map((s) => s.placement)).toEqual([11, 11, 13]);
	});

	it("preserves non-placement fields on each standing", () => {
		const result = reNumberPlacements([
			{ placement: 1, team: { id: 7 }, note: "a" },
			{ placement: 2, team: { id: 8 }, note: "b" },
		]);

		expect(result).toEqual([
			{ placement: 1, team: { id: 7 }, note: "a" },
			{ placement: 2, team: { id: 8 }, note: "b" },
		]);
	});

	it("returns an empty array when given an empty array", () => {
		expect(reNumberPlacements([])).toEqual([]);
		expect(reNumberPlacements([], 5)).toEqual([]);
	});
});

function singleEliminationTournament() {
	const storage = new InMemoryDatabase();
	const manager = new BracketsManager(storage);

	manager.create({
		name: "Main Bracket",
		tournamentId: 1,
		type: "single_elimination",
		seeding: [1, 2, 3, 4],
		settings: { seedOrdering: ["natural"] },
	});

	while (true) {
		const pending = storage
			.select<any>("match")!
			.find(
				(m) =>
					typeof m.opponent1?.id === "number" &&
					typeof m.opponent2?.id === "number" &&
					m.opponent1.result !== "win" &&
					m.opponent2.result !== "win",
			);
		if (!pending) break;

		const winnerIsOpp1 = pending.opponent1.id < pending.opponent2.id;
		manager.update.match({
			id: pending.id,
			opponent1: winnerIsOpp1 ? { score: 2, result: "win" } : { score: 0 },
			opponent2: winnerIsOpp1 ? { score: 0 } : { score: 2, result: "win" },
		});
	}

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
		data: manager.get.tournamentData(1),
	});
}

function abDivisionsTournament() {
	const storage = new InMemoryDatabase();
	const manager = new BracketsManager(storage);

	manager.create({
		name: "AB RR",
		tournamentId: 1,
		type: "round_robin",
		seeding: [1, 2, 3, 4],
		abDivisions: [0, 1, 0, 1],
		settings: {
			groupCount: 1,
			hasAbDivisions: true,
			seedOrdering: ["groups.seed_optimized"],
		},
	});

	const winnerByMatchup: Record<string, number> = {
		"1-2": 1,
		"1-4": 1,
		"2-3": 2,
		"3-4": 3,
	};
	for (const match of storage.select<any>("match")!) {
		const a = match.opponent1.id as number;
		const b = match.opponent2.id as number;
		const key = a < b ? `${a}-${b}` : `${b}-${a}`;
		const winnerId = winnerByMatchup[key];
		invariant(winnerId, `unexpected matchup ${key}`);
		const loserScore = key === "2-3" || key === "3-4" ? 1 : 0;
		const winnerIsOpp1 = match.opponent1.id === winnerId;
		manager.update.match({
			id: match.id,
			opponent1: winnerIsOpp1
				? { score: 2, result: "win" }
				: { score: loserScore },
			opponent2: winnerIsOpp1
				? { score: loserScore }
				: { score: 2, result: "win" },
		});
	}

	const data = manager.get.tournamentData(1);

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
