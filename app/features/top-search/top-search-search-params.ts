import * as v from "valibot";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const topSearchSearchParams = SearchParams.define({
	mode: SP.param(v.picklist(rankedModesShort), { default: "SZ", loader: true }),
	region: SP.param(v.picklist(["WEST", "JPN"]), {
		default: "WEST",
		loader: true,
	}),
	month: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12))),
		{ loader: true },
	),
	year: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(2023))),
		{ loader: true },
	),
});
