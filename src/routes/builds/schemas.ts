import { z } from 'zod/v4';
import { ability, modeShort, safeJSONParse } from '$lib/utils/zod';

export const MAX_BUILD_FILTERS = 6;

const abilityFilterSchema = z.object({
	type: z.literal('ability'),
	ability: z.string().toUpperCase().pipe(ability),
	value: z.union([z.number(), z.boolean()]),
	comparison: z
		.string()
		.toUpperCase()
		.pipe(z.enum(['AT_LEAST', 'AT_MOST']))
		.optional()
});

const modeFilterSchema = z.object({
	type: z.literal('mode'),
	mode: z.string().toUpperCase().pipe(modeShort)
});

const dateFilterSchema = z.object({
	type: z.literal('date'),
	date: z.string()
});

export const buildFiltersSearchParams = z.preprocess(
	safeJSONParse,
	z.union([
		z.null(),
		z
			.array(z.union([abilityFilterSchema, modeFilterSchema, dateFilterSchema]))
			.max(MAX_BUILD_FILTERS)
	])
);

export type BuildFiltersFromSearchParams = NonNullable<z.infer<typeof buildFiltersSearchParams>>;
