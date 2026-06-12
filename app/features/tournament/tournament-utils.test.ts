import { describe, expect, it } from "vitest";
import type { CastedMatchesInfo } from "~/db/tables";
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

const createTeam = (
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
	members: { length: options.members ?? 4 },
	avgSeedingSkillOrdinal:
		options.avgSeedingSkillOrdinal === undefined
			? 100
			: options.avgSeedingSkillOrdinal,
	createdAt: options.createdAt ?? id,
	startingBracketIdx: options.startingBracketIdx ?? null,
});

const MIN_MEMBERS = 4;

describe("compareTeamsForOrdering", () => {
	describe("full teams priority", () => {
		it("places full teams before not-full teams", () => {
			const fullTeam = createTeam(1, { members: 4 });
			const notFullTeam = createTeam(2, { members: 3 });

			const result = compareTeamsForOrdering(
				fullTeam,
				notFullTeam,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});

		it("places not-full teams after full teams", () => {
			const notFullTeam = createTeam(1, { members: 3 });
			const fullTeam = createTeam(2, { members: 4 });

			const result = compareTeamsForOrdering(
				notFullTeam,
				fullTeam,
				MIN_MEMBERS,
			);

			expect(result).toBeGreaterThan(0);
		});
	});

	describe("seed priority", () => {
		it("orders by seed when both have seeds", () => {
			const team1 = createTeam(1, { seed: 1 });
			const team2 = createTeam(2, { seed: 2 });

			const result = compareTeamsForOrdering(team1, team2, MIN_MEMBERS);

			expect(result).toBeLessThan(0);
		});

		it("places seeded team before unseeded team when unseeded has no skill", () => {
			const seededTeam = createTeam(1, { seed: 5 });
			const unseededTeam = createTeam(2);

			const result = compareTeamsForOrdering(
				seededTeam,
				unseededTeam,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});

		it("compares by skill ordinal when both full teams have skill but only one has seed", () => {
			const seededLowSkill = createTeam(1, {
				seed: 5,
				avgSeedingSkillOrdinal: 100,
			});
			const unseededHighSkill = createTeam(2, { avgSeedingSkillOrdinal: 300 });

			const result = compareTeamsForOrdering(
				seededLowSkill,
				unseededHighSkill,
				MIN_MEMBERS,
			);

			expect(result).toBeGreaterThan(0);
		});

		it("places seeded team first when only seeded team has skill ordinal", () => {
			const seededWithSkill = createTeam(1, {
				seed: 5,
				avgSeedingSkillOrdinal: 100,
			});
			const unseededNoSkill = createTeam(2);

			const result = compareTeamsForOrdering(
				seededWithSkill,
				unseededNoSkill,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});

		it("places seeded team first when not-full team has higher skill", () => {
			const seededFull = createTeam(1, {
				seed: 5,
				avgSeedingSkillOrdinal: 100,
			});
			const unseededNotFull = createTeam(2, {
				members: 3,
				avgSeedingSkillOrdinal: 500,
			});

			const result = compareTeamsForOrdering(
				seededFull,
				unseededNotFull,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});
	});

	describe("skill ordinal priority", () => {
		it("orders by skill ordinal when no seeds (higher skill first)", () => {
			const highSkill = createTeam(1, { avgSeedingSkillOrdinal: 300 });
			const lowSkill = createTeam(2, { avgSeedingSkillOrdinal: 100 });

			const result = compareTeamsForOrdering(highSkill, lowSkill, MIN_MEMBERS);

			expect(result).toBeLessThan(0);
		});

		it("places team with skill before team without skill", () => {
			const withSkill = createTeam(1, { avgSeedingSkillOrdinal: 100 });
			const withoutSkill = createTeam(2, { avgSeedingSkillOrdinal: null });

			const result = compareTeamsForOrdering(
				withSkill,
				withoutSkill,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});

		it("places rated team before unrated team even when unrated was created earlier", () => {
			const rated = createTeam(1, {
				avgSeedingSkillOrdinal: 100,
				createdAt: 200,
			});
			const unrated = createTeam(2, {
				avgSeedingSkillOrdinal: null,
				createdAt: 100,
			});

			const sorted = sortTeamsBySeeding([unrated, rated], MIN_MEMBERS);

			expect(sorted.map((t) => t.id)).toEqual([1, 2]);
		});
	});

	describe("createdAt tiebreaker", () => {
		it("orders by createdAt when all else is equal", () => {
			const olderTeam = createTeam(1, { createdAt: 100 });
			const newerTeam = createTeam(2, { createdAt: 200 });

			const result = compareTeamsForOrdering(olderTeam, newerTeam, MIN_MEMBERS);

			expect(result).toBeLessThan(0);
		});
	});
});

describe("sortTeamsBySeeding", () => {
	it("sorts teams correctly with mixed properties", () => {
		const teams = [
			createTeam(1, { members: 3, avgSeedingSkillOrdinal: 500 }),
			createTeam(2, { seed: 2 }),
			createTeam(3, { avgSeedingSkillOrdinal: 300 }),
			createTeam(4, { seed: 1 }),
			createTeam(5, { avgSeedingSkillOrdinal: 400 }),
			createTeam(6, { members: 3 }),
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((t) => t.id)).toEqual([5, 3, 4, 2, 1, 6]);
	});

	it("does not mutate original array", () => {
		const teams = [
			createTeam(2, { avgSeedingSkillOrdinal: 100 }),
			createTeam(1, { avgSeedingSkillOrdinal: 200 }),
		];

		sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(teams[0].id).toBe(2);
	});
});

describe("findTeamInsertPosition", () => {
	it("inserts at beginning when new team should be first", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = createTeam(2, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
		]);
		const existingOrder = [2, 1];
		const newTeam = createTeam(3, { avgSeedingSkillOrdinal: 300 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(0);
	});

	it("inserts at end when new team should be last", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = createTeam(2, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
		]);
		const existingOrder = [2, 1];
		const newTeam = createTeam(3, { avgSeedingSkillOrdinal: 50 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(2);
	});

	it("inserts in middle based on comparison", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = createTeam(2, { avgSeedingSkillOrdinal: 300 });
		const team3 = createTeam(3, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
			[3, team3],
		]);
		const existingOrder = [2, 3, 1];
		const newTeam = createTeam(4, { avgSeedingSkillOrdinal: 150 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(2);
	});

	it("handles empty existing order", () => {
		const teamMap = new Map<number, TeamForOrdering>();
		const existingOrder: number[] = [];
		const newTeam = createTeam(1, { avgSeedingSkillOrdinal: 100 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(0);
	});

	it("skips missing teams in map", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const teamMap = new Map([[1, team1]]);
		const existingOrder = [2, 1];
		const newTeam = createTeam(3, { avgSeedingSkillOrdinal: 150 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(1);
	});
});

describe("sortTeamsBySeeding with startingBracketIdx", () => {
	it("orders by startingBracketIdx first", () => {
		const teams = [
			createTeam(1, {
				startingBracketIdx: 1,
				avgSeedingSkillOrdinal: 500,
			}),
			createTeam(2, {
				startingBracketIdx: 0,
				avgSeedingSkillOrdinal: 100,
			}),
			createTeam(3, {
				startingBracketIdx: 0,
				avgSeedingSkillOrdinal: 200,
			}),
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((t) => t.id)).toEqual([3, 2, 1]);
	});

	it("uses seeds within same bracket", () => {
		const teams = [
			createTeam(1, { seed: 2 }),
			createTeam(2, { seed: 1 }),
			createTeam(3, { avgSeedingSkillOrdinal: 500 }),
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((t) => t.id)).toEqual([3, 2, 1]);
	});
});

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

const emptyCastedMatchesInfo = (): CastedMatchesInfo => ({
	castedMatches: [],
	lockedMatches: [],
	castedMatchHistory: [],
});

describe("updatedCastedMatchesInfo", () => {
	describe("assigning a cast", () => {
		it("adds entry to castedMatches and history", () => {
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

		it("removes prior castedMatches entry for same matchId", () => {
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

		it("removes prior castedMatches entry for same twitchAccount", () => {
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

		it("removes matchId from lockedMatches", () => {
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

		it("deduplicates history by matchId when channel is corrected", () => {
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

		it("deduplicates history when same account+matchId is reassigned", () => {
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

		it("initializes history when undefined", () => {
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
		it("removes matchId from castedMatches and lockedMatches", () => {
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

		it("does not modify castedMatchHistory", () => {
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

	it("allows tournaments started in the off-season before current season (in-season)", () => {
		expect(
			tournamentInWeaponReportingWindow({
				tournamentStartTime: offSeasonNow,
				now: inSeasonNow,
			}),
		).toBe(true);
	});

	it("rejects tournaments started before the previous season ended (in-season)", () => {
		expect(
			tournamentInWeaponReportingWindow({
				tournamentStartTime: dateInside(previousSeason),
				now: inSeasonNow,
			}),
		).toBe(false);
	});

	it("allows tournaments started during the previous season (off-season)", () => {
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

	it("splits the trailing number subtext after the series name", () => {
		expect(splitTournamentName("In The Zone 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("splits a non-numeric subtext after the series name", () => {
		expect(splitTournamentName("Low Ink May 2026", series)).toEqual({
			name: "Low Ink",
			subtext: "May 2026",
		});
	});

	it("matches the series name case-insensitively", () => {
		expect(splitTournamentName("in the zone 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("strips separators between the series name and the subtext", () => {
		expect(splitTournamentName("In The Zone - 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("trims trailing whitespace after the subtext", () => {
		expect(splitTournamentName("In The Zone 54 ", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("returns name only when the name does not start with a series name", () => {
		expect(splitTournamentName("Picnic Weekly", series)).toEqual({
			name: "Picnic Weekly",
		});
	});

	it("returns name only when the name equals the series name", () => {
		expect(splitTournamentName("In The Zone", series)).toEqual({
			name: "In The Zone",
		});
	});

	it("returns name only when there are no series", () => {
		expect(splitTournamentName("In The Zone 54", [])).toEqual({
			name: "In The Zone 54",
		});
	});

	it("prefers the longest matching series name", () => {
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
	it("uses the parent tournament name and division subtext for a league division", () => {
		const tournament = testTournament({
			ctx: {
				name: "LUTI: Season 17 - Division 1",
				parentTournamentId: 1,
				parentTournamentName: "LUTI: Season 17",
			},
		});

		expect(tournamentNameParts(tournament)).toEqual({
			name: "LUTI: Season 17",
			subtext: "Division 1",
		});
	});

	it("falls back to the organization series when not a league division", () => {
		const tournament = testTournament({
			ctx: {
				name: "In The Zone 54",
				organization: {
					id: 1,
					name: "Sendou's Tournaments",
					slug: "sendou",
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

	it("returns the short code for a single stage", () => {
		expect(
			bracketProgressionLabel([bracket({ type: "single_elimination" })]),
		).toBe("SE");
	});

	it("joins stages with an arrow", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "round_robin" }),
				bracket({ type: "single_elimination" }),
			]),
		).toBe("RR → SE");
	});

	it("collapses consecutive duplicate stages", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "single_elimination" }),
				bracket({ type: "single_elimination" }),
				bracket({ type: "double_elimination" }),
			]),
		).toBe("SE → DE");
	});

	it("appends an underground bracket of a new type with a plus and (UG) tag", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "double_elimination" }),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [-1] }],
				}),
			]),
		).toBe("DE + SE (UG)");
	});

	it("collapses repeated underground brackets of an already-shown type", () => {
		expect(
			bracketProgressionLabel([
				bracket({ type: "round_robin" }),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [1] }],
				}),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [2] }],
				}),
				bracket({
					type: "single_elimination",
					sources: [{ bracketIdx: 0, placements: [3] }],
				}),
			]),
		).toBe("RR → SE (UG)");
	});

	it("returns empty string for empty progression", () => {
		expect(bracketProgressionLabel([])).toBe("");
	});
});
