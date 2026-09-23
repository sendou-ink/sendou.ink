import * as React from "react";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import type { FormFieldProps } from "../types";
import { errorMessageId } from "../utils";
import { FormFieldWrapper, useTranslatedTexts } from "./FormFieldWrapper";

type DatetimeFormFieldProps = Omit<
	FormFieldProps<"datetime">,
	"min" | "max"
> & {
	value: Date | undefined;
	onChange: (value: Date | undefined) => void;
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
	const [hasBadInput, setHasBadInput] = React.useState(false);
	const { translatedLabel, translatedError, translatedBottomText } =
		useTranslatedTexts({
			label,
			error: error && hasBadInput ? "forms:errors.invalidDate" : error,
			bottomText,
		});

	const handleChange = (
		val: Date | null,
		{ isBadInput }: { isBadInput: boolean },
	) => {
		setHasBadInput(isBadInput);
		onChange(val ?? undefined);
	};

	return (
		<FormFieldWrapper id={name} name={name}>
			<SendouDatePicker
				label={translatedLabel ?? ""}
				granularity={granularity}
				errorText={translatedError}
				errorId={errorMessageId(name)}
				bottomText={translatedBottomText}
				isRequired={required}
				isDisabled={disabled}
				value={value ?? null}
				onChange={handleChange}
				onBlur={() => onBlur?.()}
			/>
		</FormFieldWrapper>
	);
}
