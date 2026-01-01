import { format, parseISO } from "date-fns";
import * as React from "react";
import type { FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type DatetimeFormFieldProps = Omit<FormFieldProps<"datetime">, "name"> & {
	value: Date | undefined;
	onChange: (value: Date | undefined) => void;
};

// xxx: this should probably use react-aria-components
export function DatetimeFormField({
	label,
	bottomText,
	error,
	required,
	onBlur,
	value,
	onChange,
}: DatetimeFormFieldProps) {
	const id = React.useId();

	const inputValue = value ? format(value, "yyyy-MM-dd'T'HH:mm") : "";

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const valueStr = e.target.value;
		if (!valueStr) {
			onChange(undefined);
			return;
		}
		onChange(parseISO(valueStr));
	};

	return (
		<FormFieldWrapper
			id={id}
			label={label}
			required={required}
			error={error}
			bottomText={bottomText}
		>
			<input
				id={id}
				type="datetime-local"
				value={inputValue}
				onChange={handleChange}
				onBlur={onBlur}
				className="plain"
				{...ariaAttributes({
					id,
					bottomText,
					error,
				})}
			/>
		</FormFieldWrapper>
	);
}
