import * as v from "valibot";
import { TIERS, type TierName } from "~/features/mmr/mmr-constants";
import {
	languagesUnified,
	type UnifiedLanguageCode,
} from "~/modules/i18n/config";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/schema";
import { LFG, LFG_TYPES } from "./lfg-constants";

const LANGUAGE_CODES = languagesUnified.map((language) => language.code) as [
	UnifiedLanguageCode,
	...UnifiedLanguageCode[],
];
const TIER_NAMES = TIERS.map((tier) => tier.name) as [TierName, ...TierName[]];

const FILTER_OPTIONS = { loader: true, resets: ["page", "post"] };

export const lfgSearchParams = SearchParams.define({
	page: SP.page({ resets: ["post"] }),
	/** Post to jump to: the loader serves the page containing it, overriding `page`. */
	post: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
	weapons: SP.param(
		v.pipe(
			v.array(numericEnum(mainWeaponIds)),
			v.maxLength(LFG.MAX_WEAPON_FILTERS),
		),
		{ default: [], ...FILTER_OPTIONS },
	),
	type: SP.param(v.nullable(v.picklist(LFG_TYPES)), FILTER_OPTIONS),
	timezone: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(12))),
		FILTER_OPTIONS,
	),
	language: SP.param(v.nullable(v.picklist(LANGUAGE_CODES)), FILTER_OPTIONS),
	plusTier: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3))),
		FILTER_OPTIONS,
	),
	minTier: SP.param(v.nullable(v.picklist(TIER_NAMES)), FILTER_OPTIONS),
	maxTier: SP.param(v.nullable(v.picklist(TIER_NAMES)), FILTER_OPTIONS),
});

export const lfgNewSearchParams = SearchParams.define({
	postId: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
});
