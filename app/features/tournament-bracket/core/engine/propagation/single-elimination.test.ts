import { beforeEach, describe, expect, test } from "vitest";
import { TournamentMatchStatus } from "~/db/tables";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Previous and next match update", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should determine matches in consolation final", () => {
		bracket.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		bracket.updateMatch({
			id: 0, // First match of round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		bracket.updateMatch({
			id: 1, // Second match of round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		expect(bracket.match(3).opponent1?.id).toBe(bracket.match(0).opponent2?.id);
		expect(bracket.match(3).opponent2?.id).toBe(bracket.match(1).opponent1?.id);
		expect(bracket.match(2).status).toBe(TournamentMatchStatus.Ready);
		expect(bracket.match(3).status).toBe(TournamentMatchStatus.Ready);
	});

	test("should play both the final and consolation final in parallel", () => {
		bracket.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		bracket.updateMatch({
			id: 0, // First match of round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		bracket.updateMatch({
			id: 1, // Second match of round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		bracket.updateMatch({
			id: 2, // Final
			opponent1: { score: 12 },
			opponent2: { score: 9 },
		});

		expect(bracket.match(2).status).toBe(TournamentMatchStatus.Running);
		expect(bracket.match(3).status).toBe(TournamentMatchStatus.Ready);

		bracket.updateMatch({
			id: 3, // Consolation final
			opponent1: { score: 12 },
			opponent2: { score: 9 },
		});

		expect(bracket.match(2).status).toBe(TournamentMatchStatus.Running);
		expect(bracket.match(3).status).toBe(TournamentMatchStatus.Running);

		bracket.updateMatch({
			id: 3, // Consolation final
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});

		expect(bracket.match(2).status).toBe(TournamentMatchStatus.Running);

		bracket.updateMatch({
			id: 2, // Final
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});
	});
});
