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
	items: Array<{ label: string | number | ((lang: string) => string); value: string | number }>;
}

interface FormFieldWeaponPool<T extends string> extends FormFieldBase<T> {
	maxCount: number;
}

export type FormField =
	| FormFieldText<'text-field'>
	| FormFieldText<'text-area'>
	| FormFieldBase<'switch'>
	| FormFieldSelect<'select'>
	| FormFieldWeaponPool<'weapon-pool'>;

export type FormFieldProps<T extends FormField['type']> = Extract<FormField, { type: T }> & {
	name: string;
	error?: string;
};
