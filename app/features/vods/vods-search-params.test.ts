import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	userVodsSearchParams,
	vodsNewSearchParams,
	vodsSearchParams,
	vodsVodSearchParams,
} from "./vods-search-params";

describe("vodsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(vodsSearchParams, {
			page: [1, 2, 1000],
			weapon: [null, 0, 40, 8010],
			mode: [null, "TW", "SZ", "CB"],
			stageId: [null, 0, 11],
			type: [null, "TOURNAMENT", "SENDOUQ"],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(vodsSearchParams, "page", [
			["0"],
			["1001"],
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(vodsSearchParams, "weapon", [["999999"], ["foo"]]);
		assertDecodesToDefault(vodsSearchParams, "mode", [["XX"], ["tw"]]);
		assertDecodesToDefault(vodsSearchParams, "stageId", [["-1"], ["9999"]]);
		assertDecodesToDefault(vodsSearchParams, "type", [["INVALID"]]);
	});
});

describe("vodsNewSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(vodsNewSearchParams, {
			vod: [null, 1, 12345],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(vodsNewSearchParams, "vod", [
			["0"],
			["-1"],
			["1.5"],
			["abc"],
		]);
	});
});

describe("vodsVodSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(vodsVodSearchParams, {
			start: [0, 1, 5312],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(vodsVodSearchParams, "start", [
			["-1"],
			["NaN"],
			["1.5"],
		]);
	});
});

describe("userVodsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(userVodsSearchParams, {
			page: [1, 7, 1000],
		});
	});
});
