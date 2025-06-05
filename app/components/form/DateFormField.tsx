import type { CalendarDateTime } from "@internationalized/date";
import {
	Controller,
	type FieldPath,
	type FieldValues,
	useFormContext,
} from "react-hook-form";
import { dateToDateValue, dayMonthYearToDateValue } from "../../utils/dates";
import type { DayMonthYear } from "../../utils/zod";
import { SendouDatePicker } from "../elements/DatePicker";
import type { FormFieldSize } from "./form-utils";

export function DateFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
	required,
	size,
	granularity = "day",
}: {
	label: string;
	name: FieldPath<T>;
	bottomText?: string;
	required?: boolean;
	size?: FormFieldSize;
	granularity?: "day" | "minute";
}) {
	const methods = useFormContext();

	return (
		<Controller
			name={name}
			control={methods.control}
			render={({
				field: { name, value, onChange, onBlur /*, ref*/ }, // TODO: figure out where ref goes (to focus on error) and put it there
				fieldState: { invalid, error },
			}) => {
				const getValue = () => {
					const originalValue = value as DayMonthYear | Date | null;

					if (!originalValue) return null;

					if (originalValue instanceof Date) {
						return dateToDateValue(originalValue);
					}

					return dayMonthYearToDateValue(originalValue as DayMonthYear);
				};

				return (
					<SendouDatePicker
						label={label}
						granularity={granularity}
						isRequired={required}
						errorText={error?.message as string | undefined}
						value={getValue()}
						size={size}
						isInvalid={invalid}
						name={name}
						onBlur={onBlur}
						onChange={(value) => {
							if (value) {
								if (granularity === "minute") {
									onChange(
										new Date(
											value.year,
											value.month - 1,
											value.day,
											(value as CalendarDateTime).hour,
											(value as CalendarDateTime).minute,
										),
									);
								} else {
									onChange({
										day: value.day,
										month: value.month - 1,
										year: value.year,
									});
								}
							}

							if (!value) {
								onChange(null);
							}
						}}
						bottomText={bottomText}
					/>
				);
			}}
		/>
	);
}
