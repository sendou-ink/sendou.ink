import { describe, expect, test } from "vitest";
import type { LobbyMaps } from "./lobbies-constants";
import { mapsFormValues, modesOfMaps } from "./lobbies-utils";

const MAP_POOL = [{ mode: "TC" as const, stageId: 1 as const }];

describe("mapsFormValues", () => {
	test.each([
		{ why: "ranked modes", maps: "RANKED" },
		{ why: "Splat Zones only", maps: "SZ" },
		{ why: "every mode", maps: "ALL" },
	] satisfies Array<{ why: string; maps: LobbyMaps }>)(
		"picks back $why from the modes they store",
		({ maps }) => {
			expect(
				mapsFormValues({
					modes: modesOfMaps(maps)!,
					mapPool: null,
					mapsTournamentId: null,
				}).maps,
			).toBe(maps);
		},
	);

	test("picks ranked modes for a combination of modes no option has", () => {
		expect(
			mapsFormValues({
				modes: ["SZ", "RM"],
				mapPool: null,
				mapsTournamentId: null,
			}).maps,
		).toBe("RANKED");
	});

	test("picks the tournament, leaving the custom pool empty", () => {
		expect(
			mapsFormValues({
				modes: ["TC"],
				mapPool: MAP_POOL,
				mapsTournamentId: 1,
			}),
		).toEqual({ maps: "TOURNAMENT", mapsTournamentId: 1, mapPool: "" });
	});

	test("picks a custom pool, serialized", () => {
		const values = mapsFormValues({
			modes: ["TC"],
			mapPool: MAP_POOL,
			mapsTournamentId: null,
		});

		expect(values.maps).toBe("CUSTOM");
		expect(values.mapPool).not.toBe("");
	});
});
