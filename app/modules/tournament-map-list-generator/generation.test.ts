import { describe, expect, test } from "vitest";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { unwrap, unwrapErr } from "~/utils/result";
import { rankedModesShort } from "../in-game-lists/modes";
import type { RankedModeShort } from "../in-game-lists/types";
import { generateBalancedMapList } from "./balanced-map-list";
import { starterMap } from "./starter-map";
import type { TournamentMaplistInput } from "./types";

const team1Picks = new MapPool([
	{ mode: "SZ", stageId: 4 },
	{ mode: "SZ", stageId: 5 },
	{ mode: "TC", stageId: 5 },
	{ mode: "TC", stageId: 6 },
	{ mode: "RM", stageId: 7 },
	{ mode: "RM", stageId: 8 },
	{ mode: "CB", stageId: 9 },
	{ mode: "CB", stageId: 10 },
]);
const team2Picks = new MapPool([
	{ mode: "SZ", stageId: 11 },
	{ mode: "SZ", stageId: 9 },
	{ mode: "TC", stageId: 2 },
	{ mode: "TC", stageId: 8 },
	{ mode: "RM", stageId: 7 },
	{ mode: "RM", stageId: 1 },
	{ mode: "CB", stageId: 2 },
	{ mode: "CB", stageId: 3 },
]);
const team2PicksNoOverlap = new MapPool([
	{ mode: "SZ", stageId: 11 },
	{ mode: "SZ", stageId: 9 },
	{ mode: "TC", stageId: 2 },
	{ mode: "TC", stageId: 8 },
	{ mode: "RM", stageId: 17 },
	{ mode: "RM", stageId: 1 },
	{ mode: "CB", stageId: 2 },
	{ mode: "CB", stageId: 3 },
]);

const duplicationPicks = new MapPool([
	{ mode: "SZ", stageId: 4 },
	{ mode: "SZ", stageId: 5 },
	{ mode: "TC", stageId: 4 },
	{ mode: "TC", stageId: 5 },
	{ mode: "RM", stageId: 6 },
	{ mode: "RM", stageId: 7 },
	{ mode: "CB", stageId: 6 },
	{ mode: "CB", stageId: 7 },
]);

const generateMapsResult = ({
	count = 5,
	seed = "test",
	teams = [
		{
			id: 1,
			maps: team1Picks,
		},
		{
			id: 2,
			maps: team2Picks,
		},
	],
	pool = SENDOUQ_MAP_POOL,
	modesIncluded = [...rankedModesShort],
	modeOrder,
	recentlyPlayedMaps,
}: Partial<TournamentMaplistInput> = {}) => {
	return generateBalancedMapList({
		count,
		seed,
		teams,
		pool,
		modesIncluded,
		modeOrder,
		recentlyPlayedMaps,
	});
};

const generateMaps = (args: Partial<TournamentMaplistInput> = {}) =>
	unwrap(generateMapsResult(args));

const pickedByEitherTeam = (
	map: { mode: string; stageId: number },
	teams: MapPool[],
) =>
	teams.some((team) =>
		team.stageModePairs.some(
			(pair) => pair.mode === map.mode && pair.stageId === map.stageId,
		),
	);

describe("Tournament map list generator", () => {
	test("Modes are spread evenly", () => {
		const mapList = generateMaps();
		const modes = new Set(rankedModesShort);

		expect(mapList.length).toBe(5);

		for (const [i, { mode }] of mapList.entries()) {
			const rankedMode = mode as RankedModeShort;
			if (!modes.has(rankedMode)) {
				expect(i).toBe(4);
				expect(mode).toBe(mapList[0].mode);
			}

			modes.delete(rankedMode);
		}
	});

	test("Follows the mode order when given", () => {
		const mapList = generateMaps({
			modeOrder: ["SZ", "TC", "RM", "CB", "SZ"],
		});

		expect(mapList.map((map) => map.mode)).toEqual([
			"SZ",
			"TC",
			"RM",
			"CB",
			"SZ",
		]);
	});

	test("Mode order can repeat a mode early", () => {
		const mapList = generateMaps({
			modeOrder: ["SZ", "TC", "SZ", "RM", "SZ"],
			teams: [
				{ id: 1, maps: team1Picks },
				{ id: 2, maps: team2PicksNoOverlap },
			],
		});

		expect(mapList.map((map) => map.mode)).toEqual([
			"SZ",
			"TC",
			"SZ",
			"RM",
			"SZ",
		]);
	});

	test("Equal picks", () => {
		let our = 0;
		let their = 0;

		const mapList = generateMaps({
			teams: [
				{ id: 1, maps: team1Picks },
				{ id: 2, maps: team2PicksNoOverlap },
			],
		});

		for (const { stageId, mode } of mapList) {
			if (team1Picks.has({ stageId, mode })) {
				our++;
			}

			if (team2PicksNoOverlap.has({ stageId, mode })) {
				their++;
			}
		}

		expect(our).toBe(their);
		expect(mapList[4].source).toBe("RANDOM");
	});

	test("No stage repeats in optimal case", () => {
		const mapList = generateMaps();

		const stages = new Set(mapList.map(({ stageId }) => stageId));

		expect(stages.size).toBe(5);
	});

	test("Always generates same maplist given same input", () => {
		const mapList1 = generateMaps();
		const mapList2 = generateMaps();

		expect(mapList1.length).toBe(5);

		for (let i = 0; i < mapList1.length; i++) {
			expect(mapList1[i].stageId).toBe(mapList2[i].stageId);
			expect(mapList1[i].mode).toBe(mapList2[i].mode);
		}
	});

	test("Order of team doesn't matter regarding what maplist gets created", () => {
		const mapList1 = generateMaps();
		const mapList2 = generateMaps({
			teams: [
				{
					id: 2,
					maps: team2Picks,
				},
				{
					id: 1,
					maps: team1Picks,
				},
			],
		});

		expect(mapList1.length).toBe(5);

		for (let i = 0; i < mapList1.length; i++) {
			expect(mapList1[i].stageId).toBe(mapList2[i].stageId);
			expect(mapList1[i].mode).toBe(mapList2[i].mode);
		}
	});

	test("Order of maps in the list doesn't matter regarding what maplist gets created", () => {
		const mapList1 = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1Picks,
				},
				{
					id: 2,
					maps: team2Picks,
				},
			],
		});
		const mapList2 = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1Picks,
				},
				{
					id: 2,
					maps: new MapPool(team2Picks.stageModePairs.slice().reverse()),
				},
			],
		});

		expect(mapList1.length).toBe(5);

		for (let i = 0; i < mapList1.length; i++) {
			expect(mapList1[i].stageId).toBe(mapList2[i].stageId);
			expect(mapList1[i].mode).toBe(mapList2[i].mode);
		}
	});

	test("Uses other teams maps if one didn't submit maplist", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: new MapPool([]),
				},
				{
					id: 2,
					maps: team2Picks,
				},
			],
		});

		expect(mapList.length).toBe(5);

		for (let i = 0; i < mapList.length - 1; i++) {
			const map = mapList[i];
			expect(map).toBeTruthy();

			expect(team2Picks.has({ mode: map.mode, stageId: map.stageId })).toBe(
				true,
			);
		}
	});

	test("Creates map list from the pool if neither team submitted maps", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: new MapPool([]),
				},
				{
					id: 2,
					maps: new MapPool([]),
				},
			],
		});

		expect(mapList.length).toBe(5);
		for (const map of mapList) {
			expect(map.source).toBe("RANDOM");
			expect(SENDOUQ_MAP_POOL.has(map)).toBe(true);
		}
	});

	test("Handles worst case with duplication", () => {
		const maplist = generateMaps({
			teams: [
				{
					id: 1,
					maps: duplicationPicks,
				},
				{
					id: 2,
					maps: duplicationPicks,
				},
			],
			count: 7,
		});

		expect(maplist.length).toBe(7);

		// no consecutive stage replays
		for (let i = 0; i < maplist.length - 1; i++) {
			expect(maplist[i].stageId).not.toBe(maplist[i + 1].stageId);
		}
	});

	const team2PicksWithSomeDuplication = new MapPool([
		{ mode: "SZ", stageId: 4 },
		{ mode: "SZ", stageId: 11 },
		{ mode: "TC", stageId: 5 },
		{ mode: "TC", stageId: 6 },
		{ mode: "RM", stageId: 7 },
		{ mode: "RM", stageId: 2 },
		{ mode: "CB", stageId: 9 },
		{ mode: "CB", stageId: 10 },
	]);

	test("Keeps things fair when overlap", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1Picks,
				},
				{
					id: 2,
					maps: team2PicksWithSomeDuplication,
				},
			],
			count: 7,
		});

		expect(mapList.length).toBe(7);

		let team1PicksAppeared = 0;
		let team2PicksAppeared = 0;

		for (const { stageId, mode } of mapList) {
			if (team1Picks.has({ stageId, mode })) {
				team1PicksAppeared++;
			}

			if (team2PicksWithSomeDuplication.has({ stageId, mode })) {
				team2PicksAppeared++;
			}
		}

		expect(team1PicksAppeared).toBe(team2PicksAppeared);
	});

	test("No map picked by same team twice in row", () => {
		for (let i = 1; i <= 10; i++) {
			const mapList = generateMaps({
				teams: [
					{
						id: 1,
						maps: team1Picks,
					},
					{
						id: 2,
						maps: team2Picks,
					},
				],
				seed: String(i),
			});

			for (let j = 0; j < mapList.length - 1; j++) {
				if (typeof mapList[j].source !== "number") continue;
				expect(mapList[j].source).not.toBe(mapList[j + 1].source);
			}
		}
	});

	test("Map both teams picked decides the match", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1Picks,
				},
				{
					id: 2,
					maps: team2Picks,
				},
			],
			count: 7,
		});

		// the one map both of them picked
		expect(mapList[6].stageId).toBe(7);
		expect(mapList[6].mode).toBe("RM");
		expect(mapList[6].source).toBe("BOTH");
	});

	test("Random pool map neither team picked decides the match without overlap", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1Picks,
				},
				{
					id: 2,
					maps: team2PicksNoOverlap,
				},
			],
			count: 7,
		});

		const last = mapList[6];

		expect(last.source).toBe("RANDOM");
		expect(SENDOUQ_MAP_POOL.has(last)).toBe(true);
		expect(pickedByEitherTeam(last, [team1Picks, team2PicksNoOverlap])).toBe(
			false,
		);
	});

	test("Random neutral map is drawn from the tournament's pool", () => {
		const pool = new MapPool({
			SZ: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
			TC: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
			RM: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
			CB: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
			TW: [],
		});

		for (let i = 1; i <= 10; i++) {
			const mapList = generateMaps({
				seed: String(i),
				teams: [
					{ id: 1, maps: team1Picks },
					{ id: 2, maps: team2PicksNoOverlap },
				],
				pool,
			});

			const last = mapList[4];
			expect(last.source).toBe("RANDOM");
			expect(pool.has(last)).toBe(true);
		}
	});

	test("Random neutral map considers stages picked in other modes free", () => {
		// TC pool: every stage some team picked in another mode, only 8 unpicked in TC
		const pool = new MapPool({
			SZ: [4, 5, 9, 11],
			TC: [4, 5, 7, 8, 9, 10, 11, 1, 2, 3],
			RM: [],
			CB: [],
			TW: [],
		});
		const team1 = new MapPool({
			SZ: [4, 5],
			TC: [1, 2],
			RM: [],
			CB: [],
			TW: [],
		});
		const team2 = new MapPool({
			SZ: [9, 11],
			TC: [3, 7],
			RM: [],
			CB: [],
			TW: [],
		});

		const mapList = generateMaps({
			count: 3,
			teams: [
				{ id: 1, maps: team1 },
				{ id: 2, maps: team2 },
			],
			pool,
			modesIncluded: ["SZ", "TC"],
			modeOrder: ["SZ", "TC", "TC"],
		});

		const last = mapList[2];
		expect(last.mode).toBe("TC");
		expect(last.source).toBe("RANDOM");
		expect([4, 5, 8, 9, 10, 11]).toContain(last.stageId);
	});

	test("Falls back to a pool map a team picked when the mode has nothing left", () => {
		const pool = new MapPool({
			SZ: [1, 2, 3, 4],
			TW: [],
			TC: [],
			RM: [],
			CB: [],
		});

		const mapList = generateMaps({
			count: 3,
			teams: [
				{ id: 1, maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1, 2] }) },
				{ id: 2, maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [3, 4] }) },
			],
			pool,
			modesIncluded: ["SZ"],
		});

		expect(mapList.length).toBe(3);
		expect(mapList[2].source).toBe("RANDOM");
		expect(pool.has(mapList[2])).toBe(true);
	});

	test("Mode order repeating a mode draws pool maps neither team picked before the last slot", () => {
		const pool = new MapPool({ ...MapPool.EMPTY.parsed, TC: [1, 2, 3] });
		const commonPick = new MapPool({ ...MapPool.EMPTY.parsed, TC: [1] });

		const result = generateMapsResult({
			count: 3,
			teams: [
				{ id: 1, maps: commonPick },
				{ id: 2, maps: commonPick },
			],
			pool,
			modesIncluded: ["TC"],
			modeOrder: ["TC", "TC", "TC"],
		});

		expect(result.ok).toBe(true);
		const mapList = unwrap(result);

		expect(mapList.map((map) => map.mode)).toEqual(["TC", "TC", "TC"]);
		expect(new Set(mapList.map((map) => map.stageId)).size).toBe(3);
		expect(mapList.every((map) => pool.has(map))).toBe(true);
		expect(mapList[2]).toMatchObject({ stageId: 1, source: "BOTH" });
	});

	const threeModesArgs: TournamentMaplistInput = {
		count: 7,
		seed: "1002",
		modesIncluded: ["TC", "TW", "RM"],
		pool: MapPool.ALL,
		teams: [
			{
				id: 1002,
				maps: new MapPool({
					TW: [9, 7, 6, 5, 3, 2, 0],
					SZ: [],
					TC: [9, 8, 7, 4, 1, 6, 2],
					RM: [9, 7, 6, 5, 3, 1, 0],
					CB: [],
				}),
			},
			{
				id: 1001,
				maps: new MapPool({
					TW: [8, 7, 5, 2, 9, 4, 3],
					SZ: [],
					TC: [7, 6, 5, 3, 2, 0, 9],
					RM: [9, 8, 6, 5, 3, 2, 7],
					CB: [],
				}),
			},
		],
	};

	test("generates list of modes included length > 1 && < 4", () => {
		const maps = generateMaps(threeModesArgs);

		expect(maps.length).toBe(7);
	});

	// paddling pool 264
	test("handles 100% overlap in one mode and none in others", () => {
		generateMaps({
			count: 5,
			modesIncluded: ["SZ", "TC", "RM", "CB"],
			seed: "4866",
			teams: [
				{
					id: 2317,
					maps: new MapPool([
						{
							stageId: 2,
							mode: "SZ",
						},
						{
							stageId: 17,
							mode: "SZ",
						},
						{
							stageId: 2,
							mode: "TC",
						},
						{
							stageId: 10,
							mode: "TC",
						},
						{
							stageId: 0,
							mode: "RM",
						},
						{
							stageId: 3,
							mode: "RM",
						},
						{
							stageId: 6,
							mode: "CB",
						},
						{
							stageId: 21,
							mode: "CB",
						},
					]),
				},
				{
					id: 2322,
					maps: new MapPool([
						{
							stageId: 7,
							mode: "SZ",
						},
						{
							stageId: 18,
							mode: "SZ",
						},
						{
							stageId: 2,
							mode: "TC",
						},
						{
							stageId: 10,
							mode: "TC",
						},
						{
							stageId: 2,
							mode: "RM",
						},
						{
							stageId: 19,
							mode: "RM",
						},
						{
							stageId: 7,
							mode: "CB",
						},
						{
							stageId: 18,
							mode: "CB",
						},
					]),
				},
			],
		});
	});

	test("Uneven counts per mode", () => {
		const team1 = new MapPool({
			SZ: [0, 1, 2, 3, 4, 5],
			TC: [6, 7],
			RM: [],
			CB: [],
			TW: [],
		});
		const team2 = new MapPool({
			SZ: [6, 7, 8, 9, 10, 11],
			TC: [12, 13],
			RM: [],
			CB: [],
			TW: [],
		});

		const mapList = generateMaps({
			count: 5,
			teams: [
				{ id: 1, maps: team1 },
				{ id: 2, maps: team2 },
			],
			modesIncluded: ["SZ", "TC"],
		});

		expect(mapList.length).toBe(5);
		expect(mapList.some((map) => map.mode === "TC")).toBe(true);
		expect(mapList.some((map) => map.mode === "SZ")).toBe(true);
	});
});

const team1SZPicks = new MapPool([
	{ mode: "SZ", stageId: 4 },
	{ mode: "SZ", stageId: 5 },
	{ mode: "SZ", stageId: 6 },
	{ mode: "SZ", stageId: 7 },
	{ mode: "SZ", stageId: 8 },
	{ mode: "SZ", stageId: 9 },
]);
const team2SZPicks = new MapPool([
	{ mode: "SZ", stageId: 1 },
	{ mode: "SZ", stageId: 2 },
	{ mode: "SZ", stageId: 3 },
	{ mode: "SZ", stageId: 9 },
	{ mode: "SZ", stageId: 10 },
	{ mode: "SZ", stageId: 11 },
]);
const team2SZPicksNoOverlap = new MapPool([
	{ mode: "SZ", stageId: 1 },
	{ mode: "SZ", stageId: 2 },
	{ mode: "SZ", stageId: 3 },
	{ mode: "SZ", stageId: 14 },
	{ mode: "SZ", stageId: 10 },
	{ mode: "SZ", stageId: 11 },
]);

describe("TournamentMapListGeneratorOneMode", () => {
	test("Creates map list for one mode inferring from the team picks", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1SZPicks,
				},
				{
					id: 2,
					maps: team2SZPicks,
				},
			],
			modesIncluded: ["SZ"],
		});
		for (let i = 0; i < mapList.length - 1; i++) {
			expect(mapList[i].mode).toBe("SZ");
		}
	});

	test("Creates one mode map list from empty map lists", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: new MapPool([]),
				},
				{
					id: 2,
					maps: new MapPool([]),
				},
			],
			modesIncluded: ["SZ"],
		});
		for (let i = 0; i < mapList.length - 1; i++) {
			expect(mapList[i].mode).toBe("SZ");
		}
	});

	test("Creates all different maps from empty map lists", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: new MapPool([]),
				},
				{
					id: 2,
					maps: new MapPool([]),
				},
			],
			modesIncluded: ["SZ"],
		});

		const stages = new Set(mapList.map(({ stageId }) => stageId));
		expect(stages.size).toBe(5);
	});

	test("Neutral map is always from the maps of the teams when possible", () => {
		for (let i = 1; i <= 10; i++) {
			const mapList = generateMaps({
				teams: [
					{
						id: 1,
						maps: team1SZPicks,
					},
					{
						id: 2,
						maps: team2SZPicks,
					},
				],
				modesIncluded: ["SZ"],
				seed: String(i),
			});

			const last = mapList[mapList.length - 1];

			expect(last?.mode).toBe("SZ");
			expect(last?.stageId).toBe(9);
			expect(last?.source).toBe("BOTH");
		}
	});

	test("Neutral map is from neither team's pool if no overlap", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1SZPicks,
				},
				{
					id: 2,
					maps: team2SZPicksNoOverlap,
				},
			],
			modesIncluded: ["SZ"],
		});

		const last = mapList[mapList.length - 1];

		expect(last.source).toBe("RANDOM");
		expect(
			team1SZPicks.stageModePairs.some(
				({ stageId }) => stageId === last?.stageId,
			),
		).toBe(false);
		expect(
			team2SZPicksNoOverlap.stageModePairs.some(
				({ stageId }) => stageId === last?.stageId,
			),
		).toBe(false);
	});

	test("Handles worst case duplication", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1SZPicks,
				},
				{
					id: 2,
					maps: team1SZPicks,
				},
			],
			modesIncluded: ["SZ"],
			count: 7,
		});

		for (const [i, stage] of mapList.entries()) {
			if (i === 6) {
				expect(stage?.source).toBe("RANDOM");
			} else {
				expect(stage?.source).toBe("BOTH");
			}
		}
	});

	test("Handles one team submitted no maps", () => {
		const mapList = generateMaps({
			teams: [
				{
					id: 1,
					maps: team1SZPicks,
				},
				{
					id: 2,
					maps: new MapPool([]),
				},
			],
			modesIncluded: ["SZ"],
		});

		for (const stage of mapList) {
			expect(stage.source).toBe(1);
		}
	});

	test('Returns an error if including modes not specified in "modesIncluded"', () => {
		const result = generateMapsResult({
			teams: [
				{
					id: 1,
					maps: team1Picks,
				},
				{
					id: 2,
					maps: new MapPool([]),
				},
			],
			modesIncluded: ["SZ"],
		});

		expect(unwrapErr(result)).toBe("MAPS_FOR_MODES_NOT_INCLUDED");
	});

	test("Returns an error if duplicate maps in the pool", () => {
		const result = generateMapsResult({
			teams: [
				{
					id: 1,
					maps: new MapPool([
						{ mode: "SZ", stageId: 1 },
						{ mode: "SZ", stageId: 1 },
					]),
				},
				{
					id: 2,
					maps: new MapPool([]),
				},
			],
			modesIncluded: ["SZ"],
		});

		expect(unwrapErr(result)).toBe("DUPLICATE_MAPS_IN_MAP_POOL");
	});
});

describe("Recently played maps", () => {
	test("One mode Bo7 avoids recently played maps when a full avoiding list exists", () => {
		const team1Pool = new MapPool(
			([1, 2, 3, 4, 5, 6] as const).map((stageId) => ({
				mode: "SZ" as const,
				stageId,
			})),
		);
		const team2Pool = new MapPool(
			([7, 8, 9, 10, 11, 12] as const).map((stageId) => ({
				mode: "SZ" as const,
				stageId,
			})),
		);
		// the bo5 both teams played right before this match
		const recentlyPlayedMaps = ([1, 7, 2, 8, 3] as const).map((stageId) => ({
			mode: "SZ" as const,
			stageId,
		}));

		const mapList = generateMaps({
			count: 7,
			seed: "1000",
			teams: [
				{ id: 1, maps: team1Pool },
				{ id: 2, maps: team2Pool },
			],
			modesIncluded: ["SZ"],
			recentlyPlayedMaps,
		});

		const recentMapsInList = mapList.filter((map) =>
			recentlyPlayedMaps.some(
				(recent) => recent.mode === map.mode && recent.stageId === map.stageId,
			),
		);

		expect(recentMapsInList).toEqual([]);
	});

	test("Avoids recently played maps when possible", () => {
		const recentlyPlayedMaps = [
			{ mode: "SZ" as const, stageId: 4 as const },
			{ mode: "TC" as const, stageId: 5 as const },
		];

		const mapList = generateMaps({
			seed: "recent-test",
			recentlyPlayedMaps,
		});

		const hasRecentMap = mapList.some((map) =>
			recentlyPlayedMaps.some(
				(recent) => recent.mode === map.mode && recent.stageId === map.stageId,
			),
		);

		expect(hasRecentMap).toBe(false);
	});

	test("Works correctly with no recently played maps", () => {
		const mapList = generateMaps({
			recentlyPlayedMaps: [],
		});

		expect(mapList.length).toBe(5);
	});

	test("Penalties decrease for maps further back in history", () => {
		const recentlyPlayedMaps = [
			{ mode: "SZ" as const, stageId: 4 as const },
			{ mode: "SZ" as const, stageId: 5 as const },
			{ mode: "TC" as const, stageId: 5 as const },
			{ mode: "TC" as const, stageId: 6 as const },
			{ mode: "RM" as const, stageId: 7 as const },
			{ mode: "RM" as const, stageId: 8 as const },
		];

		const mapListWithRecent = generateMaps({
			seed: "history-test",
			recentlyPlayedMaps,
		});

		const hasVeryRecentMap = mapListWithRecent.some((map) =>
			recentlyPlayedMaps
				.slice(0, 2)
				.some(
					(recent) =>
						recent.mode === map.mode && recent.stageId === map.stageId,
				),
		);

		expect(hasVeryRecentMap).toBe(false);
	});

	test("Still generates valid maplist even with many recently played maps", () => {
		const recentlyPlayedMaps = [
			...team1Picks.stageModePairs,
			...team2Picks.stageModePairs,
		];

		const mapList = generateMaps({
			seed: "many-recent",
			recentlyPlayedMaps,
		});

		expect(mapList.length).toBe(5);
	});
});

describe("starterMap", () => {
	const args = {
		seed: "starter",
		modesIncluded: [...rankedModesShort],
		pool: SENDOUQ_MAP_POOL,
	};

	test("uses a map both teams picked", () => {
		const [map] = starterMap({
			...args,
			teams: [
				{ id: 1, maps: team1Picks },
				{ id: 2, maps: team2Picks },
			],
		});

		expect(map).toEqual({ mode: "RM", stageId: 7, source: "BOTH" });
	});

	test("draws a pool map neither team picked without overlap", () => {
		const [map] = starterMap({
			...args,
			teams: [
				{ id: 1, maps: team1Picks },
				{ id: 2, maps: team2PicksNoOverlap },
			],
		});

		expect(map.source).toBe("RANDOM");
		expect(SENDOUQ_MAP_POOL.has(map)).toBe(true);
		expect(pickedByEitherTeam(map, [team1Picks, team2PicksNoOverlap])).toBe(
			false,
		);
	});

	test("respects the mode order over a common map of another mode", () => {
		const [map] = starterMap({
			...args,
			modeOrder: ["SZ"],
			teams: [
				{ id: 1, maps: team1Picks },
				{ id: 2, maps: team2Picks },
			],
		});

		expect(map.mode).toBe("SZ");
		expect(map.source).toBe("RANDOM");
	});

	test("falls back to a picked pool map when the mode has nothing left", () => {
		const pool = new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1, 2] });

		const [map] = starterMap({
			...args,
			modesIncluded: ["SZ"],
			pool,
			teams: [
				{ id: 1, maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1] }) },
				{ id: 2, maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [2] }) },
			],
		});

		expect(map.source).toBe("RANDOM");
		expect(pool.has(map)).toBe(true);
	});
});
