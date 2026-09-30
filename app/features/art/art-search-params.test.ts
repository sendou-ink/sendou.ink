import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	artGridSearchParams,
	artNewSearchParams,
	artSearchParams,
} from "./art-search-params";

describe("artSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(artSearchParams, {
			tag: ["cat", "some tag"],
			tab: ["recently-uploaded", "showcase"],
			open: [true, false],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(artSearchParams, "tab", [["not-a-tab"]]);
		assertDecodesToDefault(artSearchParams, "open", [["yes"], ["1"]]);
	});
});

describe("artGridSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(artGridSearchParams, {
			big: [1, 42],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(artGridSearchParams, "big", [
			["abc"],
			["-1"],
			["1.5"],
		]);
	});
});

describe("artNewSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(artNewSearchParams, {
			art: [1, 999],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(artNewSearchParams, "art", [["abc"], ["0"]]);
	});
});
