import * as R from "remeda";
import { z } from "zod";
import {
	IN_GAME_NAME_MAX_LENGTH,
	inGameNameIsValid,
} from "~/features/user-page/in-game-name";
import { canonicalWeaponSplId } from "~/modules/in-game-lists/weapon-ids";
import {
	date,
	falsyToNull,
	id,
	safeNullableStringSchema,
	safeStringSchema,
	stageId,
	timeString,
	weaponSplId,
} from "~/utils/zod";
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

export const formRegistry = z.registry<FormField>();

/**
 * Looks up a schemas form field metadata. Needed to bypass the
 * registrys deep generic `get` signature which causes
 * "Type instantiation is excessively deep" errors.
 */
export function getFormFieldMetadata(schema: z.ZodType): FormField | undefined {
	const registry = formRegistry as {
		get(schema: z.ZodType): FormField | undefined;
	};
	return registry.get(schema);
}

export type RequiresDefault<T extends z.ZodType> = T & {
	_requiresDefault: true;
};

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
	// clone so each field gets its own registry entry (the shared `imageValue`
	// instance would otherwise have its metadata overwritten by later fields)
	return imageValue.clone().register(formRegistry, {
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		dimensions: args.dimensions ?? "logo",
		autoValidate: args.autoValidate ?? false,
		type: "image",
		initialValue: null,
	});
}

export function customField<T extends z.ZodType>(
	args: Omit<Extract<FormField, { type: "custom" }>, "type">,
	schema: T,
) {
	// @ts-expect-error Complex generic type with registry
	return schema.register(formRegistry, {
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

export function textFieldOptional(args: TextFieldArgs) {
	const schema =
		args.validate === "url"
			? z.url()
			: safeNullableStringSchema({ min: args.minLength, max: args.maxLength });

	return registerTextField(schema, args, false);
}

export function textField(args: TextFieldArgs) {
	const schema =
		args.validate === "url"
			? z.string().url()
			: safeStringSchema({ min: args.minLength, max: args.maxLength });

	return registerTextField(schema, args, true);
}

function registerTextField<T extends z.ZodType<string | null>>(
	schema: T,
	args: TextFieldArgs,
	required: boolean,
): T {
	const refined = textFieldRefined(schema, args) as z.ZodType<string | null>;
	return refined.register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		placeholder: prefixKey(args.placeholder),
		required,
		type: "text-field",
		initialValue: "",
	}) as T;
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

export function inGameName(
	args: WithTypedTranslationKeys<{
		label?: FormsTranslationKey;
		bottomText?: FormsTranslationKey;
	}>,
) {
	const schema = safeNullableStringSchema({
		max: IN_GAME_NAME_MAX_LENGTH,
	}).refine((val) => val === null || inGameNameIsValid(val), {
		message: "forms:errors.profileInGameName",
	});

	return schema.register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		maxLength: IN_GAME_NAME_MAX_LENGTH,
		required: false,
		type: "in-game-name",
		initialValue: "",
	});
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
) {
	let schema = numberSchema();

	// an empty field coerces to 0, so `min` is also what makes a required number
	// field reject being left blank
	if (typeof args.min === "number") {
		schema = schema.min(args.min, { message: "forms:errors.numberOutOfRange" });
	}
	if (typeof args.max === "number") {
		schema = schema.max(args.max, { message: "forms:errors.numberOutOfRange" });
	}

	return schema.register(formRegistry, numberFieldMetadata(args, true));
}

export function numberFieldOptional(args: NumberFieldArgs) {
	return numberSchema()
		.optional()
		.register(formRegistry, numberFieldMetadata(args, false));
}

function numberSchema() {
	return z.coerce
		.number()
		.int({ message: "forms:errors.mustBeWholeNumber" })
		.nonnegative();
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

export function textAreaOptional(args: TextAreaArgs) {
	return registerTextArea(
		safeNullableStringSchema({ max: args.maxLength }),
		args,
		false,
	);
}

export function textArea(args: TextAreaArgs) {
	return registerTextArea(
		safeStringSchema({ max: args.maxLength }),
		args,
		true,
	);
}

function registerTextArea<T extends z.ZodType<string | null>>(
	schema: T,
	args: TextAreaArgs,
	required: boolean,
): T {
	return (schema as z.ZodType<string | null>).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		required,
		type: "text-area",
		initialValue: "",
	}) as T;
}

export function toggle(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "switch" }>, "type" | "initialValue">
	>,
) {
	return z
		.boolean()
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
	> & {
		/** Value selected when the form has no default value for the field. Defaults to the first item. */
		initialValue?: V;
	},
) {
	return itemsSchema(args.items).register(formRegistry, {
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
	>,
) {
	return z.string().register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "select-dynamic",
		initialValue: null,
		clearable: false,
	}) as unknown as z.ZodType<string> & FieldWithOptions<SelectOption[]>;
}

export function selectDynamicOptional(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "select-dynamic" }>,
			"type" | "initialValue" | "clearable"
		>
	>,
) {
	return z
		.preprocess(falsyToNull, z.string().nullable())
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "select-dynamic",
			initialValue: null,
			clearable: true,
		}) as unknown as z.ZodType<string | null> &
		FieldWithOptions<SelectOption[]>;
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
	let schema = z
		.tuple([
			clearableItemsSchema(args.fields[0].items),
			clearableItemsSchema(args.fields[1].items),
		])
		.optional();

	if (args.validate) {
		schema = schema.refine(
			(val) => {
				if (!val) return true;
				const [first, second] = val;
				return args.validate!.func([first, second]);
			},
			{ message: `forms:${args.validate!.message}` },
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
		initialValue: [null, null],
		clearable: true,
	});
}

export function radioGroup<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabelsWithImage<
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

export function radioGroupDynamic(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "radio-group-dynamic" }>,
			"type" | "initialValue"
		>
	>,
) {
	return z.string().register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "radio-group-dynamic",
		initialValue: null,
	}) as unknown as z.ZodType<string> &
		FieldWithOptions<FormFieldItemsWithImage<string>>;
}

type DateTimeArgs = WithTypedTranslationKeys<
	Omit<FormFieldDatetime<"datetime">, "type" | "initialValue" | "required">
> & {
	minMessage?: FormsTranslationKey;
	maxMessage?: FormsTranslationKey;
};

function boundedDate(args: DateTimeArgs, schema: z.ZodDate) {
	const resolveMin = args.min ?? (() => new Date(Date.UTC(2015, 4, 28)));
	const resolveMax = args.max ?? (() => new Date(Date.UTC(2030, 4, 28)));

	return schema
		.refine((d) => d >= resolveMin(), {
			message: `forms:${args.minMessage ?? "errors.dateTooEarly"}`,
		})
		.refine((d) => d <= resolveMax(), {
			message: `forms:${args.maxMessage ?? "errors.dateTooLate"}`,
		});
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

export function datetime(args: DateTimeArgs) {
	return z
		.preprocess(
			date,
			boundedDate(args, z.date({ message: "forms:errors.required" })),
		)
		.register(
			formRegistry,
			datetimeMetadata(args, { type: "datetime", required: true }),
		);
}

export function datetimeOptional(args: DateTimeArgs) {
	return z
		.preprocess(date, boundedDate(args, z.date()).nullish())
		.register(
			formRegistry,
			datetimeMetadata(args, { type: "datetime", required: false }),
		);
}

export function dayMonthYear(args: DateTimeArgs) {
	return z
		.preprocess(
			date,
			boundedDate(args, z.date({ message: "forms:errors.required" })),
		)
		.transform((d) => ({
			day: d.getDate(),
			month: d.getMonth(),
			year: d.getFullYear(),
		}))
		.register(
			formRegistry,
			datetimeMetadata(args, { type: "date", required: true }),
		);
}

export function checkboxGroup<V extends string>(
	args: WithTypedTranslationKeys<
		WithTypedItemLabelsWithImage<
			Omit<FormFieldInputGroup<"checkbox-group", V>, "type" | "initialValue">,
			V
		>
	>,
) {
	return z
		.array(itemsSchema(args.items))
		.min(args.minLength ?? 0)
		.refine((val) => val.length === R.unique(val).length)
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
	let schema = z
		.array(
			z.object({
				id: weaponSplId,
				isFavorite: z.boolean(),
			}),
		)
		.min(args.minCount ?? 0)
		.max(args.maxCount);

	if (!args.allowDuplicates) {
		schema = schema.refine(
			(val) => val.length === R.uniqueBy(val, (item) => item.id).length,
		);
	}

	if (args.disableAltSkinDuplicates) {
		schema = schema.refine(
			(val) =>
				val.length ===
				R.uniqueBy(val, (item) => canonicalWeaponSplId(item.id)).length,
		);
	}

	return schema.register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "weapon-pool",
		initialValue: [],
	});
}

/**
 * Field that renders no control at all. Use it for values the form needs to
 * submit but the user never edits, e.g. a discriminator seeded from the loader.
 *
 * Pass `initialValue` to hardcode the starting value. Omitting it makes the
 * field require a matching entry in the form's `defaultValues`.
 */
export function hidden<T extends z.ZodType>(
	schema: T,
	initialValue: z.input<T>,
): T;
export function hidden<T extends z.ZodType>(schema: T): RequiresDefault<T>;
export function hidden<T extends z.ZodType>(
	schema: T,
	initialValue?: z.input<T>,
) {
	// @ts-expect-error Complex generic type with registry
	return schema.register(formRegistry, {
		type: "hidden",
		initialValue,
	}) as never;
}

export function stringConstant<T extends string>(value: T) {
	return hidden(z.literal(value), value);
}

export function idConstant<T extends number>(value: T): z.ZodLiteral<T>;
export function idConstant(): RequiresDefault<z.ZodNumber>;
export function idConstant<T extends number>(value?: T) {
	return (
		value !== undefined ? hidden(z.literal(value), value) : hidden(id.clone())
	) as never;
}

export function idConstantOptional<T extends number>(value?: T) {
	return value
		? hidden(z.literal(value).optional(), value)
		: hidden(id.optional(), undefined);
}

export function array<S extends z.ZodType>(
	args: WithTypedTranslationKeys<
		Omit<FormFieldArray<"array", S>, "type" | "initialValue">
	>,
) {
	const schema = z
		.array(args.field)
		.min(args.min ?? 0)
		.max(args.max);
	// @ts-expect-error Complex generic type with registry
	return schema.register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "array",
		initialValue: [],
	});
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
	return z
		.object({
			start: timeString,
			end: timeString,
		})
		.nullable()
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			startLabel: prefixKey(args.startLabel),
			endLabel: prefixKey(args.endLabel),
			type: "time-range",
			initialValue: null,
		});
}

export function fieldset<S extends z.ZodRawShape>(
	args: WithTypedTranslationKeys<
		Omit<FormFieldFieldset<"fieldset", S>, "type" | "initialValue">
	>,
) {
	// @ts-expect-error Complex generic type with registry
	return args.fields.register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "fieldset",
		initialValue: {},
	});
}

type UserSearchArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "user-search" }>,
		"type" | "initialValue" | "required"
	>
>;

export function userSearch(args: UserSearchArgs) {
	return id.clone().register(formRegistry, userSearchMetadata(args, true));
}

export function userSearchOptional(args: UserSearchArgs) {
	return id.optional().register(formRegistry, userSearchMetadata(args, false));
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
	return z.preprocess(falsyToNull, id.nullable()).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "tournament-search",
		initialValue: null,
		required: false,
	}) as unknown as z.ZodType<number | null> &
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
	return z.preprocess(falsyToNull, id.nullable()).register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "team-search",
		initialValue: null,
		required: false,
	}) as unknown as z.ZodType<number | null> &
		FieldWithOptions<TeamSearchFieldOptions>;
}

export function badges(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "badges" }>, "type" | "initialValue">
	>,
) {
	return z
		.array(id)
		.max(args.maxCount ?? 50)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "badges",
			initialValue: [],
		}) as z.ZodArray<typeof id> & FieldWithOptions<BadgeOption[]>;
}

export function trophies(
	args: WithTypedTranslationKeys<
		Omit<Extract<FormField, { type: "trophies" }>, "type" | "initialValue">
	>,
) {
	return z
		.array(id)
		.max(args.maxCount ?? 100)
		.register(formRegistry, {
			...args,
			label: prefixKey(args.label),
			bottomText: prefixKey(args.bottomText),
			type: "trophies",
			initialValue: [],
		}) as z.ZodArray<typeof id> & FieldWithOptions<TrophyOption[]>;
}

export function stageSelect(
	args: WithTypedTranslationKeys<
		Omit<
			Extract<FormField, { type: "stage-select" }>,
			"type" | "initialValue" | "required"
		>
	>,
) {
	return stageId.register(formRegistry, {
		...args,
		label: prefixKey(args.label),
		bottomText: prefixKey(args.bottomText),
		type: "stage-select",
		initialValue: 1,
		required: true,
	});
}

type WeaponSelectArgs = WithTypedTranslationKeys<
	Omit<
		Extract<FormField, { type: "weapon-select" }>,
		"type" | "initialValue" | "required"
	>
>;

export function weaponSelect(args: WeaponSelectArgs) {
	return weaponSplId.register(formRegistry, weaponSelectMetadata(args, true));
}

export function weaponSelectOptional(args: WeaponSelectArgs) {
	return weaponSplId
		.optional()
		.register(formRegistry, weaponSelectMetadata(args, false));
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
