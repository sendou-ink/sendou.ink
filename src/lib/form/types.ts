interface FormFieldBase<T extends string> {
	type: T;
	label: string;
	bottomText?: string;
}

interface FormFieldText<T extends string> extends FormFieldBase<T> {
	minLength?: number;
	maxLength: number;
	toLowerCase?: boolean;
	leftAddon?: string;
	required: boolean;
	regExp?: {
		pattern: RegExp;
		message: string;
	};
	validate?: {
		func: (value: string) => boolean;
		message: string;
	};
}

interface FormFieldTextarea<T extends string> extends FormFieldBase<T> {
	maxLength: number;
}

export interface FormFieldSelect<T extends string, V extends string> extends FormFieldBase<T> {
	items: Array<{ label: string | number | ((lang: string) => string); value: V }>;
}

type FormFieldDualSelectField<T extends string, V extends string> = Omit<
	FormFieldSelect<T, V>,
	'bottomText' | 'type'
>;
export interface FormFieldDualSelect<T extends string, V extends string>
	extends Omit<FormFieldBase<T>, 'label'> {
	fields: [FormFieldDualSelectField<T, V>, FormFieldDualSelectField<T, V>];
	validate?: {
		func: (value: [V | null, V | null]) => boolean;
		message: string;
	};
}

interface FormFieldWeaponPool<T extends string> extends FormFieldBase<T> {
	maxCount: number;
}

export type FormField<V extends string = string> =
	| FormFieldBase<'custom'>
	| FormFieldText<'text-field'>
	| FormFieldTextarea<'text-area'>
	| FormFieldBase<'switch'>
	| FormFieldSelect<'select', V>
	| FormFieldDualSelect<'dual-select', V>
	| FormFieldWeaponPool<'weapon-pool'>
	| FormFieldBase<'theme'>;

export type FormFieldProps<T extends FormField['type']> = Omit<
	Extract<FormField, { type: T }>,
	'type'
> & {
	name: string;
	error?: string;
	onblur: () => void;
};
