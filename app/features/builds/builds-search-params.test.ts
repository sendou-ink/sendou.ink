import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { buildsSearchParams } from "./builds-search-params";

describe("buildsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(buildsSearchParams, {
			page: [1, 2, 10],
			abilities: [
				[],
				[{ type: "HAS", ability: "ISM" }],
				[
					{ type: "AT_LEAST", ability: "SSU", ap: 12 },
					{ type: "AT_MOST", ability: "ISS", ap: 57 },
					{ type: "HAS_NOT", ability: "LDE" },
					{ type: "HAS", ability: "NS" },
				],
			],
			mode: [null, "SZ", "TW"],
			date: [null, "2026-01-28"],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(buildsSearchParams, "page", [[""], ["0"], ["abc"]]);
		assertDecodesToDefault(buildsSearchParams, "abilities", [
			["XXX"],
			["ISM-maybe"],
			["ISM-min"],
			["ISM-min0"],
			["ISM-min58"],
			["ISM-min3-max6"],
			["LDE-min10"],
			["ISM.ISM-not"],
			["ISM.ISS.IRU.RSU.SSU.SCU.SS"],
		]);
		assertDecodesToDefault(buildsSearchParams, "mode", [["XX"], ["zz"]]);
		assertDecodesToDefault(buildsSearchParams, "date", [
			["not-a-date"],
			["2026-13-99"],
			["2026-1-1"],
			["2026-01-27"],
		]);
	});
});
