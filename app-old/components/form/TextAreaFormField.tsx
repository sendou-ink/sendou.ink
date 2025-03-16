import * as React from "react";
import {
	type FieldPath,
	type FieldValues,
	get,
	useFormContext,
	useWatch,
} from "react-hook-form";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";

export function TextAreaFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
	maxLength,
}: {
	label: string;
	name: FieldPath<T>;
	bottomText?: string;
	maxLength: number;
}) {
	const methods = useFormContext();
	const value = useWatch({ name }) ?? "";
	const id = React.useId();

	const error = get(methods.formState.errors, name);

	return (
		<div>
			<Label
				htmlFor={id}
				valueLimits={{ current: value.length, max: maxLength }}
			>
				{label}
			</Label>
			<textarea id={id} {...methods.register(name)} />
			{error && (
				<FormMessage type="error">{error.message as string}</FormMessage>
			)}
			{bottomText && !error ? (
				<FormMessage type="info">{bottomText}</FormMessage>
			) : null}
		</div>
	);
}
