import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { lfgNewSearchParams, lfgSearchParams } from "./lfg-search-params";
import type { LFGFilter } from "./lfg-types";

const weaponFilter: LFGFilter = { _tag: "Weapon", weaponSplIds: [0, 10] };
const typeFilter: LFGFilter = { _tag: "Type", type: "PLAYER_FOR_TEAM" };
const timezoneFilter: LFGFilter = { _tag: "Timezone", maxHourDifference: 3 };
const languageFilter: LFGFilter = { _tag: "Language", language: "en" };
const plusTierFilter: LFGFilter = { _tag: "PlusTier", tier: 1 };
const maxTierFilter: LFGFilter = { _tag: "MaxTier", tier: "GOLD" };
const minTierFilter: LFGFilter = { _tag: "MinTier", tier: "BRONZE" };

describe("lfgSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(lfgSearchParams, {
			q: [
				[],
				[weaponFilter],
				[typeFilter],
				[timezoneFilter],
				[languageFilter],
				[plusTierFilter],
				[maxTierFilter],
				[minTierFilter],
				[weaponFilter, typeFilter, minTierFilter],
			],
		});
	});
});

describe("lfgNewSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(lfgNewSearchParams, {
			postId: [1, 123],
		});
	});

	it("garbage decodes to default", () => {
		assertDecodesToDefault(lfgNewSearchParams, "postId", [["abc"], ["0"]]);
	});
});
