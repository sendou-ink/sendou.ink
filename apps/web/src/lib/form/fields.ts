import * as v from "valibot";
import {
	coercedDate,
	falsyToNull,
	id,
	safeNullableStringSchema,
	safeStringSchema,
	stageId,
} from "#lib/utils/schemas.ts";
import type {
	FieldWithOptions,
	FormField,
	FormFieldDualSelect,
	FormFieldItems,
	FormFieldSelect,
	SelectOption,
} from "./form-types.ts";

/**
 * Valibot port of `~/form/fields.ts`: schema builders that attach form-field
 * metadata, letting `<FormField name="..." />` render the right control from
 * the schema alone. Only the builders the migrated features use exist yet.
 */

const formRegistry = new WeakMap<object, FormField>();

/** Looks up a schema's form field metadata. */
export function getFormFieldMetadata(schema: unknown): FormField | undefined {
	if (typeof schema !== "object" || schema === null) return undefined;
	return formRegistry.get(schema);
}

function register<T extends object>(schema: T, metadata: FormField): T {
	formRegistry.set(schema, metadata);
	return schema;
}

function prefixKey(key: string | undefined): string | undefined {
	return key ? `forms:${key}` : undefined;
}

function prefixItems<V extends string>(items: FormFieldItems<V>) {
	return items.map((item) => ({
		...item,
		label: typeof item.label === "string" ? `forms:${item.label}` : item.label,
	}));
}

interface CommonFieldArgs {
	label?: string;
	bottomText?: string;
}

type TextFieldArgs = CommonFieldArgs & {
	minLength?: number;
	maxLength: number;
	toLowerCase?: boolean;
	leftAddon?: string;
	placeholder?: string;
	inputType?: "text" | "number";
	regExp?: { pattern: RegExp; message: string };
	validate?:
		| "url"
		| { func: (value: string) => boolean; message: string };
};

export function textFieldOptional(args: TextFieldArgs) {
	const base =
		args.validate === "url"
			? v.nullable(v.pipe(v.string(), v.url()))
			: safeNullableStringSchema({ min: args.minLength, max: args.maxLength });

	return register(textFieldRefined(base, args), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		placeholder: prefixKey(args.placeholder),
		required: false,
		type: "text-field",
		initialValue: "",
	});
}

export function textField(args: TextFieldArgs) {
	const base =
		args.validate === "url"
			? v.pipe(v.string(), v.url())
			: safeStringSchema({ min: args.minLength, max: args.maxLength });

	return register(textFieldRefined(base, args), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		placeholder: prefixKey(args.placeholder),
		required: true,
		type: "text-field",
		initialValue: "",
	});
}

function textFieldRefined<
	T extends v.GenericSchema<unknown, string | null>,
>(schema: T, args: TextFieldArgs) {
	const checks: Array<v.GenericPipeAction<string | null, string | null>> = [];

	if (args.regExp) {
		checks.push(
			v.check(
				(val: string | null) => val === null || args.regExp!.pattern.test(val),
				args.regExp.message,
			),
		);
	}

	if (args.validate && typeof args.validate !== "string") {
		const { func, message } = args.validate;
		checks.push(
			v.check((val: string | null) => val === null || func(val), message),
		);
	}

	if (args.toLowerCase) {
		checks.push(v.transform((val) => val?.toLowerCase() ?? null));
	}

	if (checks.length === 0) return schema as v.GenericSchema<unknown, string | null>;

	return v.pipe(schema, ...(checks as [])) as v.GenericSchema<
		unknown,
		string | null
	>;
}

type TextAreaArgs = CommonFieldArgs & { maxLength: number };

export function textArea(args: TextAreaArgs) {
	return register(safeStringSchema({ max: args.maxLength }), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		required: true,
		type: "text-area",
		initialValue: "",
	});
}

export function textAreaOptional(args: TextAreaArgs) {
	return register(safeNullableStringSchema({ max: args.maxLength }), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		required: false,
		type: "text-area",
		initialValue: "",
	});
}

export function toggle(
	args: CommonFieldArgs & {
		/** Value used when the form has no default value for the field. Defaults to `false`. */
		initialValue?: boolean;
	},
) {
	return register(v.optional(v.boolean(), false), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "switch",
		initialValue: args.initialValue ?? false,
	});
}

function itemsSchema<V extends string>(items: FormFieldItems<V>) {
	return v.picklist(items.map((item) => item.value));
}

function clearableItemsSchema<V extends string>(items: FormFieldItems<V>) {
	return v.pipe(
		v.unknown(),
		v.transform(falsyToNull),
		v.nullable(itemsSchema(items)),
	);
}

type SelectArgs<V extends string> = CommonFieldArgs & {
	items: FormFieldItems<V>;
};

export function select<V extends string>(
	args: SelectArgs<V> & {
		/** Value selected when the form has no default value for the field. Defaults to the first item. */
		initialValue?: V;
	},
) {
	return register(itemsSchema(args.items), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "select",
		initialValue: args.initialValue ?? args.items[0].value,
		clearable: false,
	} satisfies FormFieldSelect<"select", V>);
}

export function selectOptional<V extends string>(args: SelectArgs<V>) {
	return register(clearableItemsSchema(args.items), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "select",
		initialValue: null,
		clearable: true,
	} satisfies FormFieldSelect<"select", V>);
}

export function selectDynamicOptional(args: CommonFieldArgs) {
	return register(
		v.pipe(v.unknown(), v.transform(falsyToNull), v.nullable(v.string())),
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "select-dynamic",
			initialValue: null,
			clearable: true,
		},
	) as unknown as v.GenericSchema<unknown, string | null> &
		FieldWithOptions<SelectOption[]>;
}

export function dualSelectOptional<V extends string>(
	args: Omit<CommonFieldArgs, "label"> & {
		bottomText?: string;
		fields: [
			{ label?: string; items: FormFieldItems<V> },
			{ label?: string; items: FormFieldItems<V> },
		];
		validate?: {
			func: (value: [V | null, V | null]) => boolean;
			message: string;
		};
	},
) {
	let schema: v.GenericSchema<unknown, [V | null, V | null] | undefined> =
		v.optional(
			v.tuple([
				clearableItemsSchema(args.fields[0].items),
				clearableItemsSchema(args.fields[1].items),
			]) as unknown as v.GenericSchema<unknown, [V | null, V | null]>,
		);

	if (args.validate) {
		const { func, message } = args.validate;
		schema = v.pipe(
			schema,
			v.check((val) => (val ? func(val) : true), `forms:${message}`),
		);
	}

	return register(schema, {
		...args,
		bottomText: prefixKey(args.bottomText),
		fields: args.fields.map((field) => ({
			...field,
			label: prefixKey(field.label),
			items: prefixItems(field.items),
		})),
		type: "dual-select",
		initialValue: [null, null],
		clearable: true,
	} as unknown as FormFieldDualSelect<"dual-select", string>);
}

export function radioGroupDynamic(args: CommonFieldArgs) {
	return register(v.string(), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "radio-group-dynamic",
		initialValue: null,
	}) as unknown as v.GenericSchema<string> &
		FieldWithOptions<FormFieldItemsWithImageForOptions>;
}

type FormFieldItemsWithImageForOptions = Array<{
	label: string | (() => string);
	value: string;
	imgSrc?: string;
}>;

type DateTimeArgs = CommonFieldArgs & {
	min?: () => Date;
	max?: () => Date;
	minMessage?: string;
	maxMessage?: string;
};

export function datetime(args: DateTimeArgs) {
	const resolveMin = args.min ?? (() => new Date(Date.UTC(2015, 4, 28)));
	const resolveMax = args.max ?? (() => new Date(Date.UTC(2030, 4, 28)));

	return register(
		coercedDate(
			v.check(
				(d) => d >= resolveMin(),
				`forms:${args.minMessage ?? "errors.dateTooEarly"}`,
			),
			v.check(
				(d) => d <= resolveMax(),
				`forms:${args.maxMessage ?? "errors.dateTooLate"}`,
			),
		),
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "datetime",
			required: true,
			initialValue: null,
		},
	);
}

type TimeRangeArgs = CommonFieldArgs & {
	startLabel?: string;
	endLabel?: string;
};

export function timeRangeOptional(args: TimeRangeArgs) {
	return register(
		v.nullable(
			v.object({
				start: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):([0-5]\d)$/)),
				end: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):([0-5]\d)$/)),
			}),
		),
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			startLabel: prefixKey(args.startLabel),
			endLabel: prefixKey(args.endLabel),
			type: "time-range",
			initialValue: null,
		},
	);
}

export function stageSelect(args: CommonFieldArgs) {
	return register(stageId, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "stage-select",
		initialValue: 1,
		required: true,
	});
}

export function tournamentSearchOptional(args: CommonFieldArgs) {
	return register(
		v.pipe(v.unknown(), v.transform(falsyToNull), v.nullable(id)),
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "tournament-search",
			initialValue: null,
			required: false,
		},
	);
}

export function customField<T extends v.GenericSchema<any, any>>(
	args: { initialValue: unknown },
	schema: T,
): T {
	return register(schema, {
		...args,
		type: "custom",
	});
}

/**
 * Field that renders no control at all. Use it for values the form needs to
 * submit but the user never edits, e.g. an id seeded from the page's data.
 *
 * Pass `initialValue` to hardcode the starting value. Omitting it makes the
 * field require a matching entry in the form's `defaultValues`.
 */
export function hidden<T extends v.GenericSchema<any, any>>(
	schema: T,
	initialValue?: unknown,
): T {
	return register(schema, {
		type: "hidden",
		initialValue,
	});
}

export function stringConstant<T extends string>(value: T) {
	return hidden(v.literal(value), value);
}

export function idConstant(value?: number) {
	return value !== undefined
		? hidden(v.literal(value), value)
		: hidden(v.pipe(v.number(), v.integer(), v.minValue(1)));
}
