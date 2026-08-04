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
	search: SP.param(z.enum(["open"]).nullable(), { loader: false }),
	type: SP.param(z.enum(GLOBAL_SEARCH_TYPES).nullable(), { loader: false }),
	weapon: SP.param(numericEnum(mainWeaponIds).nullable(), { loader: false }),
});
