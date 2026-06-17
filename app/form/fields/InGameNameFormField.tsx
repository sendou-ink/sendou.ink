import * as React from "react";
import { IngameNameInput } from "~/components/IngameNameInput";
import { inGameNameLength } from "~/features/user-page/in-game-name";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type InGameNameFormFieldProps = FormFieldProps<"in-game-name"> & {
	disabled?: boolean;
	value: string;
	onChange: (value: string) => void;
};

export function InGameNameFormField({
	name,
	label,
	bottomText,
	maxLength,
	error,
	onBlur,
	required,
	disabled,
	value,
	onChange,
}: InGameNameFormFieldProps) {
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			required={required}
			error={error}
			bottomText={bottomText}
			valueLimits={{ current: inGameNameLength(value), max: maxLength }}
		>
			<IngameNameInput
				id={id}
				name={name}
				value={value}
				onChange={onChange}
				onBlur={() => onBlur?.()}
				disabled={disabled}
				{...ariaAttributes({ id, bottomText, error, required })}
			/>
		</FormFieldWrapper>
	);
}
