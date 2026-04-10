import { z } from "zod";
import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { ability, modeShort, safeJSONParse } from "~/utils/zod";
import { MAX_BUILD_FILTERS } from "./builds-constants";

const abilityFilterSchema = z.object({
	type: z.literal("ability"),
	ability: z.string().toUpperCase().pipe(ability),
	value: z.union([z.int().min(0).max(MAX_AP), z.boolean()]),
	comparison: z
		.string()
		.toUpperCase()
		.pipe(z.enum(["AT_LEAST", "AT_MOST"]))
		.optional(),
});

const modeFilterSchema = z.object({
	type: z.literal("mode"),
	mode: z.string().toUpperCase().pipe(modeShort),
});

const dateFilterSchema = z.object({
	type: z.literal("date"),
	date: z.iso.date(),
});

export const buildFiltersSearchParams = z.preprocess(
	safeJSONParse,
	z.union([
		z.null(),
		z
			.array(z.union([abilityFilterSchema, modeFilterSchema, dateFilterSchema]))
			.max(MAX_BUILD_FILTERS),
	]),
);

export type BuildFiltersFromSearchParams = NonNullable<
	z.infer<typeof buildFiltersSearchParams>
>;
