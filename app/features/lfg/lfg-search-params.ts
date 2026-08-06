import { z } from "zod";
import { TIERS, type TierName } from "~/features/mmr/mmr-constants";
import {
	languagesUnified,
	type UnifiedLanguageCode,
} from "~/modules/i18n/config";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";
import { LFG, LFG_TYPES } from "./lfg-constants";

const LANGUAGE_CODES = languagesUnified.map((language) => language.code) as [
	UnifiedLanguageCode,
	...UnifiedLanguageCode[],
];
const TIER_NAMES = TIERS.map((tier) => tier.name) as [TierName, ...TierName[]];

export const lfgSearchParams = SearchParams.define({
	weapons: SP.param(
		z.array(numericEnum(mainWeaponIds)).max(LFG.MAX_WEAPON_FILTERS),
		{ default: [], loader: false },
	),
	type: SP.param(z.enum(LFG_TYPES).nullable(), { loader: false }),
	timezone: SP.param(z.number().int().min(0).max(12).nullable(), {
		loader: false,
	}),
	language: SP.param(z.enum(LANGUAGE_CODES).nullable(), { loader: false }),
	plusTier: SP.param(z.number().int().min(1).max(3).nullable(), {
		loader: false,
	}),
	minTier: SP.param(z.enum(TIER_NAMES).nullable(), { loader: false }),
	maxTier: SP.param(z.enum(TIER_NAMES).nullable(), { loader: false }),
});

export const lfgNewSearchParams = SearchParams.define({
	postId: SP.param(z.number().int().positive().nullable(), { loader: true }),
});
