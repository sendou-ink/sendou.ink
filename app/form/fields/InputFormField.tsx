import * as React from "react";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type InputFormFieldProps = Omit<FormFieldProps<"text-field">, "name"> & {
	value: string;
	onChange: (value: string) => void;
};

export function InputFormField({
	label,
	bottomText,
	leftAddon,
	maxLength,
	error,
	onBlur,
	required,
	value,
	onChange,
}: InputFormFieldProps) {
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			label={label}
			required={required}
			error={error}
			bottomText={bottomText}
		>
			<div className={leftAddon ? "input-with-addon" : undefined}>
				{leftAddon ? <span className="input-addon">{leftAddon}</span> : null}
				<input
					id={id}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
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
