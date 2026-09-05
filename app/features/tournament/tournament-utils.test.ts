import { describe, expect, test } from "vitest";
import type { CastedMatchesInfo } from "~/db/tables-json";
import * as Seasons from "../mmr/core/Seasons";
import type { ParsedBracket } from "../tournament-bracket/core/Progression";
import { testTournament } from "../tournament-bracket/core/tests/test-utils";
import {
	bracketProgressionLabel,
	compareTeamsForOrdering,
	findTeamInsertPosition,
	getBracketProgressionLabel,
	sortTeamsBySeeding,
	splitTournamentName,
	type TeamForOrdering,
	tournamentInWeaponReportingWindow,
	tournamentNameParts,
	updatedCastedMatchesInfo,
} from "./tournament-utils";

const teamForOrdering = (
	id: number,
	options: {
		seed?: number | null;
		members?: number;
		avgSeedingSkillOrdinal?: number | null;
		createdAt?: number;
		startingBracketIdx?: number | null;
	} = {},
): TeamForOrdering => ({
	id,
	seed: options.seed ?? null,
	memberUserIds: { length: options.members ?? 4 },
	avgSeedingSkillOrdinal:
		options.avgSeedingSkillOrdinal === undefined
			? 100
			: options.avgSeedingSkillOrdinal,
	createdAt: options.createdAt ?? id,
	startingBracketIdx: options.startingBracketIdx ?? null,
});

const MIN_MEMBERS = 4;

/** Every ordering rule as `sortTeamsBySeeding` output; `compareTeamsForOrdering` is only checked for antisymmetry over the same rows. */
const ORDERING_RULES: {
	rule: string;
	teams: TeamForOrdering[];
	expectedIds: number[];
}[] = [
	{
		rule: "the starting bracket decides before skill does",
		teams: [
			teamForOrdering(1, {
				startingBracketIdx: 1,
				avgSeedingSkillOrdinal: 500,
			}),
			teamForOrdering(2, {
				startingBracketIdx: 0,
				avgSeedingSkillOrdinal: 100,
			}),
			teamForOrdering(3, {
				startingBracketIdx: 0,
				avgSeedingSkillOrdinal: 200,
			}),
		],
		expectedIds: [3, 2, 1],
	},
	{
		rule: "an unset starting bracket is the same as bracket 0",
		teams: [
			teamForOrdering(1, { seed: 1, startingBracketIdx: null }),
			teamForOrdering(2, { seed: 2, startingBracketIdx: 0 }),
		],
		expectedIds: [1, 2],
	},
	{
		rule: "two seeded teams go in seed order",
		teams: [teamForOrdering(1, { seed: 1 }), teamForOrdering(2, { seed: 2 })],
		expectedIds: [1, 2],
	},
	{
		rule: "seeded teams keep their order while an unseeded one slots in by skill",
		teams: [
			teamForOrdering(1, { seed: 2 }),
			teamForOrdering(2, { seed: 1 }),
			teamForOrdering(3, { avgSeedingSkillOrdinal: 500 }),
		],
		expectedIds: [3, 2, 1],
	},
	{
		rule: "a full team goes before a not-full one",
		teams: [
			teamForOrdering(1, { members: 4 }),
			teamForOrdering(2, { members: 3 }),
		],
		expectedIds: [1, 2],
	},
	{
		rule: "a seeded team goes before an unseeded one of equal skill",
		teams: [teamForOrdering(1, { seed: 5 }), teamForOrdering(2)],
		expectedIds: [1, 2],
	},
	{
		rule: "an unseeded team of higher skill goes before a lower-skilled seeded one",
		teams: [
			teamForOrdering(1, { seed: 5, avgSeedingSkillOrdinal: 100 }),
			teamForOrdering(2, { avgSeedingSkillOrdinal: 300 }),
		],
		expectedIds: [2, 1],
	},
	{
		rule: "a seeded team goes before a not-full unseeded one however high its skill",
		teams: [
			teamForOrdering(1, { seed: 5, avgSeedingSkillOrdinal: 100 }),
			teamForOrdering(2, { members: 3, avgSeedingSkillOrdinal: 500 }),
		],
		expectedIds: [1, 2],
	},
	{
		rule: "higher skill goes first when neither team is seeded",
		teams: [
			teamForOrdering(1, { avgSeedingSkillOrdinal: 300 }),
			teamForOrdering(2, { avgSeedingSkillOrdinal: 100 }),
		],
		expectedIds: [1, 2],
	},
	{
		rule: "a rated team goes before an unrated one",
		teams: [
			teamForOrdering(1, { avgSeedingSkillOrdinal: 100 }),
			teamForOrdering(2, { avgSeedingSkillOrdinal: null }),
		],
		expectedIds: [1, 2],
	},
	{
		rule: "a rated team goes before an unrated one that registered earlier",
		teams: [
			teamForOrdering(2, { avgSeedingSkillOrdinal: null, createdAt: 100 }),
			teamForOrdering(1, { avgSeedingSkillOrdinal: 100, createdAt: 200 }),
		],
		expectedIds: [1, 2],
	},
	{
		rule: "registration time breaks a tie",
		teams: [
			teamForOrdering(1, { createdAt: 100 }),
			teamForOrdering(2, { createdAt: 200 }),
		],
		expectedIds: [1, 2],
	},
];

describe("compareTeamsForOrdering", () => {
	test.each(ORDERING_RULES)("is antisymmetric where $rule", ({ teams }) => {
		for (const a of teams) {
			for (const b of teams) {
				expect(
					Math.sign(compareTeamsForOrdering(a, b, MIN_MEMBERS)) +
						Math.sign(compareTeamsForOrdering(b, a, MIN_MEMBERS)),
				).toBe(0);
			}
		}
	});
});

describe("sortTeamsBySeeding", () => {
	test.each(ORDERING_RULES)("$rule", ({ teams, expectedIds }) => {
		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((team) => team.id)).toEqual(expectedIds);
	});

	test("sorts teams correctly with mixed properties", () => {
		const teams = [
			teamForOrdering(1, { members: 3, avgSeedingSkillOrdinal: 500 }),
			teamForOrdering(2, { seed: 2 }),
			teamForOrdering(3, { avgSeedingSkillOrdinal: 300 }),
			teamForOrdering(4, { seed: 1 }),
			teamForOrdering(5, { avgSeedingSkillOrdinal: 400 }),
			teamForOrdering(6, { members: 3 }),
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((t) => t.id)).toEqual([5, 3, 4, 2, 1, 6]);
	});

	test("keeps manually seeded teams in seed order when unseeded teams are present", () => {
		const seededSkills = [31, 18, 20, 37, 2, 46, 19, 37];
		const seededTeams = seededSkills.map((skill, i) =>
			teamForOrdering(i + 1, { seed: i + 1, avgSeedingSkillOrdinal: skill }),
		);
		// input mirrors the DB query order (seed ASC = NULL seeds first in SQLite)
		const teams = [
			teamForOrdering(9, { avgSeedingSkillOrdinal: 40 }),
			teamForOrdering(10, { avgSeedingSkillOrdinal: 31 }),
			...seededTeams,
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(
			sorted.filter((team) => team.seed !== null).map((team) => team.seed),
		).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	test("returns the same order regardless of input order", () => {
		const seedOne = teamForOrdering(1, { seed: 1, avgSeedingSkillOrdinal: 5 });
		const seedTwo = teamForOrdering(2, { seed: 2, avgSeedingSkillOrdinal: 30 });
		const seedThree = teamForOrdering(3, {
			seed: 3,
			avgSeedingSkillOrdinal: 20,
		});
		const seedFour = teamForOrdering(4, {
			seed: 4,
			avgSeedingSkillOrdinal: 25,
		});
		const unseeded = teamForOrdering(5, { avgSeedingSkillOrdinal: 28 });

		const sortedA = sortTeamsBySeeding(
			[seedOne, seedTwo, seedThree, seedFour, unseeded],
			MIN_MEMBERS,
		);
		const sortedB = sortTeamsBySeeding(
			[seedOne, seedThree, seedFour, unseeded, seedTwo],
			MIN_MEMBERS,
		);

		expect(sortedA.map((team) => team.id)).toEqual(
			sortedB.map((team) => team.id),
		);
	});

	test("slots an unseeded team below every seeded team with a higher skill ordinal", () => {
		const seedOne = teamForOrdering(1, { seed: 1, avgSeedingSkillOrdinal: 5 });
		const seedTwo = teamForOrdering(2, { seed: 2, avgSeedingSkillOrdinal: 30 });
		const unseeded = teamForOrdering(5, { avgSeedingSkillOrdinal: 28 });

		const sorted = sortTeamsBySeeding(
			[unseeded, seedOne, seedTwo],
			MIN_MEMBERS,
		);

		expect(sorted.map((team) => team.id)).toEqual([1, 2, 5]);
	});

	test("does not mutate original array", () => {
		const teams = [
			teamForOrdering(2, { avgSeedingSkillOrdinal: 100 }),
			teamForOrdering(1, { avgSeedingSkillOrdinal: 200 }),
		];

		sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(teams[0].id).toBe(2);
	});
});

describe("findTeamInsertPosition", () => {
	test("inserts at beginning when new team should be first", () => {
		const team1 = teamForOrdering(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = teamForOrdering(2, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
		]);
		const existingOrder = [2, 1];
		const newTeam = teamForOrdering(3, { avgSeedingSkillOrdinal: 300 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(0);
	});

	test("inserts at end when new team should be last", () => {
		const team1 = teamForOrdering(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = teamForOrdering(2, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
		]);
		const existingOrder = [2, 1];
		const newTeam = teamForOrdering(3, { avgSeedingSkillOrdinal: 50 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(2);
	});

	test("inserts in middle based on comparison", () => {
		const team1 = teamForOrdering(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = teamForOrdering(2, { avgSeedingSkillOrdinal: 300 });
		const team3 = teamForOrdering(3, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
			[3, team3],
		]);
		const existingOrder = [2, 3, 1];
		const newTeam = teamForOrdering(4, { avgSeedingSkillOrdinal: 150 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(2);
	});

	test("handles empty existing order", () => {
		const teamMap = new Map<number, TeamForOrdering>();
		const existingOrder: number[] = [];
		const newTeam = teamForOrdering(1, { avgSeedingSkillOrdinal: 100 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(0);
	});

	test("skips missing teams in map", () => {
		const team1 = teamForOrdering(1, { avgSeedingSkillOrdinal: 100 });
		const teamMap = new Map([[1, team1]]);
		const existingOrder = [2, 1];
		const newTeam = teamForOrdering(3, { avgSeedingSkillOrdinal: 150 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(1);
	});
});

const createBracket = (name: string): ParsedBracket => ({
	name,
	type: "single_elimination",
	settings: {},
	requiresCheckIn: false,
});

describe("getBracketProgressionLabel", () => {
	test("returns single bracket name when only one bracket is reachable", () => {
		const progression: ParsedBracket[] = [createBracket("Main Bracket")];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Main Bracket");
	});

	test("returns common prefix when multiple brackets share a prefix", () => {
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

	test("trims whitespace from common prefix", () => {
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

	test("returns deepest bracket name when no common prefix exists", () => {
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

	test("handles single character prefix", () => {
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

	test("handles bracket progression with multiple levels", () => {
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

	test("returns bracket name for progression with partial common prefix", () => {
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

	test("handles empty string prefix by returning deepest bracket", () => {
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

const emptyCastedMatchesInfo = (): CastedMatchesInfo => ({
	castedMatches: [],
	lockedMatches: [],
	castedMatchHistory: [],
});

describe("updatedCastedMatchesInfo", () => {
	describe("assigning a cast", () => {
		test("adds entry to castedMatches and history", () => {
			const result = updatedCastedMatchesInfo(emptyCastedMatchesInfo(), {
				matchId: 1,
				twitchAccount: "streamer_a",
				timestamp: 1000,
			});

			expect(result.castedMatches).toEqual([
				{ twitchAccount: "streamer_a", matchId: 1 },
			]);
			expect(result.castedMatchHistory).toEqual([
				{ twitchAccount: "streamer_a", matchId: 1, timestamp: 1000 },
			]);
		});

		test("removes prior castedMatches entry for same matchId", () => {
			const current = emptyCastedMatchesInfo();
			current.castedMatches = [{ twitchAccount: "old_streamer", matchId: 1 }];

			const result = updatedCastedMatchesInfo(current, {
				matchId: 1,
				twitchAccount: "new_streamer",
				timestamp: 1000,
			});

			expect(result.castedMatches).toEqual([
				{ twitchAccount: "new_streamer", matchId: 1 },
			]);
		});

		test("removes prior castedMatches entry for same twitchAccount", () => {
			const current = emptyCastedMatchesInfo();
			current.castedMatches = [{ twitchAccount: "streamer_a", matchId: 1 }];

			const result = updatedCastedMatchesInfo(current, {
				matchId: 2,
				twitchAccount: "streamer_a",
				timestamp: 1000,
			});

			expect(result.castedMatches).toEqual([
				{ twitchAccount: "streamer_a", matchId: 2 },
			]);
		});

		test("removes matchId from lockedMatches", () => {
			const current = emptyCastedMatchesInfo();
			current.lockedMatches = [
				{ twitchAccount: "streamer_a", matchId: 1 },
				{ twitchAccount: "streamer_b", matchId: 2 },
			];

			const result = updatedCastedMatchesInfo(current, {
				matchId: 1,
				twitchAccount: "streamer_a",
				timestamp: 1000,
			});

			expect(result.lockedMatches).toEqual([
				{ twitchAccount: "streamer_b", matchId: 2 },
			]);
		});

		test("deduplicates history by matchId when channel is corrected", () => {
			const current = emptyCastedMatchesInfo();
			current.castedMatchHistory = [
				{ twitchAccount: "wrong_channel", matchId: 1, timestamp: 500 },
				{ twitchAccount: "other_streamer", matchId: 2, timestamp: 600 },
			];

			const result = updatedCastedMatchesInfo(current, {
				matchId: 1,
				twitchAccount: "correct_channel",
				timestamp: 1000,
			});

			expect(result.castedMatchHistory).toEqual([
				{ twitchAccount: "other_streamer", matchId: 2, timestamp: 600 },
				{ twitchAccount: "correct_channel", matchId: 1, timestamp: 1000 },
			]);
		});

		test("deduplicates history when same account+matchId is reassigned", () => {
			const current = emptyCastedMatchesInfo();
			current.castedMatchHistory = [
				{ twitchAccount: "streamer_a", matchId: 1, timestamp: 500 },
			];

			const result = updatedCastedMatchesInfo(current, {
				matchId: 1,
				twitchAccount: "streamer_a",
				timestamp: 1000,
			});

			expect(result.castedMatchHistory).toEqual([
				{ twitchAccount: "streamer_a", matchId: 1, timestamp: 1000 },
			]);
		});

		test("initializes history when undefined", () => {
			const current: CastedMatchesInfo = {
				castedMatches: [],
				lockedMatches: [],
			};

			const result = updatedCastedMatchesInfo(current, {
				matchId: 1,
				twitchAccount: "streamer_a",
				timestamp: 1000,
			});

			expect(result.castedMatchHistory).toEqual([
				{ twitchAccount: "streamer_a", matchId: 1, timestamp: 1000 },
			]);
		});
	});

	describe("unassigning a cast", () => {
		test("removes matchId from castedMatches and lockedMatches", () => {
			const current = emptyCastedMatchesInfo();
			current.castedMatches = [
				{ twitchAccount: "streamer_a", matchId: 1 },
				{ twitchAccount: "streamer_b", matchId: 2 },
			];
			current.lockedMatches = [{ twitchAccount: "streamer_a", matchId: 1 }];

			const result = updatedCastedMatchesInfo(current, {
				matchId: 1,
				twitchAccount: null,
				timestamp: 1000,
			});

			expect(result.castedMatches).toEqual([
				{ twitchAccount: "streamer_b", matchId: 2 },
			]);
			expect(result.lockedMatches).toEqual([]);
		});

		test("does not modify castedMatchHistory", () => {
			const current = emptyCastedMatchesInfo();
			current.castedMatchHistory = [
				{ twitchAccount: "streamer_a", matchId: 1, timestamp: 500 },
			];

			const result = updatedCastedMatchesInfo(current, {
				matchId: 1,
				twitchAccount: null,
				timestamp: 1000,
			});

			expect(result.castedMatchHistory).toEqual([
				{ twitchAccount: "streamer_a", matchId: 1, timestamp: 500 },
			]);
		});
	});
});

describe("tournamentInWeaponReportingWindow", () => {
	const anchorSeason = Seasons.list[2]!;
	const previousSeason = Seasons.list[1]!;

	const dateInside = (range: { starts: Date; ends: Date }) =>
		new Date((range.starts.getTime() + range.ends.getTime()) / 2);

	const inSeasonNow = dateInside(anchorSeason);
	const offSeasonNow = new Date(
		(previousSeason.ends.getTime() + anchorSeason.starts.getTime()) / 2,
	);

	test("allows tournaments started in the off-season before current season (in-season)", () => {
		expect(
			tournamentInWeaponReportingWindow({
				tournamentStartTime: offSeasonNow,
				now: inSeasonNow,
			}),
		).toBe(true);
	});

	test("rejects tournaments started before the previous season ended (in-season)", () => {
		expect(
			tournamentInWeaponReportingWindow({
				tournamentStartTime: dateInside(previousSeason),
				now: inSeasonNow,
			}),
		).toBe(false);
	});

	test("allows tournaments started during the previous season (off-season)", () => {
		expect(
			tournamentInWeaponReportingWindow({
				tournamentStartTime: dateInside(previousSeason),
				now: offSeasonNow,
			}),
		).toBe(true);
	});
});

describe("splitTournamentName", () => {
	const series = [{ name: "In The Zone" }, { name: "Low Ink" }];

	test("splits the trailing number subtext after the series name", () => {
		expect(splitTournamentName("In The Zone 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	test("splits a non-numeric subtext after the series name", () => {
		expect(splitTournamentName("Low Ink May 2026", series)).toEqual({
			name: "Low Ink",
			subtext: "May 2026",
		});
	});

	test("matches the series name case-insensitively", () => {
		expect(splitTournamentName("in the zone 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	test("strips separators between the series name and the subtext", () => {
		expect(splitTournamentName("In The Zone - 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	test("trims trailing whitespace after the subtext", () => {
		expect(splitTournamentName("In The Zone 54 ", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	test("returns name only when the name does not start with a series name", () => {
		expect(splitTournamentName("Picnic Weekly", series)).toEqual({
			name: "Picnic Weekly",
		});
	});

	test("returns name only when the name equals the series name", () => {
		expect(splitTournamentName("In The Zone", series)).toEqual({
			name: "In The Zone",
		});
	});

	test("returns name only when there are no series", () => {
		expect(splitTournamentName("In The Zone 54", [])).toEqual({
			name: "In The Zone 54",
		});
	});

	test("prefers the longest matching series name", () => {
		expect(
			splitTournamentName("In The Zone Masters 5", [
				{ name: "In The Zone" },
				{ name: "In The Zone Masters" },
			]),
		).toEqual({
			name: "In The Zone Masters",
			subtext: "5",
		});
	});
});

describe("tournamentNameParts", () => {
	test("splits the name by the organization series", () => {
		const tournament = testTournament({
			ctx: {
				name: "In The Zone 54",
				organization: {
					id: 1,
					name: "Sendou's Tournaments",
					slug: "sendou",
					isEstablished: 1,
					logoUrl: null,
					members: [],
					series: [{ name: "In The Zone" }],
				},
			},
		});

		expect(tournamentNameParts(tournament)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});
});

describe("bracketProgressionLabel", () => {
	const bracket = (
		bracket: Partial<ParsedBracket> & Pick<ParsedBracket, "type">,
	): ParsedBracket => ({
		name: bracket.type,
		requiresCheckIn: false,
		settings: {},
		...bracket,
	});

	test("returns the short code for a single stage", () => {
		expect(
			bracketProgressionLabel([bracket({ type: "single_elimination" })]),
		).toEqual({ label: "SE", hasUnderground: false });
	});

	test("joins stages with an arrow", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "round_robin" }),
				bracket({ type: "single_elimination" }),
			]),
		).toEqual({ label: "RR → SE", hasUnderground: false });
	});

	test("collapses consecutive duplicate stages", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "single_elimination" }),
				bracket({ type: "single_elimination" }),
				bracket({ type: "double_elimination" }),
			]),
		).toEqual({ label: "SE → DE", hasUnderground: false });
	});

	test("leaves an underground bracket out of the label", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "double_elimination" }),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [-1] }],
				}),
			]),
		).toEqual({ label: "DE", hasUnderground: true });
	});

	test("flags many underground brackets the same as one", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "swiss" }),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [1, 2, 3, 4] }],
				}),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [5] }],
				}),
				bracket({
					type: "double_elimination",
					sources: [{ bracketIdx: 0, placements: [6] }],
				}),
			]),
		).toEqual({ label: "SW → SE", hasUnderground: true });
	});

	test("describes divisions leading to the same shape once", () => {
		const division = (idx: number) => [
			bracket({ type: "round_robin", name: `Division ${idx}` }),
			bracket({
				type: "single_elimination",
				name: `Division ${idx} Playoffs`,
				sources: [{ bracketIdx: idx * 2, placements: [1, 2] }],
			}),
		];

		expect(
			bracketProgressionLabel([...division(0), ...division(1), ...division(2)]),
		).toEqual({ label: "RR → SE", hasUnderground: false });
	});

	test("describes every starting bracket when they lead to different shapes", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "round_robin" }),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [1, 2] }],
				}),
				bracket({ type: "swiss" }),
				bracket({
					type: "double_elimination",
					sources: [{ bracketIdx: 2, placements: [1, 2] }],
				}),
			]),
		).toEqual({ label: "RR → SE → SW → DE", hasUnderground: false });
	});

	test("returns empty label for empty progression", () => {
		expect(bracketProgressionLabel([])).toEqual({
			label: "",
			hasUnderground: false,
		});
	});
});
