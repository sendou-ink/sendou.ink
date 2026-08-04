import { describe, it } from "vitest";
import { EMPTY_BUILD } from "~/features/builds/builds-constants";
import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { analyzerSearchParams } from "./analyzer-search-params";

const FULL_BUILD: BuildAbilitiesTupleWithUnknown = [
	["CB", "ISM", "ISS", "IRU"],
	["NS", "RSU", "SSU", "SCU"],
	["SJ", "QR", "QSJ", "BRU"],
];

const PARTIAL_BUILD: BuildAbilitiesTupleWithUnknown = [
	["UNKNOWN", "ISM", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
];

describe("analyzerSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(analyzerSearchParams, {
			weapon: [0, 10, 8000],
			build: [EMPTY_BUILD, FULL_BUILD, PARTIAL_BUILD],
			build2: [EMPTY_BUILD, FULL_BUILD],
			lde: [0, 21, 10],
			effect: [[], ["LDE"], ["OG", "TACTICOOLER"]],
			focused: [1, 2, 3],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(analyzerSearchParams, "weapon", [
			[""],
			["9999999"],
			["abc"],
		]);
		assertDecodesToDefault(analyzerSearchParams, "build", [
			[""],
			["CB,ISM"],
			["XX,XX,XX,XX,XX,XX,XX,XX,XX,XX,XX,XX"],
		]);
		assertDecodesToDefault(analyzerSearchParams, "lde", [
			["22"],
			["-1"],
			["x"],
		]);
		assertDecodesToDefault(analyzerSearchParams, "focused", [["4"], ["0"]]);
	});
});
