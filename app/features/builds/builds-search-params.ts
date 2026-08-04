import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import {
	BUILDS_PAGE_BATCH_SIZE,
	BUILDS_PAGE_MAX_BUILDS,
} from "./builds-constants";
import { buildFiltersSchema } from "./builds-schemas";

export const buildsSearchParams = SearchParams.define({
	limit: SP.param(z.number().int().min(1).max(BUILDS_PAGE_MAX_BUILDS), {
		default: BUILDS_PAGE_BATCH_SIZE,
		loader: true,
	}),
	f: SP.json(buildFiltersSchema, {
		default: [],
		resets: ["limit"],
		loader: true,
	}),
});
