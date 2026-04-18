import * as R from "remeda";
import { describe, expect, it } from "vitest";
import { BracketsManager } from "~/modules/brackets-manager";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import invariant from "../../../utils/invariant";
import * as Swiss from "../core/Swiss";
import { Tournament } from "./Tournament";
import { PADDLING_POOL_255 } from "./tests/mocks";
import { LOW_INK_DECEMBER_2024 } from "./tests/mocks-li";
import { testTournament, tournamentCtxTeam } from "./tests/test-utils";

const TEAM_ERROR_404_ID = 17354;
const TEAM_THIS_IS_FINE_ID = 17513;

describe("swiss standings - losses against tied", () => {
	it("should calculate losses against tied", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standing = tournament
			.bracketByIdx(0)
			?.currentStandings(false)
			.find((standing) => standing.team.id === TEAM_THIS_IS_FINE_ID);

		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(1);
	});

	it("should ignore early dropped out teams for standings (losses against tied)", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standing = tournament
			.bracketByIdx(0)
			?.currentStandings(false)
			.find((standing) => standing.team.id === TEAM_ERROR_404_ID);
		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(0); // they lost against "Tidy Tidings" but that team dropped out before final round
	});

	const inProgressSwissTestTournament = () => {
		const data = Swiss.create({
			tournamentId: 1,
			name: "Swiss",
			seeding: [1, 2, 3],
			settings: {
				swiss: {
					groupCount: 1,
					roundCount: 5,
				},
			},
		});

		// needed to make it "not preview"
		data.round = data.round.map((r) => ({
			...r,
			maps: { count: 3, type: "BEST_OF" },
		}));

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "swiss",
							name: "Swiss",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});
	};

	it("should handle a team with only one bye", () => {
		const tournament = inProgressSwissTestTournament();

		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

		const teamWithBye = standings.find((standing) => standing.team.id === 3);

		expect(teamWithBye?.stats?.opponentMapWinPercentage).toBe(0);
		expect(teamWithBye?.stats?.opponentSetWinPercentage).toBe(0);
		expect(teamWithBye?.stats?.setWins).toBe(1);
		expect(teamWithBye?.stats?.setLosses).toBe(0);
		expect(teamWithBye?.stats?.mapWins).toBe(2);
		expect(teamWithBye?.stats?.setLosses).toBe(0);
	});

	it("team with only unfinished matches should not be in the current standings", () => {
		const tournament = inProgressSwissTestTournament();

		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

		const playingTeam = standings.find((standing) => standing.team.id === 1);

		expect(playingTeam).toBe(undefined);
	});
});

describe("round robin standings", () => {
	it("should sort teams primarily by set wins (per group) in paddling pool 255", () => {
		const tournamentPP255 = new Tournament(PADDLING_POOL_255());

		const standings = tournamentPP255.bracketByIdx(0)!.standings;

		const groupIds = R.unique(standings.map((standing) => standing.groupId));
		expect(
			groupIds.length,
			"Paddling Pool 255 should have groups from Group A to Group I",
		).toBe(9);

		for (const groupId of groupIds) {
			const groupStandings = standings.filter(
				(standing) => standing.groupId === groupId,
			);

			for (let i = 0; i < groupStandings.length; i++) {
				const current = groupStandings[i];
				const next = groupStandings[i + 1];

				if (!next) {
					break;
				}

				expect(
					current.stats!.setWins,
					`Team with ID ${current.team.id} in wrong spot relative to ${next.team.id}`,
				).toBeGreaterThanOrEqual(next.stats!.setWins);
			}
		}
	});

	it("has ascending order from lower group id to higher group id for same placements", () => {
		const tournamentPP255 = new Tournament(PADDLING_POOL_255());

		const standings = tournamentPP255.bracketByIdx(0)!.standings;

		const placements = R.unique(
			standings.map((standing) => standing.placement),
		).sort((a, b) => a - b);

		for (const placement of placements) {
			const placementStandings = standings.filter(
				(standing) => standing.placement === placement,
			);

			for (let i = 0; i < placementStandings.length; i++) {
				const current = placementStandings[i];
				const next = placementStandings[i + 1];

				if (!next) {
					break;
				}

				expect(
					current.groupId,
					`Team with ID ${current.team.id} in wrong spot relative to ${next.team.id}`,
				).toBeLessThan(next.groupId!);
			}
		}
	});
});

describe("round robin A/B divisions standings", () => {
	const abDivisionsTournament = () => {
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

		const setResult = (
			matchId: number,
			winnerId: number,
			winnerScore: number,
			loserScore: number,
		) => {
			const match = storage.select<any>("match", matchId);
			invariant(match, `match ${matchId} not found`);
			const winnerIsOpp1 = match.opponent1.id === winnerId;
			manager.update.match({
				id: match.id,
				opponent1: winnerIsOpp1
					? { score: winnerScore, result: "win" }
					: { score: loserScore },
				opponent2: winnerIsOpp1
					? { score: loserScore }
					: { score: winnerScore, result: "win" },
			});
		};

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
			setResult(match.id, winnerId, 2, loserScore);
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
	};

	it("filtering by abDivision preserves standard tiebreaker order within each division", () => {
		const tournament = abDivisionsTournament();
		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

		expect(standings.map((s) => s.team.id)).toEqual([1, 2, 3, 4]);

		const divisionA = standings.filter((s) => s.team.abDivision === 0);
		const divisionB = standings.filter((s) => s.team.abDivision === 1);

		expect(divisionA.map((s) => s.team.id)).toEqual([1, 3]);
		expect(divisionB.map((s) => s.team.id)).toEqual([2, 4]);
	});

	it("source({ placements: [1] }) returns top team from each division", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament.bracketByIdx(0)!.source({ placements: [1] });

		expect(teams).toEqual([1, 2]);
	});

	it("source({ placements: [1, 2] }) returns top two teams from each division", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1, 2] });

		expect(teams).toHaveLength(4);
		expect(new Set(teams)).toEqual(new Set([1, 2, 3, 4]));
		expect(teams.slice(0, 2)).toEqual([1, 3]);
		expect(teams.slice(2, 4)).toEqual([2, 4]);
	});

	it("source ignores placements beyond division size", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1, 5] });

		expect(teams).toEqual([1, 2]);
	});
});
