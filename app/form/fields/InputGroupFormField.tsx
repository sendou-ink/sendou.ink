import * as React from "react";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import { Label } from "~/components/Label";
import type { FormFieldItemsWithImage, FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";

type RadioGroupFormFieldProps<V extends string> = Omit<
	FormFieldProps<"radio-group">,
	"items"
> & {
	items: FormFieldItemsWithImage<V>;
	value: V;
	onChange: (value: V) => void;
};

export function RadioGroupFormField<V extends string>({
	label,
	name,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	minLength,
}: RadioGroupFormFieldProps<V>) {
	const { i18n } = useTranslation();
	const { translatedLabel } = useTranslatedTexts({ label });
	const id = React.useId();

	const itemsWithLabels = items.map((item) => ({
		...item,
		resolvedLabel:
			typeof item.label === "function"
				? item.label(i18n.language)
				: String(item.label),
	}));

	const required = typeof minLength !== "number" || minLength > 0;

	return (
		<div
			className="stack xs"
			role="radiogroup"
			aria-orientation="vertical"
			aria-labelledby={id}
		>
			{translatedLabel ? (
				<Label htmlFor={id} required={required}>
					{translatedLabel}
				</Label>
			) : null}
			{itemsWithLabels.map((item) => (
				<div key={item.value} className="stack horizontal sm-plus items-center">
					<input
						type="radio"
						id={`${id}-${item.value}`}
						name={name}
						value={item.value}
						checked={value === item.value}
						onChange={() => onChange(item.value)}
						onBlur={onBlur}
					/>
					<label
						htmlFor={`${id}-${item.value}`}
						className="stack horizontal sm items-center"
					>
						{item.imgSrc ? (
							<Image path={item.imgSrc} width={24} height={24} alt="" />
						) : null}
						{item.resolvedLabel}
					</label>
				</div>
			))}
			<FormFieldMessages error={error} bottomText={bottomText} />
		</div>
	);
}

type CheckboxGroupFormFieldProps<V extends string> = Omit<
	FormFieldProps<"checkbox-group">,
	"items"
> & {
	items: FormFieldItemsWithImage<V>;
	value: V[];
	onChange: (value: V[]) => void;
};

export function CheckboxGroupFormField<V extends string>({
	label,
	name,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	minLength,
}: CheckboxGroupFormFieldProps<V>) {
	const { i18n } = useTranslation();
	const { translatedLabel } = useTranslatedTexts({ label });
	const id = React.useId();

	const itemsWithLabels = items.map((item) => ({
		...item,
		resolvedLabel:
			typeof item.label === "function"
				? item.label(i18n.language)
				: String(item.label),
	}));

	const required = typeof minLength !== "number" || minLength > 0;

	const handleChange = (itemValue: V, checked: boolean) => {
		if (checked) {
			onChange([...value, itemValue]);
		} else {
			onChange(value.filter((v) => v !== itemValue));
		}
	};

	return (
		<fieldset className="stack xs" aria-labelledby={id}>
			{translatedLabel ? (
				<Label htmlFor={id} required={required}>
					{translatedLabel}
				</Label>
			) : null}
			{itemsWithLabels.map((item) => (
				<div key={item.value} className="stack horizontal sm-plus items-center">
					<input
						type="checkbox"
						id={`${id}-${item.value}`}
						name={`${name}[]`}
						value={item.value}
						checked={value.includes(item.value)}
						onChange={(e) => handleChange(item.value, e.target.checked)}
						onClick={() => onBlur?.()}
					/>
					<label
						htmlFor={`${id}-${item.value}`}
						className="stack horizontal sm items-center"
					>
						{item.imgSrc ? (
							<Image path={item.imgSrc} width={24} height={24} alt="" />
						) : null}
						{item.resolvedLabel}
					</label>
				</div>
			))}
			<FormFieldMessages error={error} bottomText={bottomText} />
		</fieldset>
	);
}
