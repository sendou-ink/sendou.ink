import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { buildsSearchParams } from "./builds-search-params";

describe("buildsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(buildsSearchParams, {
			limit: [24, 48, 1, 240],
			f: [
				[],
				[
					{ type: "ability", ability: "ISM", comparison: "AT_LEAST", value: 3 },
					{ type: "mode", mode: "SZ" },
					{ type: "date", date: "2026-01-28" },
				],
				[{ type: "ability", ability: "LDE", value: true }],
			],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(buildsSearchParams, "limit", [
			[""],
			["0"],
			["241"],
			["abc"],
		]);
		assertDecodesToDefault(buildsSearchParams, "f", [
			["not-json"],
			['[{"type":"ability"}]'],
			['{"type":"mode","mode":"SZ"}'],
			['[{"type":"mode","mode":"XX"}]'],
		]);
	});
});
