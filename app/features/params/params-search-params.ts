import * as v from "valibot";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";

export const weaponParamsSearchParams = SearchParams.define({
	tab: SP.param(v.picklist(["params", "patches"]), {
		default: "params",
		loader: false,
	}),
	hidden: SP.param(v.array(v.pipe(v.number(), v.integer())), {
		default: [],
		loader: false,
	}),
	kit: SP.param(numericEnum(mainWeaponIds).nullable(), { loader: false }),
	kitExtras: SP.param(v.boolean(), { default: true, loader: false }),
});
