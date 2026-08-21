import * as v from "valibot";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/schema";

export const GLOBAL_SEARCH_TYPES = [
	"weapons",
	"users",
	"teams",
	"organizations",
	"tournaments",
] as const;
export type GlobalSearchType = (typeof GLOBAL_SEARCH_TYPES)[number];

export const globalSearchSearchParams = SearchParams.define({
	search: SP.param(v.nullable(v.picklist(["open"])), { loader: false }),
	type: SP.param(v.nullable(v.picklist(GLOBAL_SEARCH_TYPES)), {
		loader: false,
	}),
	weapon: SP.param(v.nullable(numericEnum(mainWeaponIds)), { loader: false }),
});
