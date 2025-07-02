import { describe, expect, it } from "vitest";
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

		it("throws if not enough teams are provided", () => {
			expect(() => {
				Swiss.create(createArgsWithDefaults({ seeding: [1] }));
			}).toThrow("Not enough teams for Swiss tournament");
		});
	});

	// TODO:
	// describe("generateMatchUps()", () => {});
});
