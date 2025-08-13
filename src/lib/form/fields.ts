import { safeNullableStringSchema } from '$lib/schemas';
import z from 'zod';
import type { FormField } from './types';

export const formRegistry = z.registry<FormField>();

export function textFieldOptional(args: Omit<Extract<FormField, { type: 'text-field' }>, 'type'>) {
	let schema = safeNullableStringSchema({ max: args.maxLength });

	if (args.regExp) {
		schema = schema.refine(
			(val) => {
				if (val === null) return true;

				return args.regExp!.pattern.test(val);
			},
			{
				message: args.regExp!.message
			}
		);
	}

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

export function toggle(args: Omit<Extract<FormField, { type: 'switch' }>, 'type'>) {
	return z
		.union([z.stringbool(), z.boolean()])
		.optional() // optional because "off" is missing in the form data see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/checkbox#value
		.default(false)
		.register(formRegistry, {
			...args,
			type: 'switch'
		});
}
