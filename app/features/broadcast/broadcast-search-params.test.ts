import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	broadcastDashboardSearchParams,
	broadcastDesignSearchParams,
	broadcastOverlaySearchParams,
	broadcastStreamSearchParams,
} from "./broadcast-search-params";

describe("broadcastOverlaySearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(broadcastOverlaySearchParams, {
			view: ["live", "next"],
			preview: [false, true],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(broadcastOverlaySearchParams, "view", [["garbage"]]);
	});
});

describe("broadcastStreamSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(broadcastStreamSearchParams, {
			role: ["source", "preview", "dashboard", "scanner"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(broadcastStreamSearchParams, "role", [["garbage"]]);
	});
});

describe("broadcastDashboardSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(broadcastDashboardSearchParams, {
			tab: ["setup", "theme"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(broadcastDashboardSearchParams, "tab", [
			["garbage"],
		]);
	});
});

describe("broadcastDesignSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(broadcastDesignSearchParams, {
			scene: ["game", "bracket", "starting"],
			footage: ["gameplay", "minimap", "none"],
			transition: ["stinger", "fade", "cut"],
			names: ["short", "typical", "long"],
			set: ["start", "ongoing", "decider", "over"],
			bestOf: [3, 5, 7],
			ink: [null, "lockYellowPurple", "pinkGreen"],
			swapSides: [false, true],
			seeds: [true, false],
			logos: [false, true],
			placeholderLogos: [true, false],
			players: [4, 1, 3],
			casters: [2, 0, 3],
			otherMatches: [4, 0, 8],
			headline: [true, false],
			bracket: ["double_elimination", "swiss"],
			bracketFocus: ["remaining", "whole"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(broadcastDesignSearchParams, "bestOf", [
			["4"],
			["garbage"],
		]);
		assertDecodesToDefault(broadcastDesignSearchParams, "players", [
			["5"],
			["0"],
		]);
		assertDecodesToDefault(broadcastDesignSearchParams, "ink", [["garbage"]]);
	});
});
