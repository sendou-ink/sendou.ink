import { describe, expect, it } from "vitest";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { ZONES_WEEKLY_38 } from "~/features/tournament-bracket/core/tests/mocks-zones-weekly";
import invariant from "~/utils/invariant";
import * as Swiss from "./Swiss";

describe("Swiss", () => {
	const createArgsWithDefaults = (
		args: Partial<Parameters<typeof Swiss.create>[0]> = {},
	): Parameters<typeof Swiss.create>[0] => {
		return {
			name: "Swiss Tournament",
			seeding: [1, 2, 3, 4],
			settings: {},
			tournamentId: 1,
			...args,
		};
	};

	describe("create()", () => {
		it("attaches the correct tournament id to the data", () => {
			const data = Swiss.create(createArgsWithDefaults());

			expect(data.stage[0].tournament_id).toBe(1);
		});

		it("creates a swiss bracket with correct amount of initial matches", () => {
			const data = Swiss.create(createArgsWithDefaults());

			expect(data.match).toHaveLength(2);
		});

		it("creates a swiss bracket with correct amount of rounds as default", () => {
			const data = Swiss.create(createArgsWithDefaults());

			expect(data.round).toHaveLength(5);
		});

		it("creates a swiss bracket with correct amount of rounds as parameter", () => {
			const data = Swiss.create(
				createArgsWithDefaults({
					settings: {
						swiss: {
							groupCount: 1,
							roundCount: 4,
						},
					},
				}),
			);

			expect(data.round).toHaveLength(4);
		});

		it("creates a swiss bracket with two groups", () => {
			const data = Swiss.create(
				createArgsWithDefaults({
					settings: {
						swiss: {
							groupCount: 2,
							roundCount: 5,
						},
					},
				}),
			);

			expect(data.round).toHaveLength(10);

			const matchGroupIds = data.match.map((m) => m.group_id);
			expect(matchGroupIds).toContain(0);
			expect(matchGroupIds).toContain(1);
		});

		it("every team has a match", () => {
			const data = Swiss.create(createArgsWithDefaults());

			for (const teamId of [1, 2, 3, 4]) {
				expect(
					data.match.some(
						(match) =>
							match.opponent1?.id === teamId || match.opponent2?.id === teamId,
					),
				).toBe(true);
			}
		});

		it("assigns a BYE if odd number of teams", () => {
			const data = Swiss.create(
				createArgsWithDefaults({
					seeding: [1, 2, 3, 4, 5],
				}),
			);

			const byes = data.match.filter((match) => match.opponent2 === null);
			expect(byes).toHaveLength(1);
		});

		it("if no teams, should generate a bracket data with no matches", () => {
			const data = Swiss.create(createArgsWithDefaults({ seeding: [] }));

			expect(data.match).toHaveLength(0);
		});
	});

	describe("generateMatchUps()", () => {
		describe("Zones Weekly 38", () => {
			const tournament = new Tournament({
				...ZONES_WEEKLY_38(),
				simulateBrackets: false,
			});

			const bracket = tournament.bracketByIdx(0)!;

			const matches = Swiss.generateMatchUps({
				bracket,
				groupId: 4443,
			});

			it("finds new opponents for each team in the last round", () => {
				for (const match of matches) {
					if (match.opponentTwo === "null") continue;

					const opponent1 = JSON.parse(match.opponentOne).id as number;
					const opponent2 = JSON.parse(match.opponentTwo).id as number;

					const existingMatch = bracket.data.match.find(
						(m) =>
							(m.opponent1?.id === opponent1 &&
								m.opponent2?.id === opponent2) ||
							(m.opponent1?.id === opponent2 && m.opponent2?.id === opponent1),
					);

					expect(existingMatch).toBeUndefined();
				}
			});

			it("generates a bye", () => {
				const byes = matches.filter((match) => match.opponentTwo === "null");
				expect(byes).toHaveLength(1);
			});

			it("every pair is max one set win from each other", () => {
				for (const match of matches) {
					if (match.opponentTwo === "null") continue;

					const opponent1 = JSON.parse(match.opponentOne).id as number;
					const opponent2 = JSON.parse(match.opponentTwo).id as number;

					const opponent1Stats = bracket.standings.find(
						(s) => s.team.id === opponent1,
					)?.stats;
					const opponent2Stats = bracket.standings.find(
						(s) => s.team.id === opponent2,
					)?.stats;

					invariant(opponent1Stats, "Opponent 1 not found in standings");
					invariant(opponent2Stats, "Opponent 2 not found in standings");

					expect(
						Math.abs(opponent1Stats.setWins - opponent2Stats.setWins),
					).toBeLessThanOrEqual(1);
				}
			});
		});
	});
});
