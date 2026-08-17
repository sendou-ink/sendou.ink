/**
 * Form field metadata attached to valibot schemas by the builders in
 * `fields.ts`. Trimmed port of the React app's `~/form/types.ts` union: only
 * the field types the migrated features render exist yet; the rest arrive
 * with the features that use them.
 */

interface FormFieldBase<T extends string> {
	type: T;
	label?: string;
	bottomText?: string;
	initialValue: unknown;
}

/** A field that never renders a control. Its value is seeded from the schema's `initialValue` or the form's `defaultValues`. */
type FormFieldHidden<T extends string> = Omit<
	FormFieldBase<T>,
	"label" | "bottomText"
>;

interface FormFieldText<T extends string> extends FormFieldBase<T> {
	minLength?: number;
	maxLength: number;
	toLowerCase?: boolean;
	/**
	 * Normalizes what the user types before it is stored, e.g. reducing a pasted
	 * full URL down to the part the field actually holds.
	 */
	transformValue?: (value: string) => string;
	leftAddon?: string;
	placeholder?: string;
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
	required: boolean;
}

interface FormFieldItem<V extends string> {
	label: string | number | (() => string);
	value: V;
}

interface FormFieldItemWithImage<V extends string> extends FormFieldItem<V> {
	/** Full image url (including the file extension) shown next to the item's label. */
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
	searchable?: boolean;
}

type FormFieldDualSelectField<V extends string> = {
	label?: string;
	items: FormFieldItems<V>;
};

export interface FormFieldDualSelect<T extends string, V extends string>
	extends Omit<FormFieldBase<T>, "label"> {
	fields: [FormFieldDualSelectField<V>, FormFieldDualSelectField<V>];
	validate?: {
		func: (value: [V | null, V | null]) => boolean;
		message: string;
	};
	clearable: boolean;
}

export interface FormFieldDatetime<T extends string> extends FormFieldBase<T> {
	min?: () => Date;
	max?: () => Date;
	required: boolean;
}

interface FormFieldTimeRange<T extends string> extends FormFieldBase<T> {
	startLabel?: string;
	endLabel?: string;
}

interface FormFieldSelectDynamic<T extends string> extends FormFieldBase<T> {
	clearable: boolean;
	searchable?: boolean;
}

interface FormFieldInputGroupDynamic<T extends string>
	extends FormFieldBase<T> {
	minLength?: number;
}

interface FormFieldRequired<T extends string> extends FormFieldBase<T> {
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
	| FormFieldInputGroupDynamic<"radio-group-dynamic">
	| FormFieldDatetime<"datetime">
	| FormFieldDatetime<"date">
	| FormFieldHidden<"hidden">
	| FormFieldTimeRange<"time-range">
	| FormFieldRequired<"user-search">
	| FormFieldRequired<"tournament-search">
	| FormFieldRequired<"stage-select">;

export type SelectOption = {
	value: string;
	label: string;
};

/** Brand type to encode required options directly in schema types */
export type FieldWithOptions<TOptions> = { _requiredOptions: TOptions };

/**
 * Custom render props for FormField children (snippet parameters in Svelte).
 */
export type CustomFieldRenderProps<TValue = unknown> = {
	name: string;
	error: string | undefined;
	value: TValue;
	onChange: (value: TValue) => void;
	/** True when the field's `disabled` prop is set or the whole form is `readOnly`. */
	disabled?: boolean;
};
