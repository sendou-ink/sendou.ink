import { describe, expect, test } from "vitest";
import type { UserMapModePreferences } from "~/db/tables-json";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { LobbyMapSource } from "../lobbies-constants";
import * as LobbyMapList from "./LobbyMapList.server";

const POOLING_MAP: UserMapModePreferences = {
	modes: [],
	pool: [{ mode: "SZ", stages: [1] }],
};
const NOT_POOLING_MAP: UserMapModePreferences = {
	modes: [],
	pool: [{ mode: "SZ", stages: [2] }],
};

const POOLING_EVERY_MAP: UserMapModePreferences = {
	modes: [],
	pool: modesShort.map((mode) => ({ mode, stages: [...stageIds] })),
};

const participants = [
	{ userId: 1, side: "ALPHA" as const },
	{ userId: 2, side: "ALPHA" as const },
	{ userId: 3, side: "BRAVO" as const },
	{ userId: 4, side: "BRAVO" as const },
	{ userId: 5, side: null },
];

const profiles = [
	{ userId: 1, mapModePreferences: POOLING_MAP },
	{ userId: 2, mapModePreferences: NOT_POOLING_MAP },
	{ userId: 3, mapModePreferences: POOLING_MAP },
	{ userId: 4, mapModePreferences: null },
	{ userId: 5, mapModePreferences: POOLING_MAP },
];

describe("LobbyMapList.voters", () => {
	test.each([
		{ why: "both sides", source: "BOTH", expected: [1, 3] },
		{ why: "alpha's pick", source: "ALPHA", expected: [1] },
		{ why: "bravo's pick", source: "BRAVO", expected: [3] },
		{ why: "picked from neither pool", source: "DEFAULT", expected: [] },
		{
			why: "set started before sources were stored",
			source: null,
			expected: [],
		},
	] satisfies Array<{
		why: string;
		source: LobbyMapSource | null;
		expected: number[];
	}>)("$why", ({ source, expected }) => {
		expect(
			LobbyMapList.voters({
				map: { mode: "SZ", stageId: 1, source },
				participants,
				profiles,
			}),
		).toEqual(expected);
	});
});

describe("LobbyMapList.generate", () => {
	test.each([
		{
			why: "only alpha pools the maps",
			alpha: POOLING_EVERY_MAP,
			bravo: null,
			expected: "ALPHA",
		},
		{
			why: "only bravo pools the maps",
			alpha: null,
			bravo: POOLING_EVERY_MAP,
			expected: "BRAVO",
		},
		{
			why: "both sides pool the maps",
			alpha: POOLING_EVERY_MAP,
			bravo: POOLING_EVERY_MAP,
			expected: "BOTH",
		},
		{
			why: "nobody pools any maps",
			alpha: null,
			bravo: null,
			expected: "DEFAULT",
		},
	] satisfies Array<{
		why: string;
		alpha: UserMapModePreferences | null;
		bravo: UserMapModePreferences | null;
		expected: LobbyMapSource;
	}>)("every map's source when $why", async ({ alpha, bravo, expected }) => {
		const maps = await LobbyMapList.generate({
			alpha: [
				{ userId: 1, preferences: alpha },
				{ userId: 2, preferences: alpha },
			],
			bravo: [
				{ userId: 3, preferences: bravo },
				{ userId: 4, preferences: bravo },
			],
			modes: ["SZ", "TC", "RM", "CB"],
			bestOf: 5,
			playedMaps: [],
		});

		expect(maps.map((map) => map.source)).toEqual(Array(5).fill(expected));
	});
});
