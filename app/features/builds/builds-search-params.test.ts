import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { buildsSearchParams } from "./builds-search-params";

describe("buildsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(buildsSearchParams, {
			limit: [24, 48, 1, 240],
			abilities: [
				[],
				[
					{ ability: "ISM", comparison: "AT_LEAST", value: 3 },
					{ ability: "SSU", comparison: "AT_MOST", value: 12 },
				],
				[{ ability: "LDE", value: true }],
				[{ ability: "CB", value: false }],
			],
			mode: [null, "SZ", "TW"],
			date: [null, "2026-01-28"],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(buildsSearchParams, "limit", [
			[""],
			["0"],
			["241"],
			["abc"],
		]);
		assertDecodesToDefault(buildsSearchParams, "abilities", [
			["not-json"],
			['[{"ability":"XXX","value":true}]'],
			['{"ability":"ISM","value":3}'],
			['[{"ability":"ISM","value":100,"comparison":"AT_LEAST"}]'],
		]);
		assertDecodesToDefault(buildsSearchParams, "mode", [["XX"], ["zz"]]);
		assertDecodesToDefault(buildsSearchParams, "date", [
			["not-a-date"],
			["2026-13-99"],
			["2026-1-1"],
		]);
	});
});
