import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as CoachFilters from "../../core/CoachFilters";
import type {
	ScannerMatch,
	ScannerMatchPlayer,
} from "../../core/scanner-match";

function player(name: string | null, weaponId: MainWeaponId | null) {
	return {
		name,
		weaponId,
		paint: null,
		ka: null,
		d: null,
		s: null,
	} satisfies ScannerMatchPlayer;
}

/** a results-screen game won by `teams[0]`, the POV player in its first seat */
function match(overrides: Partial<ScannerMatch> = {}): ScannerMatch {
	return {
		startsAt: 0,
		endsAt: 300,
		playedAt: null,
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 1,
		matchScores: [100, 0],
		replayCode: null,
		cast: false,
		objective: null,
		playerStatus: null,
		kills: [],
		teams: [
			{ players: [player("Me", 40), player("Mate", 10)] },
			{ players: [player("Foe", 200), player("Rival", 10)] },
		],
		winner: 0,
		pov: { team: 0, index: 0 },
		...overrides,
	};
}

const filters = (patch: Partial<CoachFilters.Filters>) => ({
	...CoachFilters.DEFAULT_FILTERS,
	...patch,
});

describe("CoachFilters.passes", () => {
	test.each([
		{ why: "no filters", patch: {}, expected: true },
		{
			why: "same match type",
			patch: { lobby: "PRIVATE" as const },
			expected: true,
		},
		{
			why: "other match type",
			patch: { lobby: "X" as const },
			expected: false,
		},
		{ why: "same mode", patch: { mode: "SZ" as const }, expected: true },
		{ why: "other mode", patch: { mode: "TC" as const }, expected: false },
		{ why: "other stage", patch: { stage: 2 as const }, expected: false },
		{ why: "knockout", patch: { knockout: true }, expected: true },
		{ why: "played to time", patch: { knockout: false }, expected: false },
		{ why: "own team weapon", patch: { friendlyWeapon: 40 }, expected: true },
		{
			why: "enemy weapon as team weapon",
			patch: { friendlyWeapon: 200 },
			expected: false,
		},
		{ why: "enemy weapon", patch: { enemyWeapon: 200 }, expected: true },
		{ why: "teammate", patch: { friendlyName: "Mate" }, expected: true },
		{ why: "name ignores case", patch: { enemyName: "foe" }, expected: true },
		{
			why: "enemy as teammate",
			patch: { friendlyName: "Foe" },
			expected: false,
		},
	] satisfies Array<{
		why: string;
		patch: Partial<CoachFilters.Filters>;
		expected: boolean;
	}>)("$why", ({ patch, expected }) => {
		expect(CoachFilters.passes(match(), filters(patch))).toBe(expected);
	});

	test("a game without a POV team fails side filters", () => {
		const cast = match({ cast: true, pov: null });

		expect(CoachFilters.passes(cast, filters({ enemyWeapon: 200 }))).toBe(
			false,
		);
		expect(CoachFilters.passes(cast, filters({ mode: "SZ" }))).toBe(true);
	});

	test("a game with no score read fails the ending filter", () => {
		const unscored = match({ matchScores: null });

		expect(CoachFilters.passes(unscored, filters({ knockout: true }))).toBe(
			false,
		);
		expect(CoachFilters.passes(unscored, filters({ knockout: false }))).toBe(
			false,
		);
	});
});

describe("CoachFilters.knockoutOf", () => {
	test("reads a knockout off the objective counter running out", () => {
		const objectiveKnockout = match({
			matchScores: null,
			objective: {
				mode: "SZ",
				samples: [
					{
						t: 10,
						time: 200,
						score: [0, 60],
						penalty: [null, null],
						control: 0,
					},
				],
			},
		});

		expect(CoachFilters.knockoutOf(objectiveKnockout)).toBe(true);
	});

	test("a game played to time is not a knockout", () => {
		expect(CoachFilters.knockoutOf(match({ matchScores: [62, 41] }))).toBe(
			false,
		);
	});
});

describe("CoachFilters.options", () => {
	test("lists each side's values, leaving out the POV player's own name", () => {
		const options = CoachFilters.options([
			match(),
			match({
				lobby: "X",
				mode: "TC",
				teams: [
					{ players: [player("Me", 40), player("MATE", 50)] },
					{ players: [player("Other", 200)] },
				],
			}),
		]);

		expect(options).toEqual({
			lobbies: ["X", "PRIVATE"],
			modes: ["SZ", "TC"],
			stages: [1],
			friendlyWeapons: [10, 40, 50],
			enemyWeapons: [10, 200],
			friendlyNames: ["Mate"],
			enemyNames: ["Foe", "Other", "Rival"],
		});
	});
});
