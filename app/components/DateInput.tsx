import * as React from "react";
import { useIsMounted } from "~/hooks/useIsMounted";
import { dateToYearMonthDayHourMinuteString, isValidDate } from "~/utils/dates";

export interface DateInputProps
	extends Omit<
		React.InputHTMLAttributes<HTMLInputElement>,
		"defaultValue" | "min" | "max" | "onChange" | "value"
	> {
	defaultValue?: Date;
	min?: Date;
	max?: Date;
	onChange?: (newDate: Date | null) => void;
}

export function DateInput({
	name,
	defaultValue,
	min,
	max,
	onChange,
	...inputProps
}: DateInputProps) {
	// Keeping track of the value as a string is a nice fallback for browsers that
	// don't show a date picker but actually expect the user to type in the date
	// as a text. This was Safari Desktop until recently, but nowadays all current
	// versions of the main browsers set the input to either a valid date string
	// or "". (The browser will handle transitional invalid states internally).
	const [[parsedDate, valueString], setDate] = React.useState<
		[Date | null, string]
	>(() => {
		if (defaultValue) {
			if (isValidDate(defaultValue)) {
				return [defaultValue, dateToYearMonthDayHourMinuteString(defaultValue)];
			}
			console.warn("DateInput got invalid date as defaultValue");
		}
		return [null, ""];
	});
	const isMounted = useIsMounted();

	return (
		<>
			{parsedDate && isMounted && (
				<input name={name} type="hidden" value={parsedDate.getTime() ?? ""} />
			)}
			<input
				{...inputProps}
				type="datetime-local"
				disabled={!isMounted || inputProps.disabled}
				// This is important, because SSR will likely have a date in the wrong
				// timezone. We can only fill in a value once hydration is over.
				value={isMounted ? valueString : ""}
				min={min ? dateToYearMonthDayHourMinuteString(min) : undefined}
				max={max ? dateToYearMonthDayHourMinuteString(max) : undefined}
				onChange={(e) => {
					const newValueString = e.target.value;
					const parsedValue = new Date(newValueString);
					const newDate = isValidDate(parsedValue) ? parsedValue : null;

					setDate([newDate, newValueString]);
					onChange?.(newDate);
				}}
				// Firefox fix for hydration error "prop `disabled` did not match" */
				// https://github.com/facebook/react/issues/21459
				autoComplete="off"
			/>
		</>
	);
}
