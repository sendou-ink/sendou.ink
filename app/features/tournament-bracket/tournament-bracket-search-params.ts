import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const tournamentBracketsSearchParams = SearchParams.define({
	idx: SP.param(z.number().int().min(0).nullable(), {
		loader: true,
		resets: ["group"],
	}),
	/** Group of a swiss bracket, the only type whose groups are viewed one at a time. */
	group: SP.param(z.number().int().nullable(), { loader: true }),
	/** Starting bracket idx of the league division whose brackets are shown. Leagues only. */
	division: SP.param(z.number().int().min(0).nullable(), {
		loader: true,
		resets: ["idx", "group"],
	}),
});
