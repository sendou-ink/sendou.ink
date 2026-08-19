import * as v from "valibot";
import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { isValidDate } from "~/utils/dates";
import { ability } from "~/utils/zod";
import { MAX_BUILD_FILTERS } from "./builds-constants";

const abilityConditionSchema = v.object({
	ability: v.pipe(v.string(), v.toUpperCase())(ability),
	value: v.union([v.int().min(0).max(MAX_AP), v.boolean()]),
	comparison: v.pipe(v.string(), v.toUpperCase())(v.picklist(["AT_LEAST", "AT_MOST"]))
		.optional(),
});

export const abilityConditionsSchema = v.pipe(v.array(abilityConditionSchema), v.maxLength(MAX_BUILD_FILTERS));

export const buildsDateFilterSchema = v.pipe(
    v.string(),
    v.regex(/^\d{4}-\d{2}-\d{2}$/),
    v.check((value) => isValidDate(new Date(value)))
);
