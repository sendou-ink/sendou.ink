import * as React from "react";
import { useTranslation } from "react-i18next";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type InputFormFieldProps = FormFieldProps<"text-field"> & {
	disabled?: boolean;
	autoFocus?: boolean;
	labelPopover?: React.ReactNode;
	value: string;
	onChange: (value: string) => void;
	/** Overrides the error and help text wiring derived from `name`, e.g. to also point at messages of a parent field. */
	aria?: ReturnType<typeof ariaAttributes>;
};

export function InputFormField({
	name,
	label,
	labelPopover,
	bottomText,
	leftAddon,
	transformValue,
	placeholder,
	maxLength,
	error,
	onBlur,
	required,
	inputType = "text",
	inputMode,
	disabled,
	autoFocus,
	value,
	onChange,
	aria,
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
			labelPopover={labelPopover}
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
					inputMode={inputMode}
					autoCapitalize={inputMode ? "off" : undefined}
					spellCheck={inputMode ? false : undefined}
					value={value}
					onChange={(e) =>
						onChange(
							transformValue ? transformValue(e.target.value) : e.target.value,
						)
					}
					onBlur={() => onBlur?.()}
					maxLength={maxLength}
					disabled={disabled}
					autoComplete="off"
					// biome-ignore lint/a11y/noAutofocus: opt-in per call site, used for inline edit forms
					autoFocus={autoFocus}
					placeholder={translatedPlaceholder}
					{...(aria ??
						ariaAttributes({
							name,
							bottomText,
							error,
							required,
						}))}
				/>
			</div>
		</FormFieldWrapper>
	);
}
