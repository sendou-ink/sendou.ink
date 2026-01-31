import * as React from "react";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type TextareaFormFieldProps = FormFieldProps<"text-area"> & {
	value: string;
	onChange: (value: string) => void;
};

export function TextareaFormField({
	name,
	label,
	bottomText,
	maxLength,
	error,
	onBlur,
	value,
	onChange,
}: TextareaFormFieldProps) {
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={error}
			bottomText={bottomText}
			valueLimits={
				maxLength ? { current: value?.length ?? 0, max: maxLength } : undefined
			}
		>
			<textarea
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={() => onBlur?.()}
				{...ariaAttributes({
					id,
					bottomText,
					error,
				})}
			/>
		</FormFieldWrapper>
	);
}
