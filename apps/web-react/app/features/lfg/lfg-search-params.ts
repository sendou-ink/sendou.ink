import { mainWeaponIds } from "@sendou/in-game-lists/weapon-ids";
import { z } from "zod";
import { TIERS, type TierName } from "~/features/mmr/mmr-constants";
import {
	languagesUnified,
	type UnifiedLanguageCode,
} from "~/modules/i18n/config";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";
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
	post: SP.param(z.number().int().positive().nullable(), { loader: true }),
	weapons: SP.param(
		z.array(numericEnum(mainWeaponIds)).max(LFG.MAX_WEAPON_FILTERS),
		{ default: [], ...FILTER_OPTIONS },
	),
	type: SP.param(z.enum(LFG_TYPES).nullable(), FILTER_OPTIONS),
	timezone: SP.param(
		z.number().int().min(0).max(12).nullable(),
		FILTER_OPTIONS,
	),
	language: SP.param(z.enum(LANGUAGE_CODES).nullable(), FILTER_OPTIONS),
	plusTier: SP.param(z.number().int().min(1).max(3).nullable(), FILTER_OPTIONS),
	minTier: SP.param(z.enum(TIER_NAMES).nullable(), FILTER_OPTIONS),
	maxTier: SP.param(z.enum(TIER_NAMES).nullable(), FILTER_OPTIONS),
});

export const lfgNewSearchParams = SearchParams.define({
	postId: SP.param(z.number().int().positive().nullable(), { loader: true }),
});
