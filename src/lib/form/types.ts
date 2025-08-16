interface FormFieldBase<T extends string> {
	type: T;
	label: string;
	bottomText?: string;
}

interface FormFieldText<T extends string> extends FormFieldBase<T> {
	maxLength: number;
	toLowerCase?: boolean;
	leftAddon?: string;
	regExp?: {
		pattern: RegExp;
		message: string;
	};
}

interface FormFieldSelect<T extends string> extends FormFieldBase<T> {
	items: Array<{ label: string | number | ((lang: string) => string); value: string }>;
}

type FormFieldDualSelectField<T extends string> = Omit<FormFieldSelect<T>, 'bottomText' | 'type'>;
interface FormFieldDualSelect<T extends string> extends Omit<FormFieldBase<T>, 'label'> {
	fields: [FormFieldDualSelectField<T>, FormFieldDualSelectField<T>];
	validate?: {
		func: (value: [string | null, string | null]) => boolean;
		message: string;
	};
}

interface FormFieldWeaponPool<T extends string> extends FormFieldBase<T> {
	maxCount: number;
}

export type FormField =
	| FormFieldBase<'custom'>
	| FormFieldText<'text-field'>
	| FormFieldText<'text-area'>
	| FormFieldBase<'switch'>
	| FormFieldSelect<'select'>
	| FormFieldDualSelect<'dual-select'>
	| FormFieldWeaponPool<'weapon-pool'>;

export type FormFieldProps<T extends FormField['type']> = Omit<
	Extract<FormField, { type: T }>,
	'type'
> & {
	name: string;
	error?: string;
	onblur: () => void;
};
