import { describe, expect, test } from "vitest";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { resolveMapList } from "./mapList.server";

const TEAM_ONE_ID = 1;
const TEAM_TWO_ID = 2;

const map = (mode: ModeShort, stageId: StageId) => ({ mode, stageId });

const teamOnePicks = [
	map("SZ", 4),
	map("SZ", 5),
	map("TC", 5),
	map("TC", 6),
	map("RM", 7),
	map("RM", 8),
	map("CB", 9),
	map("CB", 10),
];
const teamTwoPicks = [
	map("SZ", 11),
	map("SZ", 9),
	map("TC", 2),
	map("TC", 8),
	map("RM", 7),
	map("RM", 1),
	map("CB", 2),
	map("CB", 3),
];
const organizerList = [map("SZ", 1), map("TC", 2), map("RM", 3)];

type ResolveArgs = Parameters<typeof resolveMapList>[0];

const pickedByEitherTeam = (candidate: { mode: ModeShort; stageId: StageId }) =>
	[...teamOnePicks, ...teamTwoPicks].some(
		(pick) =>
			pick.mode === candidate.mode && pick.stageId === candidate.stageId,
	);

/** The resolved list is cached per match, so every test resolving a fresh list names its own match. */
const resolve = ({
	matchId,
	...overrides
}: Partial<ResolveArgs> & { matchId: number }) =>
	resolveMapList({
		tournamentId: 1,
		matchId,
		mapPickingStyle: "AUTO",
		teams: [TEAM_ONE_ID, TEAM_TWO_ID],
		mapPoolByTeamId: (teamId) =>
			teamId === TEAM_ONE_ID ? teamOnePicks : teamTwoPicks,
		maps: { count: 3, type: "BEST_OF" },
		pool: SENDOUQ_MAP_POOL,
		modesIncluded: [...rankedModesShort],
		pickBanEvents: [],
		...overrides,
	});

describe("resolveMapList", () => {
	test("organizer picked round returns the round's list with the organizer as the source", () => {
		expect(
			resolve({
				matchId: 1,
				mapPickingStyle: "TO",
				maps: { count: 3, type: "BEST_OF", list: organizerList },
			}),
		).toEqual(
			organizerList.map((pick) => ({
				...pick,
				source: "TO",
				bannedByTournamentTeamId: undefined,
			})),
		);
	});

	test("organizer picked round without a list is empty", () => {
		expect(resolve({ matchId: 2, mapPickingStyle: "TO" })).toEqual([]);
	});

	test("team picked round is generated from both teams' picks", () => {
		const mapList = resolve({ matchId: 3 });

		expect(mapList).toHaveLength(3);
		expect(new Set(mapList.map((m) => m.mode)).size).toBe(3);
		for (const resolved of mapList) {
			expect([TEAM_ONE_ID, TEAM_TWO_ID, "BOTH", "RANDOM"]).toContain(
				resolved.source,
			);
			expect(
				pickedByEitherTeam(resolved) || SENDOUQ_MAP_POOL.has(resolved),
			).toBe(true);
		}
	});

	test("team picked round follows the round's mode order", () => {
		const mapList = resolve({
			matchId: 4,
			maps: { count: 3, type: "BEST_OF", modes: ["CB", "SZ", "TC"] },
		});

		expect(mapList.map((m) => m.mode)).toEqual(["CB", "SZ", "TC"]);
	});

	test("the same match resolves to the same list every time", () => {
		expect(resolve({ matchId: 5 })).toEqual(resolve({ matchId: 5 }));
	});

	test("BAN_2 round has two extra maps, the bans attributed to the banning teams", () => {
		const maps = { count: 3, type: "BEST_OF", pickBan: "BAN_2" } as const;
		const beforeBans = resolve({ matchId: 6, maps });

		expect(beforeBans).toHaveLength(5);
		expect(
			beforeBans.every((m) => m.bannedByTournamentTeamId === undefined),
		).toBe(true);

		const afterBans = resolve({
			matchId: 6,
			maps,
			pickBanEvents: [
				{
					type: "BAN",
					mode: beforeBans[0].mode,
					stageId: beforeBans[0].stageId,
				},
				{
					type: "BAN",
					mode: beforeBans[1].mode,
					stageId: beforeBans[1].stageId,
				},
			],
		});

		// the team picking second bans first
		expect(afterBans[0].bannedByTournamentTeamId).toBe(TEAM_TWO_ID);
		expect(afterBans[1].bannedByTournamentTeamId).toBe(TEAM_ONE_ID);
		expect(
			afterBans.slice(2).every((m) => m.bannedByTournamentTeamId === undefined),
		).toBe(true);
	});

	test("counterpick round starts with one map of the round's first mode and appends the picks", () => {
		const mapList = resolve({
			matchId: 7,
			maps: {
				count: 5,
				type: "BEST_OF",
				pickBan: "COUNTERPICK",
				modes: ["RM", "SZ", "TC", "CB", "RM"],
			},
			pickBanEvents: [{ type: "PICK", mode: "SZ", stageId: 1 }],
		});

		expect(mapList).toHaveLength(2);
		expect(mapList[0].mode).toBe("RM");
		expect(mapList[1]).toEqual({
			mode: "SZ",
			stageId: 1,
			source: "COUNTERPICK",
			bannedByTournamentTeamId: undefined,
		});
	});

	test("custom flow lists the rolls and picks of the events in order", () => {
		const mapList = resolve({
			matchId: 8,
			maps: { count: 3, type: "BEST_OF", pickBan: "CUSTOM" },
			pickBanEvents: [
				{ type: "ROLL", mode: "SZ", stageId: 1 },
				{ type: "BAN", mode: "RM", stageId: 3 },
				{ type: "PICK", mode: "TC", stageId: 2 },
			],
		});

		expect(mapList).toEqual([
			{
				mode: "SZ",
				stageId: 1,
				source: "ROLL",
				bannedByTournamentTeamId: undefined,
			},
			{
				mode: "TC",
				stageId: 2,
				source: "COUNTERPICK",
				bannedByTournamentTeamId: undefined,
			},
		]);
	});

	test("without either team's picks the list is random maps of the pool", () => {
		const mapList = resolve({ matchId: 9, mapPoolByTeamId: () => [] });

		expect(mapList).toHaveLength(3);
		expect(new Set(mapList.map((m) => m.stageId)).size).toBe(3);
		for (const resolved of mapList) {
			expect(resolved.source).toBe("RANDOM");
			expect(SENDOUQ_MAP_POOL.has(resolved)).toBe(true);
		}
	});

	test("random maps are limited to the tournament's pool and modes", () => {
		const pool = new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1, 2, 3, 4, 5] });

		const mapList = resolve({
			matchId: 10,
			mapPoolByTeamId: () => [],
			pool,
			modesIncluded: ["SZ"],
		});

		expect(mapList).toHaveLength(3);
		for (const resolved of mapList) {
			expect(resolved.mode).toBe("SZ");
			expect(pool.has(resolved)).toBe(true);
		}
	});
});
