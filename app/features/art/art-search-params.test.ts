import { describe, it } from "vitest";
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
	it("round-trips", () => {
		assertRoundTrips(artSearchParams, {
			tag: ["cat", "some tag"],
			tab: ["recently-uploaded", "showcase"],
			open: [true, false],
		});
	});

	it("garbage decodes to default", () => {
		assertDecodesToDefault(artSearchParams, "tab", [["not-a-tab"]]);
		assertDecodesToDefault(artSearchParams, "open", [["yes"], ["1"]]);
	});
});

describe("artGridSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(artGridSearchParams, {
			big: [1, 42],
		});
	});

	it("garbage decodes to default", () => {
		assertDecodesToDefault(artGridSearchParams, "big", [
			["abc"],
			["-1"],
			["1.5"],
		]);
	});
});

describe("artNewSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(artNewSearchParams, {
			art: [1, 999],
		});
	});

	it("garbage decodes to default", () => {
		assertDecodesToDefault(artNewSearchParams, "art", [["abc"], ["0"]]);
	});
});
