import { format } from "date-fns";
import * as React from "react";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { isValidDate } from "~/utils/dates";
import styles from "./DatePicker.module.css";
import { SendouLabel } from "./Label";

const DATE_INPUT_FORMAT = "yyyy-MM-dd";
const DATETIME_INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";

interface SendouDatePickerProps {
	label: string;
	value: Date | null;
	onChange: (value: Date | null) => void;
	granularity?: "day" | "minute";
	bottomText?: string;
	errorText?: string;
	errorId?: string;
	isRequired?: boolean;
	isDisabled?: boolean;
	onBlur?: () => void;
}

/** Native `date` / `datetime-local` input, so the browser owns locale, clock format and the picker UI. */
export function SendouDatePicker({
	label,
	value,
	onChange,
	granularity = "minute",
	bottomText,
	errorText,
	errorId,
	isRequired,
	isDisabled,
	onBlur,
}: SendouDatePickerProps) {
	const id = React.useId();

	const inputValue = value
		? format(
				value,
				granularity === "day" ? DATE_INPUT_FORMAT : DATETIME_INPUT_FORMAT,
			)
		: "";

	return (
		<div className={styles.root}>
			<SendouLabel htmlFor={id} required={isRequired}>
				{label}
			</SendouLabel>
			<input
				id={id}
				type={granularity === "day" ? "date" : "datetime-local"}
				value={inputValue}
				onChange={(event) => onChange(parseInputValue(event.target.value))}
				onBlur={() => onBlur?.()}
				disabled={isDisabled}
				required={isRequired}
				aria-invalid={errorText ? true : undefined}
				aria-describedby={errorText ? errorId : undefined}
			/>
			<SendouBottomTexts
				bottomText={bottomText}
				errorText={errorText}
				errorId={errorId}
			/>
		</div>
	);
}

// the input's value is local time without a zone, which `new Date(string)` would
// misread as UTC for date-only values, so it is assembled part by part instead
function parseInputValue(raw: string): Date | null {
	if (!raw) return null;

	const [datePart, timePart = "00:00"] = raw.split("T");
	const [year, month, day] = datePart.split("-").map(Number);
	const [hours, minutes] = timePart.split(":").map(Number);

	const date = new Date(2000, month - 1, day, hours, minutes);
	date.setFullYear(year);

	return isValidDate(date) ? date : null;
}
