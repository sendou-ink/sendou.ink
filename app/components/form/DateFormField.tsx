import { parseDate } from "@internationalized/date";
import {
	Controller,
	type FieldPath,
	type FieldValues,
	get,
	useFormContext,
} from "react-hook-form";
import { dateToYYYYMMDD } from "../../utils/dates";
import type { DayMonthYear } from "../../utils/zod";
import { DatePicker } from "../elements/DatePicker";
import type { FormFieldSize } from "./form-utils";

export function DateFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
	required,
	size,
}: {
	label: string;
	name: FieldPath<T>;
	bottomText?: string;
	required?: boolean;
	size?: FormFieldSize;
}) {
	const methods = useFormContext();

	const error = get(methods.formState.errors, name);

	return (
		<Controller
			name={name}
			control={methods.control}
			render={({ field }) => {
				const value = () => {
					const originalValue = field.value as DayMonthYear | null;

					if (!originalValue) return null;

					const isoString = dateToYYYYMMDD(
						new Date(
							Date.UTC(
								originalValue.year,
								originalValue.month - 1,
								originalValue.day,
								12,
							),
						),
					);

					return parseDate(isoString);
				};

				return (
					<DatePicker
						label={label}
						granularity="day"
						isRequired={required}
						errorText={error?.message as string | undefined}
						value={value()}
						size={size}
						onChange={(value) => {
							if (value) {
								field.onChange({
									day: value.day,
									month: value.month,
									year: value.year,
								});
							}

							if (!value) {
								field.onChange(null);
							}
						}}
						bottomText={bottomText}
					/>
				);
			}}
		/>
	);
}
