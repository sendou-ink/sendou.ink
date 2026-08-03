import { z } from "zod";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";

export const GLOBAL_SEARCH_TYPES = [
	"weapons",
	"users",
	"teams",
	"organizations",
	"tournaments",
] as const;
export type GlobalSearchType = (typeof GLOBAL_SEARCH_TYPES)[number];

export const globalSearchSearchParams = SearchParams.define({
	search: SP.param(z.enum(["open"]).nullable(), {
		default: null, // xxx: do we want to repeat default: null or just default to that when possible?
		loader: false,
	}),
	type: SP.param(z.enum(GLOBAL_SEARCH_TYPES).nullable(), {
		default: null,
		loader: false,
	}),
	weapon: SP.param(numericEnum(mainWeaponIds).nullable(), {
		default: null,
		loader: false,
	}),
});
