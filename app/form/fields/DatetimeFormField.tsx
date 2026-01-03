import type { CalendarDateTime } from "@internationalized/date";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import { dateToDateValue } from "~/utils/dates";
import type { FormFieldProps } from "../types";
import { errorMessageId } from "../utils";
import { FormFieldWrapper, useTranslatedTexts } from "./FormFieldWrapper";

type DatetimeFormFieldProps = FormFieldProps<"datetime"> & {
	value: Date | undefined;
	onChange: (value: Date | undefined) => void;
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
}: DatetimeFormFieldProps) {
	const { translatedLabel, translatedError, translatedBottomText } =
		useTranslatedTexts({ label, error, bottomText });

	const handleChange = (val: CalendarDateTime | null) => {
		if (val) {
			onChange(
				new Date(val.year, val.month - 1, val.day, val.hour, val.minute),
			);
		} else {
			onChange(undefined);
		}
	};

	return (
		<FormFieldWrapper id={name} name={name}>
			<SendouDatePicker
				label={translatedLabel ?? ""}
				granularity="minute"
				errorText={translatedError}
				errorId={errorMessageId(name)}
				bottomText={translatedBottomText}
				isRequired={required}
				value={value ? dateToDateValue(value) : null}
				onChange={handleChange}
				onBlur={() => onBlur?.()}
			/>
		</FormFieldWrapper>
	);
}
