import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import { wallClockToInstant } from "~/utils/dates";
import { useFormTimeZone } from "../SendouForm";
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
	const timeZone = useFormTimeZone();
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
			labelPopover={
				timeZone && granularity === "minute" ? (
					<TimeZoneSuffix timeZone={timeZone} wallClock={value} />
				) : null
			}
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

function TimeZoneSuffix({
	timeZone,
	wallClock,
}: {
	timeZone: string;
	wallClock: Date | undefined;
}) {
	const { t, i18n } = useTranslation(["forms"]);

	// the abbreviation depends on the date, e.g. CST in winter and CDT in summer
	const instant = wallClockToInstant(wallClock ?? new Date(), timeZone);
	const shortName =
		new Intl.DateTimeFormat(i18n.language, {
			timeZone,
			timeZoneName: "short",
		})
			.formatToParts(instant)
			.find((part) => part.type === "timeZoneName")?.value ?? timeZone;

	return (
		<span className="text-xs text-lighter" title={timeZone}>
			{t("forms:datetime.venueTime", { timeZone: shortName })}
		</span>
	);
}
