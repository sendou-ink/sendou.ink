import {
	falsyToNull,
	safeJSONParse,
	safeNullableStringSchema,
	safeStringSchema,
	weaponSplId
} from '$lib/schemas';
import z from 'zod';
import type {
	FormField,
	FormFieldDualSelect,
	FormFieldInputGroup,
	FormFieldItems,
	FormFieldSelect
} from './types';
import { m } from '$lib/paraglide/messages';
import { modeShort, stageId } from '$lib/utils/zod';
import * as R from 'remeda';

export const formRegistry = z.registry<FormField>();

/** Field for custom JSON data, the form field element must be provided to the `<Form />`. .optional() is appended to the schema. */
export function customJsonFieldOptional<T extends z.ZodType>(
	args: Omit<Extract<FormField, { type: 'custom' }>, 'type'>,
	schema: T
) {
	return z.preprocess(safeJSONParse, schema.optional()).register(formRegistry, {
		...args,
		type: 'custom'
	});
}

export function textFieldOptional(
	args: Omit<Extract<FormField, { type: 'text-field' }>, 'type' | 'required'>
) {
	const schema = safeNullableStringSchema({ min: args.minLength, max: args.maxLength });

	return textFieldRefined(schema, args).register(formRegistry, {
		...args,
		required: false,
		type: 'text-field'
	});
}

export function textFieldRequired(
	args: Omit<Extract<FormField, { type: 'text-field' }>, 'type' | 'required'>
) {
	const schema = safeStringSchema({ min: args.minLength, max: args.maxLength });

	return textFieldRefined(schema, args).register(formRegistry, {
		...args,
		required: true,
		type: 'text-field'
	});
}

function textFieldRefined<T extends z.ZodType<string | null>>(
	schema: T,
	args: Omit<Extract<FormField, { type: 'text-field' }>, 'type' | 'required'>
) {
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

	if (args.validate) {
		schema = schema.refine(
			(val) => {
				// if it's not supposed be null, other check will catch it
				if (val === null) return true;

				return args.validate!.func(val);
			},
			{
				message: args.validate!.message
			}
		);
	}

	if (args.toLowerCase) {
		schema = schema.transform((val) => val?.toLowerCase() ?? null) as unknown as typeof schema;
	}

	return schema;
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

function itemsSchema<V extends string>(items: FormFieldItems<V>) {
	return z.enum(items.map((item) => item.value));
}

function clearableItemsSchema<V extends string>(items: FormFieldItems<V>) {
	return z.preprocess(falsyToNull, z.enum(items.map((item) => item.value)).nullable());
}

export function selectOptional<V extends string>(args: Omit<FormFieldSelect<'select', V>, 'type'>) {
	return clearableItemsSchema(args.items).register(formRegistry, {
		...args,
		type: 'select'
	});
}

export function multiSelectOptional<V extends string>(
	args: Omit<FormFieldSelect<'multi-select', V>, 'type'>
) {
	return z
		.preprocess(
			safeJSONParse,
			z
				.array(itemsSchema(args.items))
				.min(1)
				.refine((val) => {
					return !val || val.length === R.unique(val).length;
				})
				.optional()
		)
		.register(formRegistry, {
			...args,
			type: 'multi-select'
		});
}

export function dualSelectOptional<V extends string>(
	args: Omit<FormFieldDualSelect<'dual-select', V>, 'type'>
) {
	let schema = z.preprocess(
		safeJSONParse,
		z
			.tuple([
				clearableItemsSchema(args.fields[0].items),
				clearableItemsSchema(args.fields[1].items)
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

	// @ts-expect-error TODO: not sure why TS doesn't like this
	return schema.register(formRegistry, {
		...args,
		type: 'dual-select'
	});
}

export function radioGroup<V extends string>(
	args: Omit<FormFieldInputGroup<'radio-group', V>, 'type'>
) {
	return itemsSchema(args.items).register(formRegistry, {
		...args,
		type: 'radio-group'
	});
}

export function checkboxGroup<V extends string>(
	args: Omit<FormFieldInputGroup<'checkbox-group', V>, 'type'>
) {
	return z
		.preprocess(
			(value) => {
				if (Array.isArray(value)) return value;
				if (typeof value === 'string') return [value];
				if (!value) return [];
			},
			z.array(itemsSchema(args.items)).min(1, {
				error: m.least_sea_beetle_adapt()
			})
		)
		.register(formRegistry, {
			...args,
			type: 'checkbox-group'
		});
}

export function weaponPool(args: Omit<Extract<FormField, { type: 'weapon-pool' }>, 'type'>) {
	return z
		.preprocess(
			safeJSONParse,
			z
				.array(
					z.object({
						id: weaponSplId,
						isFavorite: z.boolean()
					})
				)
				.max(args.maxCount)
				.refine((val) => {
					return val.length === R.uniqueBy(val, (item) => item.id).length;
				})
		)
		.register(formRegistry, {
			...args,
			type: 'weapon-pool'
		});
}

export function mapPool(args: Omit<Extract<FormField, { type: 'map-pool' }>, 'type'>) {
	return z
		.preprocess(
			safeJSONParse,
			z.partialRecord(
				modeShort,
				z
					.array(stageId)
					.refine((items) => new Set(items).size === items.length)
					.min(1)
					.max(args.maxCount)
			)
		)
		.register(formRegistry, {
			...args,
			type: 'map-pool'
		});
}

export function themeOptional(args: Omit<Extract<FormField, { type: 'theme' }>, 'type'>) {
	return z
		.unknown() // xxx: CustomizedColors
		.optional()
		.register(formRegistry, {
			...args,
			type: 'theme'
		});
}
