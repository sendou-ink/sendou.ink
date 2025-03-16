import { parseDate } from "@internationalized/date";
import {
	Controller,
	type FieldPath,
	type FieldValues,
	useFormContext,
} from "react-hook-form";
import { dateToYYYYMMDD } from "../../utils/dates";
import type { DayMonthYear } from "../../utils/zod";
import { SendouDatePicker } from "../elements/DatePicker";
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

	return (
		<Controller
			name={name}
			control={methods.control}
			render={({
				field: { name, value, onChange, onBlur /*, ref*/ }, // TODO: figure out where ref goes (to focus on error) and put it there
				fieldState: { invalid, error },
			}) => {
				const getValue = () => {
					const originalValue = value as DayMonthYear | null;

					if (!originalValue) return null;

					const isoString = dateToYYYYMMDD(
						new Date(
							Date.UTC(
								originalValue.year,
								originalValue.month,
								originalValue.day,
								12,
							),
						),
					);

					return parseDate(isoString);
				};

				return (
					<SendouDatePicker
						label={label}
						granularity="day"
						isRequired={required}
						errorText={error?.message as string | undefined}
						value={getValue()}
						size={size}
						isInvalid={invalid}
						name={name}
						onBlur={onBlur}
						onChange={(value) => {
							if (value) {
								onChange({
									day: value.day,
									month: value.month - 1,
									year: value.year,
								});
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
