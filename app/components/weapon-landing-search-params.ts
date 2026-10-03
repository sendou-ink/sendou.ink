import * as v from "valibot";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const weaponLandingSearchParams = SearchParams.define({
	category: SP.param(
		v.nullable(
			v.picklist([
				...weaponCategories.map((category) => category.name),
				"SUBS",
				"SPECIALS",
			]),
		),
		{ loader: false },
	),
});
