import * as React from "react";
import {
	type FieldPath,
	type FieldValues,
	get,
	useFormContext,
} from "react-hook-form";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { type FormFieldSize, formFieldSizeToClassName } from "./form-utils";

export function TextFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
	placeholder,
	required,
	size = "small",
}: {
	label: string;
	name: FieldPath<T>;
	bottomText?: string;
	placeholder?: string;
	required?: boolean;
	size?: FormFieldSize;
}) {
	const methods = useFormContext();
	const id = React.useId();

	const error = get(methods.formState.errors, name);

	return (
		<div>
			<Label htmlFor={id} required={required}>
				{label}
			</Label>
			<input
				id={id}
				placeholder={placeholder}
				{...methods.register(name)}
				className={formFieldSizeToClassName(size)}
			/>
			{error && (
				<FormMessage type="error">{error.message as string}</FormMessage>
			)}
			{bottomText && !error ? (
				<FormMessage type="info">{bottomText}</FormMessage>
			) : null}
		</div>
	);
}
