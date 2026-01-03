import * as React from "react";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import type { FormFieldItemsWithImage, FormFieldProps } from "../types";
import { FormFieldWrapper } from "./FormFieldWrapper";

type RadioGroupFormFieldProps<V extends string> = Omit<
	FormFieldProps<"radio-group">,
	"items"
> & {
	items: FormFieldItemsWithImage<V>;
	value: V;
	onChange: (value: V) => void;
};

export function RadioGroupFormField<V extends string>({
	name,
	label,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	minLength,
}: RadioGroupFormFieldProps<V>) {
	const id = React.useId();

	const itemsWithLabels = useItemsWithResolvedLabels(items);

	const required = typeof minLength !== "number" || minLength > 0;

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			required={required}
			error={error}
			bottomText={bottomText}
		>
			<div
				role="radiogroup"
				aria-orientation="vertical"
				aria-labelledby={id}
				className="stack sm items-start"
			>
				{itemsWithLabels.map((item) => (
					<div key={item.value} className="stack horizontal sm items-center">
						<input
							type="radio"
							id={`${id}-${item.value}`}
							name={id}
							value={item.value}
							checked={value === item.value}
							onChange={() => onChange(item.value)}
							onBlur={onBlur}
						/>
						<label
							htmlFor={`${id}-${item.value}`}
							className="stack horizontal sm items-center mb-0 whitespace-nowrap"
						>
							{item.imgSrc ? (
								<Image path={item.imgSrc} width={24} height={24} alt="" />
							) : null}
							{item.resolvedLabel}
						</label>
					</div>
				))}
			</div>
		</FormFieldWrapper>
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
	name,
	label,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	minLength,
}: CheckboxGroupFormFieldProps<V>) {
	const id = React.useId();

	const itemsWithLabels = useItemsWithResolvedLabels(items);

	const required = typeof minLength !== "number" || minLength > 0;

	const handleChange = (itemValue: V, checked: boolean) => {
		if (checked) {
			onChange([...value, itemValue]);
		} else {
			onChange(value.filter((v) => v !== itemValue));
		}
	};

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			required={required}
			error={error}
			bottomText={bottomText}
		>
			<div className="stack sm items-start">
				{itemsWithLabels.map((item) => (
					<div key={item.value} className="stack horizontal sm items-center">
						<input
							type="checkbox"
							id={`${id}-${item.value}`}
							value={item.value}
							checked={value.includes(item.value)}
							onChange={(e) => handleChange(item.value, e.target.checked)}
							onClick={() => onBlur?.()}
						/>
						<label
							htmlFor={`${id}-${item.value}`}
							className="stack horizontal sm items-center mb-0 whitespace-nowrap"
						>
							{item.imgSrc ? (
								<Image path={item.imgSrc} width={24} height={24} alt="" />
							) : null}
							{item.resolvedLabel}
						</label>
					</div>
				))}
			</div>
		</FormFieldWrapper>
	);
}

function useItemsWithResolvedLabels<V extends string>(
	items: FormFieldItemsWithImage<V>,
) {
	const { t, i18n } = useTranslation();

	return items.map((item) => {
		const itemLabel = item.label;
		const resolvedLabel =
			typeof itemLabel === "function"
				? itemLabel(i18n.language)
				: typeof itemLabel === "string" && itemLabel.includes(":")
					? t(itemLabel as never)
					: String(itemLabel);

		return {
			...item,
			resolvedLabel,
		};
	});
}
