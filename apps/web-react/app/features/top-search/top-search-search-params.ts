import { z } from "zod";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const topSearchSearchParams = SearchParams.define({
	mode: SP.param(z.enum(rankedModesShort), { default: "SZ", loader: true }),
	region: SP.param(z.enum(["WEST", "JPN"]), { default: "WEST", loader: true }),
	month: SP.param(z.number().int().min(1).max(12).nullable(), { loader: true }),
	year: SP.param(z.number().int().min(2023).nullable(), { loader: true }),
});
