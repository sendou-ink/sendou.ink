import * as R from "remeda";
import * as v from "valibot";
import {
	IN_GAME_NAME_MAX_LENGTH,
	inGameNameIsValid,
	normalizeInGameName,
} from "~/features/user-page/in-game-name";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { canonicalWeaponSplId } from "~/modules/in-game-lists/weapon-ids";
import type { AnySyncSchema, DayMonthYear } from "~/utils/schema";
import {
	coerceNumber,
	date,
	falsyToNull,
	id,
	preprocess,
	safeNullableStringSchema,
	safeStringSchema,
	stageId,
	timeString,
	weaponSplId,
} from "~/utils/schema";
import { imageValue } from "./image-field";
import type {
	BadgeOption,
	FieldWithOptions,
	FormField,
	FormFieldArray,
	FormFieldDatetime,
	FormFieldDualSelect,
	FormFieldFieldset,
	FormFieldInputGroup,
	FormFieldItems,
	FormFieldItemsWithImage,
	FormFieldSelect,
	FormsTranslationKey,
	SelectOption,
	TeamSearchFieldOptions,
	TournamentSearchFieldOptions,
	TrophyOption,
} from "./types";

export const formRegistry = new WeakMap<object, FormField>();

/** Clones the schema first so shared instances (e.g. `id`, `stageId`) each get their own registry entry. */
function register<T extends AnySyncSchema>(schema: T, metadata: FormField): T {
	const clone = { ...schema };
	formRegistry.set(clone, metadata);
	return clone;
}

/** Looks up a schema's form field metadata. */
export function getFormFieldMetadata(
	schema: AnySyncSchema,
): FormField | undefined {
	return formRegistry.get(schema);
}

export type RequiresDefault<T extends AnySyncSchema> = T & {
	_requiresDefault: true;
};

// a builder's signature declares what `defaultValues` must supply and returns `as never`; parsing starts from `unknown`

type WithTypedTranslationKeys<T> = Omit<
	T,
	"label" | "bottomText" | "placeholder"
> & {
	label?: FormsTranslationKey;
	bottomText?: FormsTranslationKey;
	placeholder?: FormsTranslationKey;
};

type TypedItemLabel<V extends string> = {
	label: FormsTranslationKey | (() => string);
	value: V;
};

type WithTypedItemLabels<T, V extends string> = Omit<T, "items"> & {
	items: Array<TypedItemLabel<V>>;
};

type WithTypedItemLabelsWithImage<T, V extends string> = Omit<T, "items"> & {
	items: Array<TypedItemLabel<V> & { imgSrc?: string }>;
};

type WithTypedDualSelectFields<T, V extends string> = Omit<
	T,
	"fields" | "validate"
> & {
	fields: [
		{
			label?: FormsTranslationKey;
			items: Array<{ label: FormsTranslationKey | (() => string); value: V }>;
		},
		{
			label?: FormsTranslationKey;
			items: Array<{ label: FormsTranslationKey | (() => string); value: V }>;
		},
	];
	validate?: {
		func: (value: [V | null, V | null]) => boolean;
		message: FormsTranslationKey;
	};
};

function prefixKey(key: FormsTranslationKey | undefined): string | undefined {
	return key ? `forms:${key}` : undefined;
}

function prefixItems<V extends string, T extends TypedItemLabel<V>>(
	items: Array<T>,
) {
	return items.map((item) => ({
		...item,
		label: typeof item.label === "string" ? `forms:${item.label}` : item.label,
	}));
}

export function image(args: {
	label: FormsTranslationKey;
	bottomText?: FormsTranslationKey;
	dimensions?: "logo" | "thick-banner" | { width: number; height: number };
	autoValidate?: boolean;
}) {
	return register(imageValue, {
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		dimensions: args.dimensions ?? "logo",
		autoValidate: args.autoValidate ?? false,
		type: "image",
		initialValue: null,
	});
}

export function customField<T extends AnySyncSchema>(
	args: Omit<Extract<FormField, { type: "custom" }>, "type">,
	schema: T,
) {
	return register(schema, {
		...args,
		type: "custom",
	});
}

type TextFieldArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "text-field" }>,
		"type" | "initialValue" | "required"
	>
>;

export function textFieldOptional(
	args: TextFieldArgs,
): v.GenericSchema<string | null, string | null> {
	// validated as a plain string, so unlike other optional text fields it has no null fallback and its key stays required
	if (args.validate === "url") {
		return registerTextField(
			v.pipe(v.string(), v.url()),
			args,
			false,
			false,
		) as never;
	}

	return registerTextField(
		safeNullableStringSchema({ min: args.minLength, max: args.maxLength }),
		args,
		false,
		true,
	) as never;
}

export function textField(args: TextFieldArgs): v.GenericSchema<string> {
	const schema =
		args.validate === "url"
			? v.pipe(v.string(), v.url())
			: safeStringSchema({ min: args.minLength, max: args.maxLength });

	return registerTextField(schema, args, true, false) as never;
}

function registerTextField<T extends v.GenericSchema<any, string | null>>(
	schema: T,
	args: TextFieldArgs,
	required: boolean,
	nullable: boolean,
): T {
	const refined = textFieldRefined(schema, args);
	return register(nullable ? optionalKey(refined) : refined, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		placeholder: prefixKey(args.placeholder),
		required,
		type: "text-field",
		initialValue: "",
	}) as unknown as T;
}

function textFieldRefined<T extends v.GenericSchema<any, string | null>>(
	schema: T,
	args: Omit<
		Extract<FormField, { type: "text-field" }>,
		"type" | "initialValue" | "required"
	>,
): v.GenericSchema<any, string | null> {
	let result: v.GenericSchema<any, string | null> = schema;

	if (args.regExp) {
		result = v.pipe(
			result,
			v.check((val) => {
				if (val === null) return true;
				return args.regExp!.pattern.test(val);
			}, args.regExp!.message),
		);
	}

	if (args.validate && typeof args.validate !== "string") {
		result = v.pipe(
			result,
			v.check((val) => {
				if (val === null) return true;
				return (args.validate as { func: (value: string) => boolean }).func(
					val,
				);
			}, args.validate!.message),
		);
	}

	if (args.toLowerCase) {
		result = v.pipe(
			result,
			v.transform((val) => val?.toLowerCase() ?? null),
		);
	}

	return result;
}

export function inGameName(
	args: WithTypedTranslationKeys<{
		label?: FormsTranslationKey;
		bottomText?: FormsTranslationKey;
	}>,
) {
	const schema = v.pipe(
		safeNullableStringSchema({
			max: IN_GAME_NAME_MAX_LENGTH,
		}),
		v.transform((val) => (val === null ? null : normalizeInGameName(val))),
		v.check(
			(val) => val === null || inGameNameIsValid(val),
			"forms:errors.profileInGameName",
		),
	);

	return register(optionalKey(schema), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		maxLength: IN_GAME_NAME_MAX_LENGTH,
		required: false,
		type: "in-game-name",
		initialValue: "",
	}) as unknown as v.OptionalSchema<
		v.GenericSchema<string | null, string | null>,
		null
	>;
}

type NumberFieldArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "text-field" }>,
		| "type"
		| "initialValue"
		| "required"
		| "validate"
		| "inputType"
		| "maxLength"
	>
> & { maxLength?: number };

export function numberField(
	args: NumberFieldArgs & { min?: number; max?: number },
): v.GenericSchema<number> {
	let schema: v.GenericSchema<number> = numberSchema();

	// an empty field coerces to 0, so `min` is also what rejects a blank required field
	if (typeof args.min === "number") {
		schema = v.pipe(
			schema,
			v.minValue(args.min, "forms:errors.numberOutOfRange"),
		);
	}
	if (typeof args.max === "number") {
		schema = v.pipe(
			schema,
			v.maxValue(args.max, "forms:errors.numberOutOfRange"),
		);
	}

	return register(schema, numberFieldMetadata(args, true));
}

export function numberFieldOptional(
	args: NumberFieldArgs,
): v.OptionalSchema<v.GenericSchema<number>, undefined> {
	return register(v.optional(numberSchema()), numberFieldMetadata(args, false));
}

function numberSchema(): v.GenericSchema<number> {
	return v.pipe(
		coerceNumber(),
		v.integer("forms:errors.mustBeWholeNumber"),
		v.minValue(0),
	) as never;
}

function numberFieldMetadata(args: NumberFieldArgs, required: boolean) {
	return {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		required,
		type: "text-field" as const,
		inputType: "number" as const,
		initialValue: "",
		maxLength: args.maxLength ?? 10,
	};
}

type TextAreaArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "text-area" }>,
		"type" | "initialValue" | "required"
	>
>;

export function textAreaOptional(
	args: TextAreaArgs,
): v.GenericSchema<string | null, string | null> {
	return registerTextArea(
		safeNullableStringSchema({ max: args.maxLength }),
		args,
		false,
	) as never;
}

export function textArea(args: TextAreaArgs): v.GenericSchema<string> {
	return registerTextArea(
		safeStringSchema({ max: args.maxLength }),
		args,
		true,
	) as never;
}

function registerTextArea<T extends v.GenericSchema<any, string | null>>(
	schema: T,
	args: TextAreaArgs,
	required: boolean,
): T {
	return register((required ? schema : optionalKey(schema)) as T, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		required,
		type: "text-area",
		initialValue: "",
	});
}

export function toggle(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "switch" }>, "type" | "initialValue">
	> & {
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

/**
 * `v.object` requires every key whose schema isn't optional, and a `preprocess` pipe hides the nullable
 * wrapper; the `null` default goes through the schema so an absent field parses like an explicit `null`.
 */
function optionalKey<TSchema extends v.GenericSchema<any, any>>(
	schema: TSchema,
) {
	return v.optional(schema, null);
}

/** Without `NoInfer`, a builder inline in `v.object({...})` has `V` driven from the return position, widening literals to `string`. */
type ItemValue<V extends string> = NoInfer<V>;

function itemsSchema<V extends string>(items: FormFieldItems<V>) {
	return v.picklist(items.map((item) => item.value) as [V, ...V[]]);
}

function clearableItemsSchema<V extends string>(items: FormFieldItems<V>) {
	return preprocess(
		falsyToNull,
		v.nullable(v.picklist(items.map((item) => item.value) as [V, ...V[]])),
	);
}

export function selectOptional<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabels<
			Omit<FormFieldSelect<"select", V>, "type" | "initialValue" | "clearable">,
			V
		>
	>,
): v.GenericSchema<ItemValue<V> | null, ItemValue<V> | null> {
	return register(optionalKey(clearableItemsSchema(args.items)), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "select",
		initialValue: null,
		clearable: true,
	}) as never;
}

export function select<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabels<
			Omit<FormFieldSelect<"select", V>, "type" | "initialValue" | "clearable">,
			V
		>
	> & {
		/** Value selected when the form has no default value for the field. Defaults to the first item. */
		initialValue?: V;
	},
): v.GenericSchema<ItemValue<V>, ItemValue<V>> {
	return register(itemsSchema(args.items), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "select",
		initialValue: args.initialValue ?? args.items[0].value,
		clearable: false,
	});
}

export function selectDynamic(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "select-dynamic" }>,
			"type" | "initialValue" | "clearable"
		>
	> & {
		/** Value used when the form has no default value for the field. Defaults to no selection. */
		initialValue?: string;
	},
) {
	return register(v.string(), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "select-dynamic",
		initialValue: args.initialValue ?? null,
		clearable: false,
	}) as unknown as v.GenericSchema<string> & FieldWithOptions<SelectOption[]>;
}

export function selectDynamicOptional(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "select-dynamic" }>,
			"type" | "initialValue" | "clearable"
		>
	>,
) {
	return register(
		optionalKey(preprocess(falsyToNull, v.nullable(v.string()))),
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "select-dynamic",
			initialValue: null,
			clearable: true,
		},
	) as unknown as v.GenericSchema<string | null, string | null> &
		FieldWithOptions<SelectOption[]>;
}

/** Value schema of a dual select, before the `optional` wrapper is applied. */
type DualSelectSchema<V extends string> = v.GenericSchema<
	[unknown, unknown],
	[V | null, V | null]
>;

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
): v.OptionalSchema<DualSelectSchema<ItemValue<V>>, undefined> {
	// `optional` stays outermost so `v.object` reads the key as optional (a pipe would hide the wrapper)
	const tuple = v.tuple([
		clearableItemsSchema(args.fields[0].items),
		clearableItemsSchema(args.fields[1].items),
	]);

	const schema: DualSelectSchema<V> = args.validate
		? v.pipe(
				tuple,
				v.check(
					([first, second]) => args.validate!.func([first, second]),
					`forms:${args.validate!.message}`,
				),
			)
		: tuple;

	return register(v.optional(schema), {
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
	} as unknown as FormField);
}

export function radioGroup<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabelsWithImage<
			Omit<FormFieldInputGroup<"radio-group", V>, "type" | "initialValue">,
			V
		>
	>,
): v.GenericSchema<ItemValue<V>, ItemValue<V>> {
	return register(itemsSchema(args.items), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		items: prefixItems(args.items),
		type: "radio-group",
		initialValue: args.items[0].value,
	});
}

export function radioGroupDynamic(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "radio-group-dynamic" }>,
			"type" | "initialValue"
		>
	>,
) {
	return register(v.string(), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "radio-group-dynamic",
		initialValue: null,
	}) as unknown as v.GenericSchema<string> &
		FieldWithOptions<FormFieldItemsWithImage<string>>;
}

export function checkboxGroupDynamic(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "checkbox-group-dynamic" }>,
			"type" | "initialValue"
		>
	>,
) {
	return register(
		v.pipe(
			v.array(v.string()),
			v.minLength(args.minLength ?? 0, "forms:errors.required"),
			v.check((val) => val.length === R.unique(val).length),
		),
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "checkbox-group-dynamic",
			initialValue: [],
		},
	) as unknown as v.GenericSchema<string[]> &
		FieldWithOptions<FormFieldItemsWithImage<string>>;
}

type DateTimeArgs = WithTypedTranslationKeys<
	Omit<FormFieldDatetime<"datetime">, "type" | "initialValue" | "required">
> & {
	minMessage?: FormsTranslationKey;
	maxMessage?: FormsTranslationKey;
};

function boundedDate(args: DateTimeArgs, schema: v.GenericSchema<Date, Date>) {
	const resolveMin = args.min ?? (() => new Date(Date.UTC(2015, 4, 28)));
	const resolveMax = args.max ?? (() => new Date(Date.UTC(2030, 4, 28)));

	return v.pipe(
		schema,
		v.check(
			(d) => d >= resolveMin(),
			`forms:${args.minMessage ?? "errors.dateTooEarly"}`,
		),
		v.check(
			(d) => d <= resolveMax(),
			`forms:${args.maxMessage ?? "errors.dateTooLate"}`,
		),
	);
}

function datetimeMetadata(
	args: DateTimeArgs,
	overrides: { type: "datetime" | "date"; required: boolean },
) {
	return {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		initialValue: null,
		...overrides,
	};
}

export function datetime(args: DateTimeArgs): v.GenericSchema<Date> {
	return register(
		preprocess(date, boundedDate(args, v.date("forms:errors.required"))),
		datetimeMetadata(args, { type: "datetime", required: true }),
	) as never;
}

export function datetimeOptional(
	args: DateTimeArgs,
): v.NullishSchema<v.GenericSchema<Date>, undefined> {
	// `nullish` stays outermost so `v.object` reads the key as optional (a pipe would hide the wrapper)
	return register(
		v.nullish(preprocess(date, boundedDate(args, v.date()))),
		datetimeMetadata(args, { type: "datetime", required: false }),
	) as never;
}

export function dayMonthYear(
	args: DateTimeArgs,
): v.GenericSchema<Date, DayMonthYear> {
	return register(
		v.pipe(
			preprocess(date, boundedDate(args, v.date("forms:errors.required"))),
			v.transform((d) => ({
				day: d.getDate(),
				month: d.getMonth(),
				year: d.getFullYear(),
			})),
		),
		datetimeMetadata(args, { type: "date", required: true }),
	) as never;
}

export function checkboxGroup<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabelsWithImage<
			Omit<FormFieldInputGroup<"checkbox-group", V>, "type" | "initialValue">,
			V
		>
	>,
): v.GenericSchema<ItemValue<V>[], ItemValue<V>[]> {
	return register(
		v.pipe(
			v.array(itemsSchema(args.items)),
			v.minLength(args.minLength ?? 0),
			v.check((val) => val.length === R.unique(val).length),
		),
		{
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			items: prefixItems(args.items),
			type: "checkbox-group",
			initialValue: [],
		},
	);
}

export function weaponPool(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "weapon-pool" }>, "type" | "initialValue">
	>,
) {
	type WeaponPoolInput = Array<{
		id: v.InferInput<typeof weaponSplId>;
		isFavorite: boolean;
	}>;
	type WeaponPoolValue = Array<{
		id: v.InferOutput<typeof weaponSplId>;
		isFavorite: boolean;
	}>;
	let schema: v.GenericSchema<WeaponPoolInput, WeaponPoolValue> = v.pipe(
		v.array(
			v.object({
				id: weaponSplId,
				isFavorite: v.boolean(),
			}),
		),
		v.minLength(args.minCount ?? 0),
		v.maxLength(args.maxCount),
	);

	if (!args.allowDuplicates) {
		schema = v.pipe(
			schema,
			v.check(
				(val) => val.length === R.uniqueBy(val, (item) => item.id).length,
			),
		);
	}

	if (args.disableAltSkinDuplicates) {
		schema = v.pipe(
			schema,
			v.check(
				(val) =>
					val.length ===
					R.uniqueBy(val, (item) => canonicalWeaponSplId(item.id)).length,
			),
		);
	}

	return register(schema, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "weapon-pool",
		initialValue: [],
	});
}

/**
 * Renders no control, for values the user never edits (e.g. a discriminator from the loader). Without
 * `initialValue` the field requires an entry in the form's `defaultValues`.
 */
export function hidden<T extends AnySyncSchema>(
	schema: T,
	initialValue: v.InferInput<T>,
): T;
export function hidden<T extends AnySyncSchema>(schema: T): RequiresDefault<T>;
export function hidden<T extends AnySyncSchema>(
	schema: T,
	initialValue?: v.InferInput<T>,
) {
	return register(schema, {
		type: "hidden",
		initialValue,
	}) as never;
}

export function stringConstant<T extends string>(value: T) {
	return hidden(v.literal(value), value);
}

export function idConstant<T extends number>(
	value: T,
): v.LiteralSchema<T, undefined>;
export function idConstant(): RequiresDefault<v.GenericSchema<number, number>>;
export function idConstant<T extends number>(value?: T) {
	return (
		value !== undefined ? hidden(v.literal(value), value) : hidden(id)
	) as never;
}

export function idConstantOptional<T extends number>(value?: T) {
	return value
		? hidden(v.optional(v.literal(value)), value)
		: hidden(v.optional(id), undefined);
}

export function array<S extends AnySyncSchema>(
	args: WithTypedTranslationKeys<
		Omit<FormFieldArray<"array", S>, "type" | "initialValue">
	>,
) {
	const schema = v.pipe(
		v.array(args.field),
		v.minLength(args.min ?? 0),
		v.maxLength(args.max),
	);
	return register(schema, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "array",
		initialValue: [],
	} as FormField);
}

type TimeRangeArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "time-range" }>,
		"type" | "initialValue" | "startLabel" | "endLabel"
	>
> & {
	startLabel?: FormsTranslationKey;
	endLabel?: FormsTranslationKey;
};

export function timeRangeOptional(args: TimeRangeArgs) {
	return register(
		v.nullable(
			v.object({
				start: timeString,
				end: timeString,
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

export function fieldset<S extends v.ObjectEntries>(
	args: WithTypedTranslationKeys<
		Omit<FormFieldFieldset<"fieldset", S>, "type" | "initialValue" | "fields">
	> & { fields: v.ObjectSchema<S, undefined> },
): v.ObjectSchema<S, undefined> {
	return register(args.fields, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "fieldset",
		initialValue: {},
	} as FormField);
}

type UserSearchArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "user-search" }>,
		"type" | "initialValue" | "required"
	>
>;

export function userSearch(args: UserSearchArgs): v.GenericSchema<number> {
	return register(id, userSearchMetadata(args, true)) as never;
}

export function userSearchOptional(
	args: UserSearchArgs,
): v.OptionalSchema<v.GenericSchema<number>, undefined> {
	return register(v.optional(id), userSearchMetadata(args, false)) as never;
}

function userSearchMetadata(args: UserSearchArgs, required: boolean) {
	return {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "user-search" as const,
		initialValue: null,
		required,
	};
}

export function tournamentSearchOptional(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "tournament-search" }>,
			"type" | "initialValue" | "required"
		>
	>,
) {
	return register(optionalKey(preprocess(falsyToNull, v.nullable(id))), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "tournament-search",
		initialValue: null,
		required: false,
	}) as unknown as v.GenericSchema<number | null, number | null> &
		FieldWithOptions<TournamentSearchFieldOptions>;
}

export function teamSearchOptional(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "team-search" }>,
			"type" | "initialValue" | "required"
		>
	>,
) {
	return register(optionalKey(preprocess(falsyToNull, v.nullable(id))), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "team-search",
		initialValue: null,
		required: false,
	}) as unknown as v.GenericSchema<number | null, number | null> &
		FieldWithOptions<TeamSearchFieldOptions>;
}

export function badges(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "badges" }>, "type" | "initialValue">
	>,
) {
	return register(v.pipe(v.array(id), v.maxLength(args.maxCount ?? 50)), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "badges",
		initialValue: [],
	}) as unknown as v.GenericSchema<number[], number[]> &
		FieldWithOptions<BadgeOption[]>;
}

export function trophies(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "trophies" }>, "type" | "initialValue">
	>,
) {
	return register(v.pipe(v.array(id), v.maxLength(args.maxCount ?? 100)), {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "trophies",
		initialValue: [],
	}) as unknown as v.GenericSchema<number[], number[]> &
		FieldWithOptions<TrophyOption[]>;
}

export function stageSelect(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "stage-select" }>,
			"type" | "initialValue" | "required"
		>
	>,
): v.GenericSchema<StageId> {
	return register(stageId, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "stage-select",
		initialValue: 1,
		required: true,
	}) as never;
}

type WeaponSelectArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "weapon-select" }>,
		"type" | "initialValue" | "required"
	>
>;

export function weaponSelect(
	args: WeaponSelectArgs,
): v.GenericSchema<MainWeaponId> {
	return register(weaponSplId, weaponSelectMetadata(args, true)) as never;
}

export function weaponSelectOptional(
	args: WeaponSelectArgs,
): v.OptionalSchema<v.GenericSchema<MainWeaponId>, undefined> {
	return register(
		v.optional(weaponSplId),
		weaponSelectMetadata(args, false),
	) as never;
}

function weaponSelectMetadata(args: WeaponSelectArgs, required: boolean) {
	return {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "weapon-select" as const,
		initialValue: null,
		required,
	};
}
