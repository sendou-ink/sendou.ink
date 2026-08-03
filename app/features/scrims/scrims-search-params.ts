import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import * as Scrim from "./core/Scrim";
import { scrimsFiltersSchema } from "./scrims-schemas";

export const scrimsSearchParams = SearchParams.define({
	filters: SP.json(scrimsFiltersSchema, {
		default: Scrim.defaultFilters(),
		loader: true,
	}),
	pendingRequestPostId: SP.param(z.number().int().positive().nullable(), {
		loader: false,
	}),
});
