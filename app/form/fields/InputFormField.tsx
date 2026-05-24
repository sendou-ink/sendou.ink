import * as React from "react";
import { useTranslation } from "react-i18next";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type InputFormFieldProps = FormFieldProps<"text-field"> & {
	disabled?: boolean;
	value: string;
	onChange: (value: string) => void;
};

export function InputFormField({
	name,
	label,
	bottomText,
	leftAddon,
	placeholder,
	maxLength,
	error,
	onBlur,
	required,
	inputType = "text",
	disabled,
	value,
	onChange,
}: InputFormFieldProps) {
	const id = React.useId();
	const { t } = useTranslation(["forms"]);

	const translatedPlaceholder = placeholder?.includes(":")
		? t(placeholder as never)
		: placeholder;

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			required={required}
			error={error}
			bottomText={bottomText}
		>
			<div className={leftAddon ? "input-container" : undefined}>
				{leftAddon ? <span className="input-addon">{leftAddon}</span> : null}
				<input
					id={id}
					className={leftAddon ? "in-container" : undefined}
					type={inputType}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={() => onBlur?.()}
					maxLength={maxLength}
					disabled={disabled}
					placeholder={translatedPlaceholder}
					{...ariaAttributes({
						id,
						bottomText,
						error,
						required,
					})}
				/>
			</div>
		</FormFieldWrapper>
	);
}
