import * as React from "react";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type DatetimeFormFieldProps = Omit<
	FormFieldProps<"datetime">,
	"min" | "max" | "onBlur"
> & {
	value: Date | undefined;
	onChange: (value: Date | undefined) => void;
	onBlur?: () => void;
	granularity?: "day" | "minute";
	disabled?: boolean;
};

export function DatetimeFormField({
	name,
	label,
	bottomText,
	error,
	required,
	onBlur,
	value,
	onChange,
	granularity = "minute",
	disabled,
}: DatetimeFormFieldProps) {
	const id = React.useId();
	const [hasBadInput, setHasBadInput] = React.useState(false);
	const displayedError =
		error && hasBadInput ? "forms:errors.invalidDate" : error;

	const handleChange = (
		val: Date | null,
		{ isBadInput }: { isBadInput: boolean },
	) => {
		setHasBadInput(isBadInput);
		onChange(val ?? undefined);
	};

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			required={required}
			error={displayedError}
			bottomText={bottomText}
		>
			<SendouDatePicker
				id={id}
				granularity={granularity}
				disabled={disabled}
				value={value ?? null}
				onChange={handleChange}
				onBlur={() => onBlur?.()}
				{...ariaAttributes({
					name,
					bottomText,
					error: displayedError,
					required,
				})}
			/>
		</FormFieldWrapper>
	);
}
