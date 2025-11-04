import { describe, expect, it } from "vitest";
import type { ParsedBracket } from "../tournament-bracket/core/Progression";
import { getBracketProgressionLabel } from "./tournament-utils";

const createBracket = (name: string): ParsedBracket => ({
	name,
	type: "single_elimination",
	settings: {},
	requiresCheckIn: false,
});

describe("getBracketProgressionLabel", () => {
	it("returns single bracket name when only one bracket is reachable", () => {
		const progression: ParsedBracket[] = [createBracket("Main Bracket")];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Main Bracket");
	});

	it("returns common prefix when multiple brackets share a prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("Alpha"),
			createBracket("Alpha A"),
			createBracket("Alpha B"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Alpha");
	});

	it("trims whitespace from common prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("Playoff "),
			createBracket("Playoff Winner"),
			createBracket("Playoff Loser"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Playoff");
	});

	it("returns deepest bracket name when no common prefix exists", () => {
		const progression: ParsedBracket[] = [
			createBracket("Round Robin"),
			createBracket("Winner Bracket"),
			createBracket("Loser Bracket"),
			createBracket("Grand Finals"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];
		progression[3].sources = [
			{ bracketIdx: 1, placements: [1] },
			{ bracketIdx: 2, placements: [1] },
		];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Grand Finals");
	});

	it("handles single character prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("A"),
			createBracket("A1"),
			createBracket("A2"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("A");
	});

	it("handles bracket progression with multiple levels", () => {
		const progression: ParsedBracket[] = [
			createBracket("Qualifier"),
			createBracket("Group A"),
			createBracket("Group B"),
			createBracket("Finals"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1, 2] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [3, 4] }];
		progression[3].sources = [
			{ bracketIdx: 1, placements: [1] },
			{ bracketIdx: 2, placements: [1] },
		];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Finals");
	});

	it("returns bracket name for progression with partial common prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("Swiss"),
			createBracket("Swiss Upper"),
			createBracket("Swiss Lower"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1, 2] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [3, 4] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Swiss");
	});

	it("handles empty string prefix by returning deepest bracket", () => {
		const progression: ParsedBracket[] = [
			createBracket("A"),
			createBracket("B"),
			createBracket("C"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 1, placements: [1] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("C");
	});
});
