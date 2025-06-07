import * as React from "react";
import {
	Controller,
	type FieldPath,
	type FieldValues,
	useFormContext,
} from "react-hook-form";
import { FormMessage } from "~/components/FormMessage";

interface InputGroupFormFieldProps<T extends FieldValues> {
	label: string;
	name: FieldPath<T>;
	bottomText?: string;
	type: "checkbox" | "radio";
	values: Array<{
		label: string;
		value: string;
	}>;
}

export function InputGroupFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
	values,
	type,
}: InputGroupFormFieldProps<T>) {
	const methods = useFormContext();

	return (
		<Controller
			name={name}
			control={methods.control}
			render={({
				field: { name, value, onChange, ref },
				fieldState: { error },
			}) => {
				const handleCheckboxChange =
					(name: string) => (newChecked: boolean) => {
						const newValue = newChecked
							? [...(value || []), name]
							: value?.filter((v: string) => v !== name);

						onChange(newValue);
					};

				const handleRadioChange = (name: string) => () => {
					onChange(name);
				};

				return (
					<div>
						<fieldset className="stack sm" ref={ref}>
							<legend>{label}</legend>

							{values.map((checkbox) => {
								const isChecked = value?.includes(checkbox.value);

								return (
									<GroupInput
										key={checkbox.value}
										type={type}
										name={name}
										checked={isChecked}
										onChange={
											type === "checkbox"
												? handleCheckboxChange(checkbox.value)
												: handleRadioChange(checkbox.value)
										}
									>
										{checkbox.label}
									</GroupInput>
								);
							})}
						</fieldset>
						{error && (
							<FormMessage type="error">{error.message as string}</FormMessage>
						)}
						{bottomText && !error ? (
							<FormMessage type="info">{bottomText}</FormMessage>
						) : null}
					</div>
				);
			}}
		/>
	);
}

function GroupInput({
	children,
	name,
	checked,
	onChange,
	type,
}: {
	children: React.ReactNode;
	name: string;
	checked: boolean;
	onChange: (newChecked: boolean) => void;
	type: "checkbox" | "radio";
}) {
	const id = React.useId();

	return (
		<div className="stack horizontal sm items-center">
			<input
				type={type}
				id={id}
				name={name}
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
			<label htmlFor={id} className="mb-0">
				{children}
			</label>
		</div>
	);
}
