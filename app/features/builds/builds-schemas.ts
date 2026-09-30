import * as v from "valibot";
import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { isValidDate } from "~/utils/dates";
import { ability } from "~/utils/schema";
import { MAX_BUILD_FILTERS } from "./builds-constants";

const abilityConditionSchema = v.object({
	ability: v.pipe(v.string(), v.toUpperCase(), ability),
	value: v.union([
		v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_AP)),
		v.boolean(),
	]),
	comparison: v.optional(
		v.pipe(v.string(), v.toUpperCase(), v.picklist(["AT_LEAST", "AT_MOST"])),
	),
});

export const abilityConditionsSchema = v.pipe(
	v.array(abilityConditionSchema),
	v.maxLength(MAX_BUILD_FILTERS),
);

export const buildsDateFilterSchema = v.pipe(
	v.string(),
	v.regex(/^\d{4}-\d{2}-\d{2}$/),
	v.check((value) => isValidDate(new Date(value))),
);
