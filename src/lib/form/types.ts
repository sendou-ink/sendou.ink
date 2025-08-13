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

interface FormFieldSwitch<T extends string> extends FormFieldBase<T> {
	default: boolean; // xxx: better name or explanation for this
}

export type FormField =
	| FormFieldText<'text-field'>
	| FormFieldText<'text-area'>
	| FormFieldSwitch<'switch'>;

export type FormFieldProps<T extends FormField['type']> = Extract<FormField, { type: T }> & {
	name: string;
	error?: string;
};
