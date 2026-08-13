import { describe, test } from "vitest";
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
	test("round-trips", () => {
		assertRoundTrips(vodsSearchParams, {
			page: [1, 2, 1000],
			weapon: [null, 0, 40, 8010],
			mode: [null, "TW", "SZ", "CB"],
			stageId: [null, 0, 11],
			type: [null, "TOURNAMENT", "SENDOUQ"],
		});
	});

	test("malformed values decode to defaults", () => {
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
	const ingestMatch = {
		startsAt: 30,
		mode: "SZ" as const,
		modeAssumed: true,
		stage: 0 as const,
		weapons: [40 as const, null],
	};

	test("round-trips", () => {
		assertRoundTrips(vodsNewSearchParams, {
			vod: [null, 1, 12345],
			ingest: [
				null,
				{ matches: [ingestMatch] },
				{ type: "CAST", matches: [ingestMatch, ingestMatch] },
			],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(vodsNewSearchParams, "vod", [
			["0"],
			["-1"],
			["1.5"],
			["abc"],
		]);
		assertDecodesToDefault(vodsNewSearchParams, "ingest", [
			["not json"],
			['{"matches":[]}'],
			['{"matches":[{"startsAt":-1}]}'],
		]);
	});
});

describe("vodsVodSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(vodsVodSearchParams, {
			start: [0, 1, 5312],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(vodsVodSearchParams, "start", [
			["-1"],
			["NaN"],
			["1.5"],
		]);
	});
});

describe("userVodsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userVodsSearchParams, {
			page: [1, 7, 1000],
		});
	});
});
