import { z } from "zod";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";

export const weaponParamsSearchParams = SearchParams.define({
	tab: SP.param(z.enum(["params", "patches"]), {
		default: "params",
		loader: false,
	}),
	hidden: SP.param(z.array(z.number().int()), {
		default: [],
		loader: false,
	}),
	kit: SP.param(numericEnum(mainWeaponIds).nullable(), { loader: false }),
	kitExtras: SP.param(z.boolean(), { default: true, loader: false }),
});
