import * as React from "react";
import {
	Controller,
	type FieldPath,
	type FieldValues,
	get,
	useFormContext,
} from "react-hook-form";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { SendouSwitch } from "../elements/Switch";

export function ToggleFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
}: { label: string; name: FieldPath<T>; bottomText?: string }) {
	const methods = useFormContext();
	const id = React.useId();

	const error = get(methods.formState.errors, name);

	return (
		<div>
			<Label htmlFor={id}>{label}</Label>
			<Controller
				control={methods.control}
				name={name}
				render={({ field: { value, onChange } }) => (
					<SendouSwitch id={id} isSelected={value} onChange={onChange} />
				)}
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
