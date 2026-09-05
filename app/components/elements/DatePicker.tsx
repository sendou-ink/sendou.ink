import { format, parse } from "date-fns";
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
				onChange={(event) =>
					onChange(parseInputValue(event.target.value, granularity))
				}
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

// the input's value is local time without a zone, which `new Date(string)`
// would misread as UTC for date-only values, so it is parsed against the
// format it was written with
function parseInputValue(
	raw: string,
	granularity: "day" | "minute",
): Date | null {
	if (!raw) return null;

	const date = parse(
		raw,
		granularity === "day" ? DATE_INPUT_FORMAT : DATETIME_INPUT_FORMAT,
		new Date(),
	);

	return isValidDate(date) ? date : null;
}
