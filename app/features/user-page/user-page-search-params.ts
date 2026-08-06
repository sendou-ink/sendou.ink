import { z } from "zod";
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
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";
import {
	RESULT_PLACEMENT_FILTERS,
	RESULT_SOURCES,
	RESULTS_FIRST_YEAR,
} from "./user-page-constants";

const BUILD_FILTER_TABS = ["ALL", "PUBLIC", "PRIVATE"] as const;

const resultYear = z
	.number()
	.int()
	.min(RESULTS_FIRST_YEAR)
	.refine((year) => year <= new Date().getFullYear());

const resultsFilterName = z.string().trim().min(1).max(100).nullable();

export const userResultsSearchParams = SearchParams.define({
	/** Only applies to users who have highlighted results. */
	highlightsOnly: SP.param(z.boolean(), {
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
	mate: SP.param(z.number().int().positive().nullable(), {
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
	maxPlacement: SP.param(numericEnum(RESULT_PLACEMENT_FILTERS).nullable(), {
		loader: true,
		resets: ["page"],
	}),
	fromYear: SP.param(resultYear.nullable(), {
		loader: true,
		resets: ["page"],
	}),
	toYear: SP.param(resultYear.nullable(), {
		loader: true,
		resets: ["page"],
	}),
	source: SP.param(z.enum(RESULT_SOURCES), {
		default: "ALL",
		loader: true,
		resets: ["page"],
	}),
	minParticipantCount: SP.param(z.number().int().nonnegative().max(9999), {
		default: 0,
		loader: true,
		resets: ["page"],
	}),
});

const startedSeason = z
	.number()
	.int()
	.refine((nth) => Seasons.allStarted(new Date()).includes(nth));

export const userSeasonsSearchParams = SearchParams.define({
	page: SP.page(),
	info: SP.param(z.enum(["weapons", "stages", "mates", "enemies"]), {
		default: "weapons",
		loader: true,
	}),
	season: SP.param(startedSeason.nullable(), {
		loader: true,
		resets: ["page"],
	}),
});

export const userSeasonSummaryGraphicSearchParams = SearchParams.define({
	season: SP.param(startedSeason.nullable(), { loader: true }),
});

const buildsWeaponFilterCodec = z.codec(
	z.string(),
	z.union([z.enum(BUILD_FILTER_TABS), numericEnum(mainWeaponIds)]),
	{
		decode: (value, payload) => {
			if ((BUILD_FILTER_TABS as readonly string[]).includes(value)) {
				return value as (typeof BUILD_FILTER_TABS)[number];
			}
			const weaponId = value.trim() === "" ? Number.NaN : Number(value);
			if ((mainWeaponIds as readonly number[]).includes(weaponId)) {
				return weaponId as MainWeaponId;
			}
			payload.issues.push({
				code: "custom",
				message: "Invalid builds weapon filter",
				input: value,
			});
			return z.NEVER;
		},
		encode: (value) => String(value),
	},
);

export const userBuildsSearchParams = SearchParams.define({
	weapon: SP.custom(buildsWeaponFilterCodec, { default: "ALL", loader: false }),
	sorting: SP.param(z.boolean(), { default: false, loader: false }),
});

export const userArtSearchParams = SearchParams.define({
	source: SP.param(z.enum(ART_SOURCES), { default: "ALL", loader: false }),
	tag: SP.param(z.string().nullable(), { loader: false }),
});

export const userBuildsNewSearchParams = SearchParams.define({
	buildId: SP.param(z.number().int().positive().nullable(), { loader: true }),
	weapon: SP.param(numericEnum(mainWeaponIds).nullable(), { loader: true }),
	build: SP.custom(serializedBuildCodec, {
		default: EMPTY_BUILD,
		loader: true,
	}),
});
