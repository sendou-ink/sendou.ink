import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort } from "~/utils/schema";
import {
	BUILDS_PAGE_BATCH_SIZE,
	BUILDS_PAGE_MAX_BUILDS,
} from "./builds-constants";
import {
	abilityConditionsSchema,
	buildsDateFilterSchema,
} from "./builds-schemas";

export const buildsSearchParams = SearchParams.define({
	limit: SP.param(
		v.pipe(
			v.number(),
			v.integer(),
			v.minValue(1),
			v.maxValue(BUILDS_PAGE_MAX_BUILDS),
		),
		{
			default: BUILDS_PAGE_BATCH_SIZE,
			loader: true,
		},
	),
	abilities: SP.json(abilityConditionsSchema, {
		default: [],
		resets: ["limit"],
		loader: true,
	}),
	mode: SP.param(v.nullable(modeShort), {
		resets: ["limit"],
		loader: true,
	}),
	date: SP.param(v.nullable(buildsDateFilterSchema), {
		resets: ["limit"],
		loader: true,
	}),
});
