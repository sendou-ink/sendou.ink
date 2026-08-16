import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { lfgNewSearchParams, lfgSearchParams } from "./lfg-search-params";

describe("lfgSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(lfgSearchParams, {
			page: [1, 2, 9],
			post: [null, 1, 123],
			weapons: [[], [0], [0, 10, 4001]],
			type: [null, "PLAYER_FOR_TEAM", "COACH_FOR_TEAM"],
			timezone: [null, 0, 3, 12],
			language: [null, "en", "ja"],
			plusTier: [null, 1, 3],
			minTier: [null, "GOLD", "LEVIATHAN"],
			maxTier: [null, "PLATINUM", "IRON"],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(lfgSearchParams, "page", [["0"], ["-1"], ["abc"]]);
		assertDecodesToDefault(lfgSearchParams, "post", [["abc"], ["0"]]);
		assertDecodesToDefault(lfgSearchParams, "type", [["NOT_A_TYPE"], [""]]);
		assertDecodesToDefault(lfgSearchParams, "timezone", [
			["13"],
			["-1"],
			["abc"],
		]);
		assertDecodesToDefault(lfgSearchParams, "language", [["xx"]]);
		assertDecodesToDefault(lfgSearchParams, "plusTier", [["0"], ["4"]]);
		assertDecodesToDefault(lfgSearchParams, "minTier", [["gold"], ["XX"]]);
	});
});

describe("lfgNewSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(lfgNewSearchParams, {
			postId: [1, 123],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(lfgNewSearchParams, "postId", [["abc"], ["0"]]);
	});
});
