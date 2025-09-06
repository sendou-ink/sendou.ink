import {
	falsyToNull,
	id,
	safeJSONParse,
	safeNullableStringSchema,
	safeStringSchema,
	weaponSplId
} from '$lib/utils/zod';
import * as z from 'zod';
import type {
	FormField,
	FormFieldArray,
	FormFieldDatetime,
	FormFieldDualSelect,
	FormFieldInputGroup,
	FormFieldItems,
	FormFieldSelect
} from './types';
import { m } from '$lib/paraglide/messages';
import { partialMapPoolWithDefaultSchema, webUrl } from '$lib/utils/zod';
import * as R from 'remeda';
import * as MapPool from '$lib/core/maps/MapPool';
import invariant from '$lib/utils/invariant';

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
	args: Omit<Extract<FormField, { type: 'text-field' }>, 'type' | 'initialValue' | 'required'>
) {
	const schema =
		args.validate === 'url'
			? webUrl
			: safeNullableStringSchema({ min: args.minLength, max: args.maxLength });

	return textFieldRefined(schema, args).register(formRegistry, {
		...args,
		required: false,
		type: 'text-field',
		initialValue: ''
	});
}

export function textFieldRequired(
	args: Omit<Extract<FormField, { type: 'text-field' }>, 'type' | 'initialValue' | 'required'>
) {
	const schema =
		args.validate === 'url'
			? webUrl
			: safeStringSchema({ min: args.minLength, max: args.maxLength });

	return textFieldRefined(schema, args).register(formRegistry, {
		...args,
		required: true,
		type: 'text-field',
		initialValue: ''
	});
}

function textFieldRefined<T extends z.ZodType<string | null>>(
	schema: T,
	args: Omit<Extract<FormField, { type: 'text-field' }>, 'type' | 'initialValue' | 'required'>
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

	if (args.validate && typeof args.validate !== 'string') {
		schema = schema.refine(
			(val) => {
				// if it's not supposed be null, other check will catch it
				if (val === null) return true;

				return (args.validate as { func: (value: string) => boolean }).func(val);
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

export function textAreaOptional(
	args: Omit<Extract<FormField, { type: 'text-area' }>, 'type' | 'initialValue'>
) {
	return safeNullableStringSchema({ max: args.maxLength }).register(formRegistry, {
		...args,
		type: 'text-area',
		initialValue: ''
	});
}

export function toggle(
	args: Omit<Extract<FormField, { type: 'switch' }>, 'type' | 'initialValue'>
) {
	return z
		.union([z.stringbool(), z.boolean()])
		.optional() // optional because "off" is missing in the form data see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/checkbox#value
		.default(false)
		.register(formRegistry, {
			...args,
			type: 'switch',
			initialValue: false
		});
}

function itemsSchema<V extends string>(items: FormFieldItems<V>) {
	return z.enum(items.map((item) => item.value));
}

function clearableItemsSchema<V extends string>(items: FormFieldItems<V>) {
	return z.preprocess(falsyToNull, z.enum(items.map((item) => item.value)).nullable());
}

export function selectOptional<V extends string>(
	args: Omit<FormFieldSelect<'select', V>, 'type' | 'initialValue' | 'clearable'>
) {
	return clearableItemsSchema(args.items).register(formRegistry, {
		...args,
		type: 'select',
		initialValue: null,
		clearable: true
	});
}

export function select<V extends string>(
	args: Omit<FormFieldSelect<'select', V>, 'type' | 'initialValue' | 'clearable'>
) {
	return itemsSchema(args.items).register(formRegistry, {
		...args,
		type: 'select',
		initialValue: args.items[0].value,
		clearable: false
	});
}

export function multiSelectOptional<V extends string>(
	args: Omit<FormFieldSelect<'multi-select', V>, 'type' | 'initialValue' | 'clearable'>
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
			type: 'multi-select',
			initialValue: [],
			clearable: true
		});
}

export function dualSelectOptional<V extends string>(
	args: Omit<FormFieldDualSelect<'dual-select', V>, 'type' | 'initialValue' | 'clearable'>
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
		type: 'dual-select',
		clearable: true
	});
}

export function radioGroup<V extends string>(
	args: Omit<FormFieldInputGroup<'radio-group', V>, 'type' | 'initialValue'>
) {
	return itemsSchema(args.items).register(formRegistry, {
		...args,
		type: 'radio-group',
		initialValue: args.items[0].value
	});
}

type DateTimeArgs = Omit<FormFieldDatetime<'datetime'>, 'type' | 'initialValue' | 'required'>;

function dateTimePreprocess(value: unknown) {
	if (typeof value !== 'string') return value;
	if (value === '') return;

	return new Date(value);
}

export function datetimeRequired(args: DateTimeArgs) {
	return z
		.preprocess(
			dateTimePreprocess,
			z
				.date({ error: m.common_forms_errors_required() })
				.min(args.min ?? new Date(Date.UTC(2015, 4, 28)))
				.max(args.max ?? new Date(Date.UTC(2030, 4, 28)))
		)
		.register(formRegistry, {
			...args,
			type: 'datetime',
			initialValue: null,
			required: true
		});
}

export function datetimeOptional(args: DateTimeArgs) {
	return z
		.preprocess(
			dateTimePreprocess,
			z
				.date()
				.min(args.min ?? new Date(Date.UTC(2015, 4, 28)))
				.max(args.max ?? new Date(Date.UTC(2030, 4, 28)))
				.optional()
		)
		.register(formRegistry, {
			...args,
			type: 'datetime',
			initialValue: null,
			required: false
		});
}

export function checkboxGroup<V extends string>(
	args: Omit<FormFieldInputGroup<'checkbox-group', V>, 'type' | 'initialValue'>
) {
	return z
		.preprocess(
			(value) => {
				if (Array.isArray(value)) return value;
				if (typeof value === 'string') return [value];
				if (!value) return [];
			},
			z.array(itemsSchema(args.items)).min(args.minLength ?? 1, {
				error: m.least_sea_beetle_adapt()
			})
		)
		.register(formRegistry, {
			...args,
			type: 'checkbox-group',
			initialValue: []
		});
}

export function weaponPool(
	args: Omit<Extract<FormField, { type: 'weapon-pool' }>, 'type' | 'initialValue'>
) {
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
			type: 'weapon-pool',
			initialValue: []
		});
}

export function mapPool(
	args: Omit<Extract<FormField, { type: 'map-pool' }>, 'type' | 'initialValue'>
) {
	return z
		.preprocess(safeJSONParse, partialMapPoolWithDefaultSchema(args))
		.refine(
			(mapPool) => {
				if (!args.minCount) return true;

				invariant(args.modes, 'If minCount is set, modes must be set');

				for (const mode of args.modes) {
					if (!mapPool[mode]?.length || mapPool[mode]?.length < args.minCount) {
						return false;
					}
				}
			},
			{ error: `Every mode should contain at least the minimum amount of maps (${args.minCount})` } // xxx: translate, involve maxCount?
		)
		.register(formRegistry, {
			...args,
			type: 'map-pool',
			initialValue: MapPool.empty()
		});
}

export function themeOptional(
	args: Omit<Extract<FormField, { type: 'theme' }>, 'type' | 'initialValue'>
) {
	return z
		.unknown() // xxx: CustomizedColors
		.optional()
		.register(formRegistry, {
			...args,
			type: 'theme',
			initialValue: null
		});
}

export function imageOptional(
	args: Omit<Extract<FormField, { type: 'image' }>, 'type' | 'initialValue'>
) {
	return z
		.preprocess(
			(value) => {
				if (typeof window === 'undefined') return null; // xxx: implement sending images serverside

				if (!(value instanceof File)) return value;

				if (value.name === '') return undefined;

				return value;
			},
			z
				.file()
				.max(2_000_000) // 2MB
				.mime('image/webp')
				.nullish()
		)
		.register(formRegistry, {
			...args,
			type: 'image',
			initialValue: null
		});
}

export function stringConstant() {
	return z.string().max(100).register(formRegistry, {
		type: 'string-constant',
		initialValue: null
	});
}

export function stringConstantOptional() {
	return z.string().max(100).optional().register(formRegistry, {
		type: 'string-constant',
		initialValue: null
	});
}

export function idConstant() {
	return id.register(formRegistry, {
		type: 'id-constant',
		initialValue: null
	});
}

export function idConstantOptional() {
	return id.optional().register(formRegistry, {
		type: 'id-constant',
		initialValue: null
	});
}

export function array<S extends z.ZodType>(
	args: Omit<FormFieldArray<'array', S>, 'type' | 'initialValue'>
) {
	return z
		.preprocess((value) => (!value ? [] : value), z.array(args.field).min(args.min).max(args.max))
		.register(formRegistry, {
			...args,
			type: 'array',
			initialValue: []
		});
}
