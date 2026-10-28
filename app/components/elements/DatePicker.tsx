import { format, parse } from "date-fns";
import { isValidDate } from "~/utils/dates";

const DATE_INPUT_FORMAT = "yyyy-MM-dd";
const DATETIME_INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";

interface SendouDatePickerProps
	extends Pick<
		React.InputHTMLAttributes<HTMLInputElement>,
		| "id"
		| "disabled"
		| "aria-label"
		| "aria-invalid"
		| "aria-describedby"
		| "aria-errormessage"
		| "aria-required"
	> {
	value: Date | null;
	/** `isBadInput` = the input holds a partial or impossible date, e.g. 31.9. */
	onChange: (value: Date | null, meta: { isBadInput: boolean }) => void;
	granularity?: "day" | "minute";
	onBlur?: () => void;
}

/**
 * Native `date` / `datetime-local` input, so the browser owns locale, clock format and the picker UI.
 * Renders only the input: wrap it in `DatetimeFormField` for a label and messages, or pair it with a `<Label>`.
 */
export function SendouDatePicker({
	value,
	onChange,
	granularity = "minute",
	onBlur,
	...inputProps
}: SendouDatePickerProps) {
	const inputValue = value
		? format(
				value,
				granularity === "day" ? DATE_INPUT_FORMAT : DATETIME_INPUT_FORMAT,
			)
		: "";

	return (
		<input
			{...inputProps}
			className="w-full"
			type={granularity === "day" ? "date" : "datetime-local"}
			value={inputValue}
			onChange={(event) =>
				onChange(parseInputValue(event.target.value, granularity), {
					isBadInput: event.target.validity.badInput,
				})
			}
			onBlur={() => onBlur?.()}
		/>
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
