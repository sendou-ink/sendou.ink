import { describe, expect, test } from "vitest";
import type { TournamentRoundMaps } from "~/db/tables-json";
import type { StageId } from "~/modules/in-game-lists/types";
import * as MatchMapPreview from "./MatchMapPreview";

const map = (stageId: number) => ({
	mode: "SZ" as const,
	stageId: stageId as StageId,
});

const roundMaps = (
	pickBan: TournamentRoundMaps["pickBan"],
	list = [map(1), map(2), map(3), map(4), map(5)],
) => ({ count: 3, pickBan, list });

const NOT_STARTED = { gameIndex: 0, isMapShown: false };

describe("MatchMapPreview.upcomingMaps", () => {
	test.each([
		{
			why: "every map of a round without pick/ban",
			mapList: null,
			maps: roundMaps(null, [map(1), map(2), map(3)]),
			current: NOT_STARTED,
			expected: [1, 2, 3],
		},
		{
			why: "only the first game of a counterpick round",
			mapList: null,
			maps: roundMaps("COUNTERPICK"),
			current: NOT_STARTED,
			expected: [1],
		},
		{
			why: "only the first game of a repeat-ok counterpick round",
			mapList: null,
			maps: roundMaps("COUNTERPICK_MODE_REPEAT_OK"),
			current: NOT_STARTED,
			expected: [1],
		},
		{
			why: "nothing of a ban round before the teams are known",
			mapList: null,
			maps: roundMaps("BAN_2"),
			current: NOT_STARTED,
			expected: [],
		},
		{
			why: "nothing of a custom flow before the teams are known",
			mapList: null,
			maps: roundMaps("CUSTOM"),
			current: NOT_STARTED,
			expected: [],
		},
		{
			why: "the maps left after both teams banned",
			mapList: [
				{ ...map(1), bannedByTournamentTeamId: 10 },
				map(2),
				{ ...map(3), bannedByTournamentTeamId: 11 },
				map(4),
				map(5),
			],
			maps: roundMaps("BAN_2"),
			current: NOT_STARTED,
			expected: [2, 4, 5],
		},
		{
			why: "nothing of a ban round before both teams banned",
			mapList: [
				{ ...map(1), bannedByTournamentTeamId: 10 },
				map(2),
				map(3),
				map(4),
				map(5),
			],
			maps: roundMaps("BAN_2"),
			current: NOT_STARTED,
			expected: [],
		},
		{
			why: "the games after the current map shown",
			mapList: [map(1), map(2), map(3)],
			maps: roundMaps(null),
			current: { gameIndex: 1, isMapShown: true },
			expected: [3],
		},
		{
			why: "the game waited for, but not the played ones",
			mapList: [map(1), map(2), map(3)],
			maps: roundMaps(null),
			current: { gameIndex: 1, isMapShown: false },
			expected: [2, 3],
		},
		{
			why: "no counterpick that isn't made yet",
			mapList: [map(1), map(4)],
			maps: roundMaps("COUNTERPICK"),
			current: { gameIndex: 1, isMapShown: false },
			expected: [4],
		},
	])("lists $why", ({ mapList, maps, current, expected }) => {
		const result = MatchMapPreview.upcomingMaps({
			mapList,
			roundMaps: maps,
			current,
		});

		expect(result.map((game) => game.map.stageId)).toEqual(expected);
	});

	test("numbers the games from the start of the set", () => {
		const result = MatchMapPreview.upcomingMaps({
			mapList: [map(1), map(2), map(3)],
			roundMaps: roundMaps(null),
			current: { gameIndex: 0, isMapShown: true },
		});

		expect(result.map((game) => game.gameIndex)).toEqual([1, 2]);
	});
});
