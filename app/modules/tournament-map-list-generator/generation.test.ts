import * as R from "remeda";
import { describe, expect, test } from "vitest";
import { modeStageKey } from "~/features/map-list-generator/core/MapList";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { unwrap, unwrapErr } from "~/utils/result";
import { rankedModesShort } from "../in-game-lists/modes";
import type {
	ModeShort,
	ModeWithStage,
	RankedModeShort,
	StageId,
} from "../in-game-lists/types";
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

	// paddling pool 394: many teams picked the same two RM maps
	const identicalModeArgs = (modeOrder: ModeShort[]) => ({
		count: modeOrder.length,
		pool: MapPool.ALL,
		modesIncluded: ["SZ", "TC", "RM", "CB"] as ModeShort[],
		modeOrder,
		teams: [
			{
				id: 1,
				maps: new MapPool({
					...MapPool.EMPTY.parsed,
					SZ: [0, 1],
					TC: [2, 3],
					RM: [16, 17],
					CB: [4, 5],
				}),
			},
			{
				id: 2,
				maps: new MapPool({
					...MapPool.EMPTY.parsed,
					SZ: [6, 7],
					TC: [8, 9],
					RM: [16, 17],
					CB: [10, 11],
				}),
			},
		] as TournamentMaplistInput["teams"],
	});

	const pickSources = (mapList: Array<{ source: unknown }>) =>
		mapList
			.map((map) => map.source)
			.filter((source) => typeof source === "number");

	test.each([
		{ why: "first slot", modeOrder: ["RM", "SZ", "CB"] },
		{ why: "middle slot", modeOrder: ["TC", "RM", "SZ"] },
		{ why: "Bo5", modeOrder: ["TC", "RM", "SZ", "CB", "TC"] },
	] satisfies Array<{ why: string; modeOrder: ModeShort[] }>)(
		"Uses a map both teams picked instead of a random map when its mode can't be a team's pick ($why)",
		({ modeOrder }) => {
			for (let i = 1; i <= 10; i++) {
				const mapList = generateMaps({
					...identicalModeArgs(modeOrder),
					seed: String(i),
				});

				expect(mapList.map((map) => map.mode)).toEqual(modeOrder);
				expect(mapList.some((map) => map.source === "RANDOM")).toBe(false);
				expect(R.sort(pickSources(mapList), (a, b) => a - b)).toEqual(
					modeOrder.length === 3 ? [1, 2] : [1, 1, 2, 2],
				);
			}
		},
	);

	test("Picks alternate between the teams across a map both teams picked", () => {
		for (let i = 1; i <= 10; i++) {
			const mapList = generateMaps({
				...identicalModeArgs(["CB", "RM", "SZ", "RM", "TC"]),
				seed: String(i),
			});

			const sources = pickSources(mapList);
			for (let j = 0; j < sources.length - 1; j++) {
				expect(sources[j]).not.toBe(sources[j + 1]);
			}
		}
	});

	test("Fills a slot the picks can't fairly with a random map when there is no mode order", () => {
		for (let i = 1; i <= 5; i++) {
			const mapList = generateMaps({
				count: 7,
				seed: String(i),
				pool: MapPool.ALL,
				modesIncluded: ["SZ", "TC", "RM"],
				teams: [
					{
						id: 1,
						maps: new MapPool({
							...MapPool.EMPTY.parsed,
							SZ: [3, 1],
							TC: [8, 9],
							RM: [6, 7],
						}),
					},
					{
						id: 2,
						maps: new MapPool({
							...MapPool.EMPTY.parsed,
							SZ: [1, 3],
							TC: [5, 9],
							RM: [0, 3],
						}),
					},
				],
			});

			expect(mapList.filter((map) => map.source === "RANDOM")).toHaveLength(1);
			expect(R.sort(pickSources(mapList), (a, b) => a - b)).toEqual([
				1, 1, 2, 2,
			]);
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

		expect(mapList.filter((map) => map.source === "BOTH")).toHaveLength(6);
		expect(mapList.filter((map) => map.source === "RANDOM")).toHaveLength(1);
		expect(mapList[6].source).toBe("BOTH");
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

type RecentlyPlayedMaps = NonNullable<
	TournamentMaplistInput["recentlyPlayedMaps"]
>;

describe("Recently played maps", () => {
	const splatZones = (stageIds: readonly StageId[]) =>
		stageIds.map((stageId) => ({ mode: "SZ" as const, stageId }));

	test("One mode Bo7 avoids recently played maps when a full avoiding list exists", () => {
		const team1Pool = new MapPool(splatZones([1, 2, 3, 4, 5, 6]));
		const team2Pool = new MapPool(splatZones([7, 8, 9, 10, 11, 12]));
		// the bo5 both teams played right before this match
		const recentlyPlayedMaps: RecentlyPlayedMaps = [
			splatZones([3, 2, 1]),
			splatZones([8, 7]),
		];

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

		expect(mapList.filter(isIn(recentlyPlayedMaps))).toEqual([]);
	});

	test("Avoids recently played maps when possible", () => {
		const recentlyPlayedMaps: RecentlyPlayedMaps = [
			[{ mode: "SZ", stageId: 4 }],
			[{ mode: "TC", stageId: 5 }],
		];

		const mapList = generateMaps({
			seed: "recent-test",
			recentlyPlayedMaps,
		});

		expect(mapList.some(isIn(recentlyPlayedMaps))).toBe(false);
	});

	test("Works correctly with no recently played maps", () => {
		const mapList = generateMaps({
			recentlyPlayedMaps: [[], []],
		});

		expect(mapList.length).toBe(5);
	});

	test("Penalties decrease for maps further back in history", () => {
		const recentlyPlayedMaps: RecentlyPlayedMaps = [
			[
				{ mode: "SZ", stageId: 4 },
				{ mode: "TC", stageId: 5 },
				{ mode: "RM", stageId: 7 },
			],
			[
				{ mode: "SZ", stageId: 5 },
				{ mode: "TC", stageId: 6 },
				{ mode: "RM", stageId: 8 },
			],
		];

		const mapListWithRecent = generateMaps({
			seed: "history-test",
			recentlyPlayedMaps,
		});

		const mostRecentMaps: RecentlyPlayedMaps = [
			recentlyPlayedMaps[0].slice(0, 1),
			recentlyPlayedMaps[1].slice(0, 1),
		];
		expect(mapListWithRecent.some(isIn(mostRecentMaps))).toBe(false);
	});

	test("Still generates valid maplist even with many recently played maps", () => {
		const mapList = generateMaps({
			seed: "many-recent",
			recentlyPlayedMaps: [
				team1Picks.stageModePairs,
				team2Picks.stageModePairs,
			],
		});

		expect(mapList.length).toBe(5);
	});

	test.each(["1", "2", "3", "4", "5"])(
		"Uses the pick a team played longest ago (seed %s)",
		(seed) => {
			const mapList = generateMaps({
				count: 3,
				seed,
				teams: [
					{ id: 1, maps: new MapPool(splatZones([1, 2, 3])) },
					{ id: 2, maps: new MapPool(splatZones([7, 8, 9])) },
				],
				modesIncluded: ["SZ"],
				recentlyPlayedMaps: [splatZones([3, 1, 2]), splatZones([9, 7, 8])],
			});

			expect(
				mapList
					.filter((map) => map.source === 1 || map.source === 2)
					.map((map) => map.stageId)
					.toSorted(),
			).toEqual([2, 8]);
		},
	);

	test("Uses each team's pick over a random map even when every pick was played recently", () => {
		const team1Pool = splatZones([1, 2, 3]);
		const team2Pool = splatZones([7, 8, 9]);

		const mapList = generateMaps({
			count: 3,
			seed: "all-recent",
			teams: [
				{ id: 1, maps: new MapPool(team1Pool) },
				{ id: 2, maps: new MapPool(team2Pool) },
			],
			modesIncluded: ["SZ"],
			modeOrder: ["SZ", "SZ", "SZ"],
			recentlyPlayedMaps: [team1Pool, team2Pool],
		});

		expect(
			mapList
				.slice(0, 2)
				.map((map) => map.source)
				.toSorted(),
		).toEqual([1, 2]);
	});

	test.each(["a", "b", "c", "d", "e"])(
		"Rotates through every pick of a team before repeating one (seed %s)",
		(seedPrefix) => {
			const team1Pool = splatZones([1, 2, 3, 4, 5, 6]);
			const team2Pool = splatZones([7, 8, 9, 10, 11, 12]);
			const playedMostRecentFirst: ModeWithStage[] = [];
			const team1PicksUsed: StageId[] = [];

			for (const set of [1, 2, 3, 4, 5, 6]) {
				const recent = R.uniqueBy(playedMostRecentFirst, (map) =>
					modeStageKey(map.mode, map.stageId),
				);

				const mapList = generateMaps({
					count: 3,
					seed: `${seedPrefix}-${set}`,
					teams: [
						{ id: 1, maps: new MapPool(team1Pool) },
						{ id: 2, maps: new MapPool(team2Pool) },
					],
					modesIncluded: ["SZ"],
					recentlyPlayedMaps: [recent, recent],
				});

				team1PicksUsed.push(
					...mapList
						.filter((map) => map.source === 1)
						.map((map) => map.stageId),
				);
				playedMostRecentFirst.unshift(...mapList.toReversed());
			}

			expect(team1PicksUsed.toSorted((a, b) => a - b)).toEqual([
				1, 2, 3, 4, 5, 6,
			]);
		},
	);

	test("A map counts as recent when the other team played it", () => {
		const mapList = generateMaps({
			count: 3,
			seed: "other-team",
			teams: [
				{ id: 1, maps: new MapPool(splatZones([1, 2])) },
				{ id: 2, maps: new MapPool(splatZones([7])) },
			],
			modesIncluded: ["SZ"],
			recentlyPlayedMaps: [[], splatZones([1])],
		});

		expect(mapList.find((map) => map.source === 1)?.stageId).toBe(2);
	});
});

function isIn(recentlyPlayedMaps: RecentlyPlayedMaps) {
	return (map: { mode: string; stageId: number }) =>
		recentlyPlayedMaps.some((teamMaps) =>
			teamMaps.some(
				(recent) => recent.mode === map.mode && recent.stageId === map.stageId,
			),
		);
}

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

	test.each([
		{ why: "one common map not played", recent: [[1], [2]], expected: 3 },
		{
			why: "map only the other team played",
			recent: [[], [1, 3]],
			expected: 2,
		},
		{ why: "every common map played", recent: [[1, 3, 2], [3]], expected: 2 },
	] as const)(
		"uses the common map played longest ago ($why)",
		({ recent, expected }) => {
			const [map] = starterMap({
				...args,
				modesIncluded: ["SZ"],
				teams: [
					{
						id: 1,
						maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1, 2, 3] }),
					},
					{
						id: 2,
						maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1, 2, 3] }),
					},
				],
				recentlyPlayedMaps: [
					recent[0].map((stageId) => ({ mode: "SZ", stageId })),
					recent[1].map((stageId) => ({ mode: "SZ", stageId })),
				],
			});

			expect(map).toEqual({ mode: "SZ", stageId: expected, source: "BOTH" });
		},
	);

	test("draws the pool map neither team picked that was played longest ago", () => {
		const [map] = starterMap({
			...args,
			modesIncluded: ["SZ"],
			pool: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1, 2, 3, 4, 5] }),
			teams: [
				{ id: 1, maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1] }) },
				{ id: 2, maps: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [2] }) },
			],
			recentlyPlayedMaps: [
				[
					{ mode: "SZ", stageId: 3 },
					{ mode: "SZ", stageId: 4 },
				],
				[{ mode: "SZ", stageId: 5 }],
			],
		});

		expect(map).toEqual({ mode: "SZ", stageId: 4, source: "RANDOM" });
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
