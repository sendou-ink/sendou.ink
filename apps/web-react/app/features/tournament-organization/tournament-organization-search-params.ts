import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const tournamentOrganizationSearchParams = SearchParams.define({
	month: SP.param(z.number().int().min(0).max(11).nullable(), { loader: true }),
	year: SP.param(z.number().int().min(2020).max(2100).nullable(), {
		loader: true,
	}),
	series: SP.param(z.number().int().positive().nullable(), { loader: true }),
	page: SP.page({ max: 100 }),
	source: SP.param(z.string().nullable(), { loader: true }),
});
