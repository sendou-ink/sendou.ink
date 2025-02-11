import { describe, expect, test } from "vitest";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { createTournamentMapList } from ".";
import type { RankedModeShort } from "../in-game-lists";
import { rankedModesShort } from "../in-game-lists/modes";
import { DEFAULT_MAP_POOL } from "./constants";
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
const tiebreakerPicks = new MapPool([
	{ mode: "SZ", stageId: 1 },
	{ mode: "TC", stageId: 11 },
	{ mode: "RM", stageId: 3 },
	{ mode: "CB", stageId: 4 },
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
const duplicationTiebreaker = new MapPool([
	{ mode: "SZ", stageId: 7 },
	{ mode: "TC", stageId: 6 },
	{ mode: "RM", stageId: 5 },
	{ mode: "CB", stageId: 4 },
]);

const generateMaps = ({
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
	tiebreakerMaps = tiebreakerPicks,
	modesIncluded = [...rankedModesShort],
	followModeOrder = false,
}: Partial<TournamentMaplistInput> = {}) => {
	return createTournamentMapList({
		count,
		seed,
		teams,
		tiebreakerMaps,
		modesIncluded,
		followModeOrder,
	});
};

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

	test("Follow mode order option", () => {
		const mapList = generateMaps({ followModeOrder: true });

		expect(mapList[0].mode).toBe("SZ");
		expect(mapList[1].mode).toBe("TC");
		expect(mapList[2].mode).toBe("RM");
		expect(mapList[3].mode).toBe("CB");
		expect(mapList[4].mode).toBe("SZ");
	});

	test("Equal picks", () => {
		let our = 0;
		let their = 0;
		let tiebreaker = 0;

		const mapList = generateMaps();

		for (const { stageId, mode } of mapList) {
			if (team1Picks.has({ stageId, mode })) {
				our++;
			}

			if (team2Picks.has({ stageId, mode })) {
				their++;
			}

			if (tiebreakerPicks.has({ stageId, mode })) {
				tiebreaker++;
			}
		}

		expect(our).toBe(their);
		expect(tiebreaker).toBe(1);
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
			// map belongs to team 2 map list
			const map = mapList[i];
			expect(map).toBeTruthy();

			expect(team2Picks.has({ mode: map.mode, stageId: map.stageId })).toBe(
				true,
			);
		}
	});

	test("Creates map list even if neither team submitted maps", () => {
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
			tiebreakerMaps: duplicationTiebreaker,
		});

		expect(maplist.length).toBe(7);

		// all stages appear
		const stages = new Set(maplist.map(({ stageId }) => stageId));
		expect(stages.size).toBe(4);

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

	test("Calculates all mode maps without tiebreaker", () => {
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
			tiebreakerMaps: new MapPool([]),
		});

		// the one map both of them picked
		expect(mapList[6].stageId).toBe(7);
		expect(mapList[6].mode).toBe("RM");
	});

	test("Calculates all mode maps without tiebreaker (no overlap)", () => {
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
			tiebreakerMaps: new MapPool([]),
		});

		// default map pool contains the tiebreaker
		expect(
			DEFAULT_MAP_POOL.stageModePairs.some(
				(pair) =>
					pair.stageId === mapList[6].stageId && pair.mode === mapList[6].mode,
			),
		).toBe(true);

		// neither teams map pool contains the tiebreaker
		expect(
			team1Picks.stageModePairs.some(
				(pair) =>
					pair.stageId === mapList[6].stageId && pair.mode === mapList[6].mode,
			),
		).toBe(false);
		expect(
			team2PicksNoOverlap.stageModePairs.some(
				(pair) =>
					pair.stageId === mapList[6].stageId && pair.mode === mapList[6].mode,
			),
		).toBe(false);
	});

	const threeModesArgs: TournamentMaplistInput = {
		count: 7,
		seed: "1002",
		modesIncluded: ["TC", "TW", "RM"],
		tiebreakerMaps: new MapPool({
			TW: [],
			SZ: [],
			TC: [],
			RM: [],
			CB: [],
		}),
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
		// should not throw
		generateMaps({
			count: 5,
			followModeOrder: false,
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
			tiebreakerMaps: new MapPool([
				{
					stageId: 15,
					mode: "SZ",
				},
				{
					stageId: 0,
					mode: "CB",
				},
				{
					stageId: 16,
					mode: "RM",
				},
				{
					stageId: 8,
					mode: "TC",
				},
			]),
		});
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
			tiebreakerMaps: new MapPool([]),
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
			tiebreakerMaps: new MapPool([]),
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
			tiebreakerMaps: new MapPool([]),
		});

		const stages = new Set(mapList.map(({ stageId }) => stageId));
		expect(stages.size).toBe(5);
	});

	test("Tiebreaker is always from the maps of the teams when possible", () => {
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
				tiebreakerMaps: new MapPool([]),
			});

			const last = mapList[mapList.length - 1];

			expect(last?.mode).toBe("SZ");
			expect(last?.stageId).toBe(9);
		}
	});

	test("Tiebreaker is from neither team's pool if no overlap", () => {
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
			tiebreakerMaps: new MapPool([]),
		});

		const last = mapList[mapList.length - 1];

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
			tiebreakerMaps: new MapPool([]),
			count: 7,
		});

		for (const [i, stage] of mapList.entries()) {
			if (i === 6) {
				expect(stage?.source).toBe("TIEBREAKER");
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
			tiebreakerMaps: new MapPool([]),
		});

		for (const stage of mapList) {
			expect(stage.source).toBe(1);
		}
	});

	test('Throws if including modes not specified in "modesIncluded"', () => {
		expect(() =>
			generateMaps({
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
			}),
		).toThrow();
	});

	test("Throws if duplicate maps in the pool", () => {
		expect(() =>
			generateMaps({
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
			}),
		).toThrowError("Duplicate map");
	});
});
