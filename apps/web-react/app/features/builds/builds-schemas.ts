import { MAX_AP } from "@sendou/build-analyzer/analyzer-constants";
import { z } from "zod";
import { isValidDate } from "~/utils/dates";
import { ability } from "~/utils/zod";
import { MAX_BUILD_FILTERS } from "./builds-constants";

const abilityConditionSchema = z.object({
	ability: z.string().toUpperCase().pipe(ability),
	value: z.union([z.int().min(0).max(MAX_AP), z.boolean()]),
	comparison: z
		.string()
		.toUpperCase()
		.pipe(z.enum(["AT_LEAST", "AT_MOST"]))
		.optional(),
});

export const abilityConditionsSchema = z
	.array(abilityConditionSchema)
	.max(MAX_BUILD_FILTERS);

export const buildsDateFilterSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => isValidDate(new Date(value)));
