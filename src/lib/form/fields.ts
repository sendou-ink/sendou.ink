import { falsyToNull, safeJSONParse, safeNullableStringSchema, weaponSplId } from '$lib/schemas';
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

function clearableSelectFieldSchema(items: Extract<FormField, { type: 'select' }>['items']) {
	return z.preprocess(
		falsyToNull,
		z
			.string()
			.refine((val) => val === null || items.some((item) => item.value === val))
			.nullable()
	);
}

// xxx: strong typing
export function selectOptional(args: Omit<Extract<FormField, { type: 'select' }>, 'type'>) {
	return clearableSelectFieldSchema(args.items).register(formRegistry, {
		...args,
		type: 'select'
	});
}

// xxx: strong typing
export function dualSelectOptional(
	args: Omit<Extract<FormField, { type: 'dual-select' }>, 'type'>
) {
	let schema = z.preprocess(
		safeJSONParse,
		z
			.tuple([
				clearableSelectFieldSchema(args.fields[0].items),
				clearableSelectFieldSchema(args.fields[1].items)
			])
			.optional()
	);

	if (args.validate) {
		schema = schema.refine(
			(val) => {
				if (!val) return true;

				const [first, second] = val;
				return args.validate!.func([first, second]);
			},
			{
				message: args.validate!.message
			}
		);
	}

	return schema.register(formRegistry, {
		...args,
		type: 'dual-select'
	});
}

export function weaponPool(args: Omit<Extract<FormField, { type: 'weapon-pool' }>, 'type'>) {
	return z
		.preprocess(
			safeJSONParse,
			z
				.array(
					z.object({
						weaponSplId,
						isFavorite: z.boolean()
					})
				)
				.max(5)
		)
		.register(formRegistry, {
			...args,
			type: 'weapon-pool'
		});
}
