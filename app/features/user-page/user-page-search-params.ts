import { z } from "zod";
import { ART_SOURCES } from "~/features/art/art-types";
import { serializedBuildCodec } from "~/features/build-analyzer/analyzer-search-params";
import { EMPTY_BUILD } from "~/features/builds/builds-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";

const BUILD_FILTER_TABS = ["ALL", "PUBLIC", "PRIVATE"] as const;

export const userResultsSearchParams = SearchParams.define({
	all: SP.param(z.boolean(), {
		default: false,
		loader: true,
		resets: ["page"],
	}),
	page: SP.page(),
	tournament: SP.param(z.string().trim().min(1).max(100).nullable(), {
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
