import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort } from "~/utils/zod";
import {
	BUILDS_PAGE_BATCH_SIZE,
	BUILDS_PAGE_MAX_BUILDS,
} from "./builds-constants";
import {
	abilityConditionsSchema,
	buildsDateFilterSchema,
} from "./builds-schemas";

export const buildsSearchParams = SearchParams.define({
	limit: SP.param(z.number().int().min(1).max(BUILDS_PAGE_MAX_BUILDS), {
		default: BUILDS_PAGE_BATCH_SIZE,
		loader: true,
	}),
	abilities: SP.json(abilityConditionsSchema, {
		default: [],
		resets: ["limit"],
		loader: true,
	}),
	mode: SP.param(modeShort.nullable(), {
		resets: ["limit"],
		loader: true,
	}),
	date: SP.param(buildsDateFilterSchema.nullable(), {
		resets: ["limit"],
		loader: true,
	}),
});
