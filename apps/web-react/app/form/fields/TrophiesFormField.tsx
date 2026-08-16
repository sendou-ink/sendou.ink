import * as React from "react";
import { TrophiesSelector } from "~/features/trophies/components/TrophiesSelector";
import type { FormFieldProps, TrophyOption } from "../types";
import { FormFieldWrapper } from "./FormFieldWrapper";

type TrophiesFormFieldProps = Omit<FormFieldProps<"trophies">, "onBlur"> & {
	value: number[];
	onChange: (value: number[]) => void;
	onBlur?: () => void;
	options: TrophyOption[];
};

export function TrophiesFormField({
	name,
	label,
	bottomText,
	error,
	maxCount,
	value,
	onChange,
	onBlur,
	options,
}: TrophiesFormFieldProps) {
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={error}
			bottomText={bottomText}
		>
			<TrophiesSelector
				options={options}
				selectedTrophies={value}
				onChange={onChange}
				onBlur={onBlur}
				maxCount={maxCount}
			/>
		</FormFieldWrapper>
	);
}
