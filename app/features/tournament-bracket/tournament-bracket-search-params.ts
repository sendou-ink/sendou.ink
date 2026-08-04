import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const tournamentBracketsSearchParams = SearchParams.define({
	idx: SP.param(z.number().int().min(0).nullable(), { loader: true }),
	group: SP.param(z.number().int().nullable(), { loader: false }),
});
