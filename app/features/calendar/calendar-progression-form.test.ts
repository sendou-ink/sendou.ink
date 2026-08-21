import { describe, expect, test } from "vitest";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { ValidationCtx } from "~/utils/schema";
import {
	defaultBracketsFormValues,
	formValuesToInputBrackets,
	progressionToFormValues,
	validateBracketProgressionFormValues,
} from "./calendar-progression-form";

const DOUBLE_ELIMINATION: Progression.ParsedBracket[] = [
	{
		name: "Main Bracket",
		type: "double_elimination",
		settings: {},
		requiresCheckIn: false,
	},
];

const RR_TO_SE_WITH_UNDERGROUND: Progression.ParsedBracket[] = [
	{
		name: "Groups stage",
		type: "round_robin",
		settings: { teamsPerGroup: 4 },
		requiresCheckIn: false,
	},
	{
		name: "Top cut",
		type: "single_elimination",
		settings: { thirdPlaceMatch: false },
		requiresCheckIn: false,
		sources: [{ bracketIdx: 0, placements: [1, 2] }],
	},
	{
		name: "Underground bracket",
		type: "single_elimination",
		settings: { thirdPlaceMatch: false },
		requiresCheckIn: true,
		sources: [{ bracketIdx: 0, placements: [3, 4] }],
	},
];

const SWISS_EARLY_ADVANCE_TO_TOP_CUT: Progression.ParsedBracket[] = [
	{
		name: "Swiss",
		type: "swiss",
		settings: { groupCount: 1, roundCount: 5, advanceThreshold: 3 },
		requiresCheckIn: false,
	},
	{
		name: "Top cut",
		type: "single_elimination",
		settings: { thirdPlaceMatch: true },
		requiresCheckIn: false,
		sources: [{ bracketIdx: 0, placements: [] }],
	},
];

function roundTrip(progression: Progression.ParsedBracket[]) {
	const formValues = progressionToFormValues(progression);
	return Progression.validatedBrackets(
		formValuesToInputBrackets(formValues.brackets, formValues.progression),
	);
}

function validationIssues(formValues: {
	brackets: Parameters<typeof validateBracketProgressionFormValues>[0];
	progression: Parameters<typeof validateBracketProgressionFormValues>[1];
}) {
	const issues: Parameters<ValidationCtx["addIssue"]>[0][] = [];
	const ctx: ValidationCtx = {
		addIssue: (issue) => issues.push(issue),
	};

	validateBracketProgressionFormValues(
		formValues.brackets,
		formValues.progression,
		ctx,
	);

	return issues;
}

describe("progressionToFormValues + formValuesToInputBrackets", () => {
	test("round-trips a single double elimination bracket", () => {
		expect(roundTrip(DOUBLE_ELIMINATION)).toEqual(DOUBLE_ELIMINATION);
	});

	test("round-trips round robin to single elimination with an underground bracket", () => {
		expect(roundTrip(RR_TO_SE_WITH_UNDERGROUND)).toEqual(
			RR_TO_SE_WITH_UNDERGROUND,
		);
	});

	test("round-trips swiss with early advance (empty placements)", () => {
		expect(roundTrip(SWISS_EARLY_ADVANCE_TO_TOP_CUT)).toEqual(
			SWISS_EARLY_ADVANCE_TO_TOP_CUT,
		);
	});

	test("round-trips the N+ rest placements syntax", () => {
		const progression: Progression.ParsedBracket[] = [
			RR_TO_SE_WITH_UNDERGROUND[0],
			RR_TO_SE_WITH_UNDERGROUND[1],
			{
				...RR_TO_SE_WITH_UNDERGROUND[2],
				sources: [{ bracketIdx: 0, placements: [3, 4], rest: true }],
			},
		];

		expect(roundTrip(progression)).toEqual(progression);
	});

	test("round-trips a bracket sourcing teams from two brackets", () => {
		const progression: Progression.ParsedBracket[] = [
			RR_TO_SE_WITH_UNDERGROUND[0],
			RR_TO_SE_WITH_UNDERGROUND[2],
			{
				...RR_TO_SE_WITH_UNDERGROUND[1],
				sources: [
					{ bracketIdx: 0, placements: [1, 2] },
					{ bracketIdx: 1, placements: [1] },
				],
			},
		];

		expect(roundTrip(progression)).toEqual(progression);
	});

	test("round-trips bracket start time", () => {
		const progression: Progression.ParsedBracket[] = [
			RR_TO_SE_WITH_UNDERGROUND[0],
			{ ...RR_TO_SE_WITH_UNDERGROUND[1], startTime: 1735689600 },
			RR_TO_SE_WITH_UNDERGROUND[2],
		];

		expect(roundTrip(progression)).toEqual(progression);
	});

	test("ignores stale settings of other format types", () => {
		const { brackets, progression } = defaultBracketsFormValues();
		const withStaleSettings = [
			{ ...brackets[0], hasAbDivisions: true, earlyAdvance: true },
		];

		const validated = Progression.validatedBrackets(
			formValuesToInputBrackets(withStaleSettings, progression),
		);

		expect(validated).toEqual([
			{
				name: "Main Bracket",
				type: "double_elimination",
				settings: {},
				requiresCheckIn: false,
			},
		]);
	});

	test("ignores placements and check-in of a bracket sourcing from sign-up", () => {
		const formValues = progressionToFormValues(RR_TO_SE_WITH_UNDERGROUND);
		formValues.progression[2] = {
			...formValues.progression[2],
			source: "SIGN_UP",
		};

		const validated = Progression.validatedBrackets(
			formValuesToInputBrackets(formValues.brackets, formValues.progression),
		);

		expect(Progression.isBrackets(validated)).toBe(true);
		expect((validated as Progression.ParsedBracket[])[2]).toMatchObject({
			sources: undefined,
			requiresCheckIn: false,
		});
	});
});

describe("validateBracketProgressionFormValues", () => {
	test("accepts the default form values", () => {
		expect(validationIssues(defaultBracketsFormValues())).toHaveLength(0);
	});

	test("attaches unparseable placements to the progression entry", () => {
		const formValues = progressionToFormValues(RR_TO_SE_WITH_UNDERGROUND);
		formValues.progression[1] = {
			...formValues.progression[1],
			sources: [{ bracketIdx: "0", placements: "not placements" }],
		};

		const issues = validationIssues(formValues);

		expect(issues).toHaveLength(1);
		expect(issues[0].path).toEqual(["progression", 1, "sources"]);
		expect(issues[0].message).toBe(
			"tournament:progression.error.PLACEMENTS_PARSE_ERROR",
		);
	});

	test("attaches a duplicate bracket name to both name fields", () => {
		const formValues = progressionToFormValues(RR_TO_SE_WITH_UNDERGROUND);
		formValues.brackets[2] = { ...formValues.brackets[2], name: "Top cut" };

		const issues = validationIssues(formValues);

		expect(issues.map((issue) => issue.path)).toEqual([
			["brackets", 1, "name"],
			["brackets", 2, "name"],
		]);
	});

	test("rejects an out of range source bracket", () => {
		const formValues = progressionToFormValues(RR_TO_SE_WITH_UNDERGROUND);
		formValues.progression[1] = {
			...formValues.progression[1],
			sources: [{ bracketIdx: "10", placements: "1,2" }],
		};

		const issues = validationIssues(formValues);

		expect(issues).toHaveLength(1);
		expect(issues[0].path).toEqual([
			"progression",
			1,
			"sources",
			0,
			"bracketIdx",
		]);
	});

	test("rejects a non-canonical source bracket idx string", () => {
		const formValues = progressionToFormValues(RR_TO_SE_WITH_UNDERGROUND);
		formValues.progression[1] = {
			...formValues.progression[1],
			sources: [{ bracketIdx: "00", placements: "1,2" }],
		};

		const issues = validationIssues(formValues);

		expect(issues).toHaveLength(1);
		expect(issues[0].path).toEqual([
			"progression",
			1,
			"sources",
			0,
			"bracketIdx",
		]);
	});

	test("rejects a bracket sourcing itself", () => {
		const formValues = progressionToFormValues(RR_TO_SE_WITH_UNDERGROUND);
		formValues.progression[1] = {
			...formValues.progression[1],
			sources: [{ bracketIdx: "1", placements: "1,2" }],
		};

		const issues = validationIssues(formValues);

		expect(issues).toHaveLength(1);
		expect(issues[0].path).toEqual([
			"progression",
			1,
			"sources",
			0,
			"bracketIdx",
		]);
	});

	test("rejects the same source bracket twice for one bracket", () => {
		const formValues = progressionToFormValues(RR_TO_SE_WITH_UNDERGROUND);
		formValues.progression[1] = {
			...formValues.progression[1],
			sources: [
				{ bracketIdx: "0", placements: "1,2" },
				{ bracketIdx: "0", placements: "3,4" },
			],
		};

		const issues = validationIssues(formValues);

		expect(issues).toHaveLength(1);
		expect(issues[0].path).toEqual(["progression", 1, "sources"]);
		expect(issues[0].message).toBe(
			"tournament:progression.error.DUPLICATE_SOURCE_BRACKET",
		);
	});
});
