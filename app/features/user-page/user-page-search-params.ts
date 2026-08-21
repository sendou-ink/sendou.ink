import * as v from "valibot";
import { ART_SOURCES } from "~/features/art/art-types";
import { serializedBuildCodec } from "~/features/build-analyzer/analyzer-search-params";
import { EMPTY_BUILD } from "~/features/builds/builds-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	BEST_TIER_NUMBER,
	TIER_NUMBERS,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { codec, SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/schema";
import {
	RESULT_PLACEMENT_FILTERS,
	RESULT_SOURCES,
	RESULTS_FIRST_YEAR,
} from "./user-page-constants";

const BUILD_FILTER_TABS = ["ALL", "PUBLIC", "PRIVATE"] as const;

const resultYear = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(RESULTS_FIRST_YEAR),
	v.check((year) => year <= new Date().getFullYear()),
);

const resultsFilterName = v.nullable(
	v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
);

export const userResultsSearchParams = SearchParams.define({
	/** Only applies to users who have highlighted results. */
	highlightsOnly: SP.param(v.boolean(), {
		default: true,
		loader: true,
		resets: ["page"],
	}),
	page: SP.page(),
	tournament: SP.param(resultsFilterName, {
		loader: true,
		resets: ["page"],
	}),
	team: SP.param(resultsFilterName, {
		loader: true,
		resets: ["page"],
	}),
	mate: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
		resets: ["page"],
	}),
	minTier: SP.param(numericEnum(TIER_NUMBERS), {
		default: BEST_TIER_NUMBER,
		loader: true,
		resets: ["page"],
	}),
	maxTier: SP.param(numericEnum(TIER_NUMBERS), {
		default: WORST_TIER_NUMBER,
		loader: true,
		resets: ["page"],
	}),
	maxPlacement: SP.param(v.nullable(numericEnum(RESULT_PLACEMENT_FILTERS)), {
		loader: true,
		resets: ["page"],
	}),
	fromYear: SP.param(v.nullable(resultYear), {
		loader: true,
		resets: ["page"],
		timeDependent: true,
	}),
	toYear: SP.param(v.nullable(resultYear), {
		loader: true,
		resets: ["page"],
		timeDependent: true,
	}),
	source: SP.param(v.picklist(RESULT_SOURCES), {
		default: "ALL",
		loader: true,
		resets: ["page"],
	}),
	minParticipantCount: SP.param(
		v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(9999)),
		{
			default: 0,
			loader: true,
			resets: ["page"],
		},
	),
});

const startedSeason = v.pipe(
	v.number(),
	v.integer(),
	v.check((nth) => Seasons.allStarted(new Date()).includes(nth)),
);

export const userSeasonsSearchParams = SearchParams.define({
	page: SP.page(),
	info: SP.param(v.picklist(["weapons", "stages", "mates", "enemies"]), {
		default: "weapons",
		loader: true,
	}),
	season: SP.param(v.nullable(startedSeason), {
		loader: true,
		resets: ["page"],
		timeDependent: true,
	}),
});

export const userSeasonSummaryGraphicSearchParams = SearchParams.define({
	season: SP.param(v.nullable(startedSeason), {
		loader: true,
		timeDependent: true,
	}),
});

const buildsWeaponFilterCodec = codec(
	v.union([v.picklist(BUILD_FILTER_TABS), numericEnum(mainWeaponIds)]),
	{
		decode: (value) => {
			if ((BUILD_FILTER_TABS as readonly string[]).includes(value)) {
				return value as (typeof BUILD_FILTER_TABS)[number];
			}
			const weaponId = value.trim() === "" ? Number.NaN : Number(value);
			if ((mainWeaponIds as readonly number[]).includes(weaponId)) {
				return weaponId as MainWeaponId;
			}
			return undefined;
		},
		encode: (value) => String(value),
	},
);

export const userBuildsSearchParams = SearchParams.define({
	weapon: SP.custom(buildsWeaponFilterCodec, { default: "ALL", loader: false }),
	sorting: SP.param(v.boolean(), { default: false, loader: false }),
});

export const userArtSearchParams = SearchParams.define({
	source: SP.param(v.picklist(ART_SOURCES), { default: "ALL", loader: false }),
	tag: SP.param(v.nullable(v.string()), { loader: false }),
});

export const userBuildsNewSearchParams = SearchParams.define({
	buildId: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
	weapon: SP.param(v.nullable(numericEnum(mainWeaponIds)), { loader: true }),
	build: SP.custom(serializedBuildCodec, {
		default: EMPTY_BUILD,
		loader: true,
	}),
});
