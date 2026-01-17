import type { z } from "zod";
import type { ModeShort } from "~/modules/in-game-lists/types";
import type forms from "../../locales/en/forms.json";

export type FormsTranslationKey = keyof typeof forms;

interface FormFieldBase<T extends string> {
	type: T;
	label?: string;
	bottomText?: string;
	initialValue: unknown;
}

type FormFieldConstant<T extends string> = Omit<
	FormFieldBase<T>,
	"label" | "bottomText"
> & {
	value: string | number | null;
};

interface FormFieldText<T extends string> extends FormFieldBase<T> {
	minLength?: number;
	maxLength: number;
	toLowerCase?: boolean;
	leftAddon?: string;
	required: boolean;
	inputType?: "text" | "number";
	regExp?: {
		pattern: RegExp;
		message: string;
	};
	validate?:
		| "url"
		| {
				func: (value: string) => boolean;
				message: string;
		  };
}

interface FormFieldTextarea<T extends string> extends FormFieldBase<T> {
	maxLength: number;
}

interface FormFieldItem<V extends string> {
	label: string | number | ((lang: string) => string);
	value: V;
}

interface FormFieldItemWithImage<V extends string> extends FormFieldItem<V> {
	imgSrc?: string;
}

export type FormFieldItems<V extends string> = Array<FormFieldItem<V>>;

export type FormFieldItemsWithImage<V extends string> = Array<
	FormFieldItemWithImage<V>
>;

export interface FormFieldSelect<T extends string, V extends string>
	extends FormFieldBase<T> {
	items: FormFieldItems<V>;
	clearable: boolean;
}

type FormFieldDualSelectField<T extends string, V extends string> = Omit<
	FormFieldSelect<T, V>,
	"bottomText" | "type" | "clearable"
>;

export interface FormFieldDualSelect<T extends string, V extends string>
	extends Omit<FormFieldBase<T>, "label"> {
	fields: [
		Omit<FormFieldDualSelectField<T, V>, "initialValue">,
		Omit<FormFieldDualSelectField<T, V>, "initialValue">,
	];
	validate?: {
		func: (value: [V | null, V | null]) => boolean;
		message: string;
	};
	clearable: boolean;
}

export interface FormFieldInputGroup<T extends string, V extends string>
	extends FormFieldBase<T> {
	items: FormFieldItemsWithImage<V>;
	minLength?: number;
}

export interface FormFieldDatetime<T extends string> extends FormFieldBase<T> {
	min?: Date;
	max?: Date;
	required: boolean;
}

interface FormFieldWeaponPool<T extends string> extends FormFieldBase<T> {
	minCount?: number;
	maxCount: number;
	/** Does the weapon pool have an ordering? If true, the order is fixed and cannot be changed by the user (order ASC by weapon id) */
	disableSorting?: boolean;
	/** Can user favorite weapons in the pool? If disabled, all weapons have isFavorite: false */
	disableFavorites?: boolean;
}

interface FormFieldMapPool<T extends string> extends FormFieldBase<T> {
	modes?: ModeShort[];
	minCount?: number;
	maxCount?: number;
	disableBannedMaps?: boolean;
}

interface FormFieldImage<T extends string>
	extends Omit<FormFieldBase<T>, "bottomText"> {
	dimensions: "logo" | "thick-banner";
}

export interface FormFieldArray<T extends string, S extends z.ZodType>
	extends FormFieldBase<T> {
	min: number;
	max: number;
	field: S;
}

interface FormFieldTimeRange<T extends string> extends FormFieldBase<T> {
	startLabel?: string;
	endLabel?: string;
}

export interface FormFieldFieldset<T extends string, S extends z.ZodRawShape>
	extends FormFieldBase<T> {
	fields: z.ZodObject<S>;
}

interface FormFieldUserSearch<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

interface FormFieldBadges<T extends string> extends FormFieldBase<T> {
	maxCount?: number;
}

interface FormFieldSelectDynamic<T extends string> extends FormFieldBase<T> {
	clearable: boolean;
}

interface FormFieldStageSelect<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

interface FormFieldWeaponSelect<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

export type FormField<V extends string = string> =
	| FormFieldBase<"custom">
	| FormFieldText<"text-field">
	| FormFieldTextarea<"text-area">
	| FormFieldBase<"switch">
	| FormFieldSelect<"select", V>
	| FormFieldSelectDynamic<"select-dynamic">
	| FormFieldDualSelect<"dual-select", V>
	| FormFieldInputGroup<"radio-group", V>
	| FormFieldInputGroup<"checkbox-group", V>
	| FormFieldDatetime<"datetime">
	| FormFieldDatetime<"date">
	| FormFieldWeaponPool<"weapon-pool">
	| FormFieldMapPool<"map-pool">
	| FormFieldBase<"theme">
	| FormFieldImage<"image">
	| FormFieldConstant<"string-constant">
	| FormFieldConstant<"id-constant">
	| FormFieldArray<"array", z.ZodType>
	| FormFieldTimeRange<"time-range">
	| FormFieldFieldset<"fieldset", z.ZodRawShape>
	| FormFieldUserSearch<"user-search">
	| FormFieldBadges<"badges">
	| FormFieldStageSelect<"stage-select">
	| FormFieldWeaponSelect<"weapon-select">;

export type FormFieldProps<T extends FormField["type"]> = Omit<
	Extract<FormField, { type: T }>,
	"type" | "initialValue"
> & {
	name: string;
	error?: string;
	onBlur: (latestValue?: unknown) => void;
};

export interface ArrayItemRenderContext<
	TItem = Record<string, unknown>,
	TForm = Record<string, unknown>,
> {
	index: number;
	itemName: string;
	values: TItem;
	formValues: TForm;
	setItemField: <K extends keyof TItem>(field: K, value: TItem[K]) => void;
	canRemove: boolean;
	remove: () => void;
}

export type BadgeOption = {
	id: number;
	displayName: string;
	code: string;
	hue: number | null;
};

export type SelectOption = {
	value: string;
	label: string;
};

/** Brand type to encode required options directly in Zod schema types */
export type FieldWithOptions<TOptions> = { _requiredOptions: TOptions };

/**
 * Custom render props for FormField children.
 * Generic type parameter allows for type-safe value handling when the type is known.
 */
export type CustomFieldRenderProps<TValue = unknown> = {
	name: string;
	error: string | undefined;
	value: TValue;
	onChange: (value: TValue) => void;
};

/** Non-generic version for internal use to avoid excessive type instantiation */
type FormFieldChildrenProps = {
	name: string;
	error: string | undefined;
	value: unknown;
	onChange: (value: unknown) => void;
};

/** Props for a typed FormField based on field name and schema */
export type TypedFormFieldProps<
	TSchema extends z.ZodRawShape,
	TName extends keyof TSchema & string,
> = {
	name: TName;
	label?: string;
	children?:
		| ((props: FormFieldChildrenProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
} & (TSchema[TName] extends FieldWithOptions<infer TOptions>
	? { options: TOptions }
	: { options?: never });

/** Nested path pattern for array/object traversal */
type NestedPath = `${string}.${string}` | `${string}[${string}`;

/** Props for FormField with flexible (string) name - used for nested paths like `${itemName}.field` */
export type FlexibleFormFieldProps = {
	name: NestedPath;
	label?: string;
	children?:
		| ((props: FormFieldChildrenProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
	options?: unknown;
};

/** Typed FormField component type for a specific schema */
export type TypedFormFieldComponent<TSchema extends z.ZodRawShape> = {
	<TName extends keyof TSchema & string>(
		props: TypedFormFieldProps<TSchema, TName>,
	): React.ReactNode;
	(props: FlexibleFormFieldProps): React.ReactNode;
};
