import * as R from "remeda";
import { z } from "zod";
import {
	falsyToNull,
	id,
	modeShort,
	safeJSONParse,
	safeNullableStringSchema,
	safeStringSchema,
	stageId,
	weaponSplId,
} from "~/utils/zod";
import type {
	FormField,
	FormFieldArray,
	FormFieldDatetime,
	FormFieldDualSelect,
	FormFieldInputGroup,
	FormFieldItems,
	FormFieldSelect,
	FormsTranslationKey,
} from "./types";

export const formRegistry = z.registry<FormField>();

type WithTypedTranslationKeys<T> = Omit<T, "label" | "bottomText"> & {
	label?: FormsTranslationKey;
	bottomText?: FormsTranslationKey;
};

type WithTypedItemLabels<T, V extends string> = Omit<T, "items"> & {
	items: Array<{ label: FormsTranslationKey; value: V }>;
};

type WithTypedDualSelectFields<T, V extends string> = Omit<T, "fields"> & {
	fields: [
		{
			label?: FormsTranslationKey;
			items: Array<{ label: FormsTranslationKey; value: V }>;
		},
		{
			label?: FormsTranslationKey;
			items: Array<{ label: FormsTranslationKey; value: V }>;
		},
	];
};

function prefixKey(key: FormsTranslationKey | undefined): string | undefined {
	return key ? `forms:${key}` : undefined;
}

function prefixItems<V extends string>(items: FormFieldItems<V>) {
	return items.map((item) => ({
		...item,
		label: typeof item.label === "string" ? `forms:${item.label}` : item.label,
	}));
}

export function customJsonField<T extends z.ZodType>(
	args: Omit<Extract<FormField, { type: "custom" }>, "type">,
	schema: T,
) {
	return z.preprocess(safeJSONParse, schema.optional()).register(formRegistry, {
		...args,
		type: "custom",
	});
}

export function textFieldOptional(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "text-field" }>,
			"type" | "initialValue" | "required"
		>
	>,
) {
	const schema =
		args.validate === "url"
			? z.url()
			: safeNullableStringSchema({ min: args.minLength, max: args.maxLength });

	return textFieldRefined(schema, args).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		required: false,
		type: "text-field",
		initialValue: "",
	});
}

export function textFieldRequired(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "text-field" }>,
			"type" | "initialValue" | "required"
		>
	>,
) {
	const schema =
		args.validate === "url"
			? z.string().url()
			: safeStringSchema({ min: args.minLength, max: args.maxLength });

	return textFieldRefined(schema, args).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		required: true,
		type: "text-field",
		initialValue: "",
	});
}

function textFieldRefined<T extends z.ZodType<string | null>>(
	schema: T,
	args: Omit<
		Extract<FormField, { type: "text-field" }>,
		"type" | "initialValue" | "required"
	>,
): T {
	let result = schema as z.ZodType<string | null>;

	if (args.regExp) {
		result = result.refine(
			(val) => {
				if (val === null) return true;
				return args.regExp!.pattern.test(val);
			},
			{ message: args.regExp!.message },
		);
	}

	if (args.validate && typeof args.validate !== "string") {
		result = result.refine(
			(val) => {
				if (val === null) return true;
				return (args.validate as { func: (value: string) => boolean }).func(
					val,
				);
			},
			{ message: args.validate!.message },
		);
	}

	if (args.toLowerCase) {
		result = result.transform(
			(val) => val?.toLowerCase() ?? null,
		) as unknown as typeof result;
	}

	return result as T;
}

export function textAreaOptional(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "text-area" }>, "type" | "initialValue">
	>,
) {
	return safeNullableStringSchema({ max: args.maxLength }).register(
		formRegistry,
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "text-area",
			initialValue: "",
		},
	);
}

export function toggle(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "switch" }>, "type" | "initialValue">
	>,
) {
	return z
		.union([z.coerce.boolean(), z.boolean()])
		.optional()
		.default(false)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "switch",
			initialValue: false,
		});
}

function itemsSchema<V extends string>(items: FormFieldItems<V>) {
	return z.enum(items.map((item) => item.value) as [V, ...V[]]);
}

function clearableItemsSchema<V extends string>(items: FormFieldItems<V>) {
	return z.preprocess(
		falsyToNull,
		z.enum(items.map((item) => item.value) as [V, ...V[]]).nullable(),
	);
}

export function selectOptional<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabels<
			Omit<FormFieldSelect<"select", V>, "type" | "initialValue" | "clearable">,
			V
		>
	>,
) {
	return clearableItemsSchema(args.items).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "select",
		initialValue: null,
		clearable: true,
	});
}

export function select<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabels<
			Omit<FormFieldSelect<"select", V>, "type" | "initialValue" | "clearable">,
			V
		>
	>,
) {
	return itemsSchema(args.items).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "select",
		initialValue: args.items[0].value,
		clearable: false,
	});
}

export function multiSelectOptional<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabels<
			Omit<
				FormFieldSelect<"multi-select", V>,
				"type" | "initialValue" | "clearable"
			>,
			V
		>
	>,
) {
	return z
		.preprocess(
			safeJSONParse,
			z
				.array(itemsSchema(args.items))
				.min(1)
				.refine((val) => !val || val.length === R.unique(val).length)
				.optional(),
		)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			items: prefixItems(args.items),
			type: "multi-select",
			initialValue: [],
			clearable: true,
		});
}

export function dualSelectOptional<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedDualSelectFields<
			Omit<
				FormFieldDualSelect<"dual-select", V>,
				"type" | "initialValue" | "clearable"
			>,
			V
		>
	>,
) {
	let schema = z.preprocess(
		safeJSONParse,
		z
			.tuple([
				clearableItemsSchema(args.fields[0].items),
				clearableItemsSchema(args.fields[1].items),
			])
			.optional(),
	);

	if (args.validate) {
		schema = schema.refine(
			(val) => {
				if (!val) return true;
				const [first, second] = val;
				return args.validate!.func([first, second]);
			},
			{ message: args.validate!.message },
		);
	}

	// @ts-expect-error Complex generic type
	return schema.register(formRegistry, {
		...args,
		bottomText: prefixKey(args.bottomText),
		fields: args.fields.map((field) => ({
			...field,
			label: prefixKey(field.label),
			items: prefixItems(field.items),
		})),
		type: "dual-select",
		clearable: true,
	});
}

export function radioGroup<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabels<
			Omit<FormFieldInputGroup<"radio-group", V>, "type" | "initialValue">,
			V
		>
	>,
) {
	return itemsSchema(args.items).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "radio-group",
		initialValue: args.items[0].value,
	});
}

type DateTimeArgs = WithTypedTranslationKeys<
	Omit<FormFieldDatetime<"datetime">, "type" | "initialValue" | "required">
>;

function dateTimePreprocess(value: unknown) {
	if (typeof value !== "string") return value;
	if (value === "") return undefined;
	return new Date(value);
}

export function datetimeRequired(args: DateTimeArgs) {
	return z
		.preprocess(
			dateTimePreprocess,
			z
				.date({ message: "Required" })
				.min(args.min ?? new Date(Date.UTC(2015, 4, 28)))
				.max(args.max ?? new Date(Date.UTC(2030, 4, 28))),
		)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "datetime",
			initialValue: null,
			required: true,
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
				.optional(),
		)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "datetime",
			initialValue: null,
			required: false,
		});
}

export function checkboxGroup<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabels<
			Omit<FormFieldInputGroup<"checkbox-group", V>, "type" | "initialValue">,
			V
		>
	>,
) {
	return z
		.preprocess(
			(value) => {
				if (Array.isArray(value)) return value;
				if (typeof value === "string") return [value];
				if (!value) return [];
				return value;
			},
			z.array(itemsSchema(args.items)).min(args.minLength ?? 1, {
				message: "At least one option must be selected",
			}),
		)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			items: prefixItems(args.items),
			type: "checkbox-group",
			initialValue: [],
		});
}

export function weaponPool(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "weapon-pool" }>, "type" | "initialValue">
	>,
) {
	return z
		.preprocess(
			safeJSONParse,
			z
				.array(
					z.object({
						id: weaponSplId,
						isFavorite: z.boolean(),
					}),
				)
				.max(args.maxCount)
				.refine(
					(val) => val.length === R.uniqueBy(val, (item) => item.id).length,
				),
		)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "weapon-pool",
			initialValue: [],
		});
}

export function mapPool(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "map-pool" }>, "type" | "initialValue">
	>,
) {
	return z
		.preprocess(
			safeJSONParse,
			partialMapPoolSchema(args).refine(
				(mapPoolData) => {
					if (!args.minCount) return true;
					if (!args.modes) return true;

					for (const mode of args.modes) {
						const modePool = (
							mapPoolData as Record<string, number[] | undefined>
						)[mode];
						if (!modePool?.length || modePool.length < args.minCount) {
							return false;
						}
					}
					return true;
				},
				{
					message: `Every mode should contain at least the minimum amount of maps (${args.minCount})`,
				},
			),
		)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "map-pool",
			initialValue: {},
		});
}

function partialMapPoolSchema({
	maxCount,
	minCount,
}: {
	maxCount?: number;
	minCount?: number;
} = {}) {
	return z.record(
		modeShort,
		z
			.array(stageId)
			.refine((items) => new Set(items).size === items.length)
			.min(minCount ?? 0)
			.max(maxCount ?? 100),
	);
}

export function imageOptional(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "image" }>, "type" | "initialValue">
	>,
) {
	return z
		.union([z.string(), z.instanceof(File)])
		.optional()
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			type: "image",
			initialValue: null,
		});
}

export function stringConstant<T extends string>(value: T) {
	// @ts-expect-error Complex generic type with registry
	return z.literal(value).register(formRegistry, {
		type: "string-constant",
		initialValue: value,
		value,
	});
}

export function stringConstantOptional<T extends string>(value?: T) {
	const schema = value
		? z.literal(value).optional()
		: z.string().max(100).optional();
	return schema.register(formRegistry, {
		type: "string-constant",
		initialValue: value ?? null,
		value: value ?? null,
	});
}

export function idConstant<T extends number>(value: T) {
	// @ts-expect-error Complex generic type with registry
	return z.literal(value).register(formRegistry, {
		type: "id-constant",
		initialValue: value,
		value,
	});
}

export function idConstantOptional<T extends number>(value?: T) {
	const schema = value ? z.literal(value).optional() : id.optional();
	return schema.register(formRegistry, {
		type: "id-constant",
		initialValue: value ?? null,
		value: value ?? null,
	});
}

export function array<S extends z.ZodType>(
	args: WithTypedTranslationKeys<
		Omit<FormFieldArray<"array", S>, "type" | "initialValue">
	>,
) {
	const schema = z.preprocess(
		(value) => (!value ? [] : value),
		z.array(args.field).min(args.min).max(args.max),
	);
	// @ts-expect-error Complex generic type with registry
	return schema.register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "array",
		initialValue: [],
	});
}
