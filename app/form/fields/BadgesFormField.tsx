import * as React from "react";
import { BadgesSelector } from "~/features/badges/components/BadgesSelector";
import type { BadgeOption, FormFieldProps } from "../types";
import { FormFieldWrapper } from "./FormFieldWrapper";

type BadgesFormFieldProps = Omit<FormFieldProps<"badges">, "onBlur"> & {
	value: number[];
	onChange: (value: number[]) => void;
	onBlur?: () => void;
	options: BadgeOption[];
};

export function BadgesFormField({
	name,
	label,
	bottomText,
	error,
	maxCount,
	value,
	onChange,
	onBlur,
	options,
}: BadgesFormFieldProps) {
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={error}
			bottomText={bottomText}
		>
			<BadgesSelector
				options={options}
				selectedBadges={value}
				onChange={onChange}
				onBlur={onBlur}
				maxCount={maxCount}
			/>
		</FormFieldWrapper>
	);
}
