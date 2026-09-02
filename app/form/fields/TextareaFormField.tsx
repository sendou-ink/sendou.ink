import * as React from "react";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type TextareaFormFieldProps = FormFieldProps<"text-area"> & {
	disabled?: boolean;
	autoFocus?: boolean;
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
	required,
	disabled,
	autoFocus,
	value,
	onChange,
}: TextareaFormFieldProps) {
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			required={required}
			error={error}
			bottomText={bottomText}
			valueLimits={
				maxLength ? { current: value?.length ?? 0, max: maxLength } : undefined
			}
		>
			<textarea
				id={id}
				ref={autoFocus ? moveCaretToEnd : undefined}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={() => onBlur?.()}
				disabled={disabled}
				// biome-ignore lint/a11y/noAutofocus: opt-in per call site, used for inline edit forms
				autoFocus={autoFocus}
				{...ariaAttributes({
					name,
					bottomText,
					error,
					required,
				})}
			/>
		</FormFieldWrapper>
	);
}

/** Autofocus leaves the caret before existing text. Module level so the ref identity is stable and runs only on mount. */
function moveCaretToEnd(element: HTMLTextAreaElement | null) {
	element?.setSelectionRange(element.value.length, element.value.length);
}
