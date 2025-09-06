import type { ModeShort } from '$lib/constants/in-game/types';
import type z from 'zod';

interface FormFieldBase<T extends string> {
	type: T;
	label?: string;
	bottomText?: string;
	initialValue: unknown;
}

type FormFieldConstant<T extends string> = Omit<FormFieldBase<T>, 'label' | 'bottomText'>;

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
	validate?:
		| 'url'
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

export type FormFieldItemsWithImage<V extends string> = Array<FormFieldItemWithImage<V>>;

export interface FormFieldSelect<T extends string, V extends string> extends FormFieldBase<T> {
	items: FormFieldItems<V>;
	clearable: boolean;
}

type FormFieldDualSelectField<T extends string, V extends string> = Omit<
	FormFieldSelect<T, V>,
	'bottomText' | 'type' | 'clearable'
>;
export interface FormFieldDualSelect<T extends string, V extends string>
	extends Omit<FormFieldBase<T>, 'label'> {
	fields: [
		Omit<FormFieldDualSelectField<T, V>, 'initialValue'>,
		Omit<FormFieldDualSelectField<T, V>, 'initialValue'>
	];
	validate?: {
		func: (value: [V | null, V | null]) => boolean;
		message: string;
	};
	clearable: boolean;
}

export interface FormFieldInputGroup<T extends string, V extends string> extends FormFieldBase<T> {
	items: FormFieldItemsWithImage<V>;
	minLength?: number;
}

export interface FormFieldDatetime<T extends string> extends FormFieldBase<T> {
	min?: Date;
	max?: Date;
	required: boolean;
}

interface FormFieldWeaponPool<T extends string> extends FormFieldBase<T> {
	maxCount: number;
}

interface FormFieldMapPool<T extends string> extends FormFieldBase<T> {
	modes?: ModeShort[];
	/** Min amount of maps to pick per mode */
	minCount?: number;
	/** Max amount of maps to pick per mode */
	maxCount?: number;
	/** Should the maps that are currently banned from SendouQ be disabled */
	disableBannedMaps?: boolean;
}

interface FormFieldImage<T extends string> extends Omit<FormFieldBase<T>, 'bottomText'> {
	dimensions: 'logo' | 'thick-banner';
}

export interface FormFieldArray<T extends string, S extends z.ZodType> extends FormFieldBase<T> {
	min: number;
	max: number;
	field: S;
}

export type FormField<V extends string = string> =
	| FormFieldBase<'custom'>
	| FormFieldText<'text-field'>
	| FormFieldTextarea<'text-area'>
	| FormFieldBase<'switch'>
	| FormFieldSelect<'select', V>
	| FormFieldSelect<'multi-select', V>
	| FormFieldDualSelect<'dual-select', V>
	| FormFieldInputGroup<'radio-group', V>
	| FormFieldInputGroup<'checkbox-group', V>
	| FormFieldDatetime<'datetime'>
	| FormFieldWeaponPool<'weapon-pool'>
	| FormFieldMapPool<'map-pool'>
	| FormFieldBase<'theme'>
	| FormFieldImage<'image'>
	| FormFieldConstant<'string-constant'>
	| FormFieldConstant<'id-constant'>
	| FormFieldArray<'array', any>; // any here to stop infinite recursion of types, we don't need to know the exact type here

export type FormFieldProps<T extends FormField['type']> = Omit<
	Extract<FormField, { type: T }>,
	'type' | 'initialValue'
> & {
	name: string;
	error?: string;
	onblur: () => void;
};
