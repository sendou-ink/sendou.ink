import * as React from "react";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type InputFormFieldProps = FormFieldProps<"text-field"> & {
	value: string;
	onChange: (value: string) => void;
};

export function InputFormField({
	name,
	label,
	bottomText,
	leftAddon,
	maxLength,
	error,
	onBlur,
	required,
	inputType = "text",
	value,
	onChange,
}: InputFormFieldProps) {
	const id = React.useId();

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
					type={inputType}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={() => onBlur?.()}
					maxLength={maxLength}
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
