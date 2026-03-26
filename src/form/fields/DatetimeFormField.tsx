import type { CalendarDate, CalendarDateTime } from "@internationalized/date";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import { dateToCalendarDate, dateToDateValue } from "~/utils/dates";
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
}: DatetimeFormFieldProps) {
	const { translatedLabel, translatedError, translatedBottomText } =
		useTranslatedTexts({ label, error, bottomText });

	const handleChange = (val: CalendarDateTime | CalendarDate | null) => {
		if (val) {
			if (granularity === "day") {
				onChange(new Date(val.year, val.month - 1, val.day));
			} else {
				const dateTimeVal = val as CalendarDateTime;
				onChange(
					new Date(
						dateTimeVal.year,
						dateTimeVal.month - 1,
						dateTimeVal.day,
						dateTimeVal.hour,
						dateTimeVal.minute,
					),
				);
			}
		} else {
			onChange(undefined);
		}
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
				value={
					value
						? granularity === "day"
							? dateToCalendarDate(value)
							: dateToDateValue(value)
						: null
				}
				onChange={handleChange}
				onBlur={() => onBlur?.()}
			/>
		</FormFieldWrapper>
	);
}
