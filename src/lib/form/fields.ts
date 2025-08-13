import { safeNullableStringSchema } from '$lib/schemas';
import z from 'zod';
import type { FormField } from './types';

export const formRegistry = z.registry<FormField>();

export function textFieldOptional(args: Omit<Extract<FormField, { type: 'text-field' }>, 'type'>) {
	let schema = safeNullableStringSchema({ max: args.maxLength });

	if (args.toLowerCase) {
		schema = schema.transform((val) => val?.toLowerCase() ?? null) as unknown as typeof schema;
	}

	return schema.register(formRegistry, {
		...args,
		type: 'text-field'
	});
}

export function textAreaOptional(args: Omit<Extract<FormField, { type: 'text-area' }>, 'type'>) {
	return safeNullableStringSchema({ max: args.maxLength }).register(formRegistry, {
		...args,
		type: 'text-area'
	});
}

export function toggle(args: Omit<Extract<FormField, { type: 'toggle' }>, 'type'>) {
	return z.union([z.stringbool(), z.boolean()]).register(formRegistry, {
		...args,
		type: 'toggle'
	});
}
