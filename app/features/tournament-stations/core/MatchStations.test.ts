import { describe, expect, test } from "vitest";
import * as MatchStations from "./MatchStations";

const COMPLETED_MATCH_ID = 100;
const UNKNOWN_MATCH_ID = 200;

const tournament = {
	matchIdToBracketIdx: (matchId: number) =>
		matchId === UNKNOWN_MATCH_ID ? null : 0,
	matchStatusById: (matchId: number) =>
		matchId === COMPLETED_MATCH_ID
			? ("COMPLETED" as const)
			: ("STARTED" as const),
};

const station = (
	id: number,
	name: string,
	locationNote: string | null = null,
) => ({
	id,
	name,
	locationNote,
});

/** Short name of each station, with one match queued on each (match id = station id). */
const shortNames = (names: string[]) => {
	const stations = names.map((name, idx) => station(idx + 1, name));
	const result = MatchStations.byMatchId({
		tournament,
		stations,
		placements: stations.map((s) => ({ matchId: s.id, stationId: s.id })),
	});

	return stations.map((s) => result.get(s.id)?.shortName);
};

describe("MatchStations.byMatchId", () => {
	test.each([
		{
			why: "the number a name ends with",
			names: ["Station 1", "Station 2", "Station 10"],
			expected: ["1", "2", "10"],
		},
		{
			why: "the whole name without a number",
			names: ["Main stage", "Station 2"],
			expected: ["Main stage", "2"],
		},
		{
			why: "a number glued to the name",
			names: ["Setup3"],
			expected: ["3"],
		},
		{
			why: "the whole names when the numbers collide",
			names: ["Pool A 1", "Pool B 1", "Pool B 2"],
			expected: ["Pool A 1", "Pool B 1", "2"],
		},
		{
			why: "the whole name when another station is named the number",
			names: ["Station 3", "3"],
			expected: ["Station 3", "3"],
		},
	])("short name is $why", ({ names, expected }) => {
		expect(shortNames(names)).toEqual(expected);
	});

	test("gives the queued matches their station, the first one in its queue marked", () => {
		const result = MatchStations.byMatchId({
			tournament,
			stations: [station(1, "Station 1", "North corner")],
			placements: [
				{ matchId: 1, stationId: 1 },
				{ matchId: 2, stationId: 1 },
			],
		});

		expect(result.get(1)).toEqual({
			id: 1,
			name: "Station 1",
			shortName: "1",
			locationNote: "North corner",
			isFirstInQueue: true,
		});
		expect(result.get(2)).toMatchObject({ id: 1, isFirstInQueue: false });
	});

	test("leaves out finished, held and unknown matches", () => {
		const result = MatchStations.byMatchId({
			tournament,
			stations: [station(1, "Station 1")],
			placements: [
				{ matchId: COMPLETED_MATCH_ID, stationId: 1 },
				{ matchId: UNKNOWN_MATCH_ID, stationId: 1 },
				{ matchId: 3, stationId: null },
				{ matchId: 4, stationId: 999 },
			],
		});

		expect(result.size).toBe(0);
	});
});
