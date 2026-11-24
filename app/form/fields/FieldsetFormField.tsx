import * as React from "react";
import type * as v from "valibot";
import { FormMessage } from "~/components/FormMessage";
import { FormField } from "../FormField";
import type { FormFieldProps } from "../types";
import { errorMessageId, infoMessageId } from "../utils";
import { FormFieldGroup, useTranslatedTexts } from "./FormFieldWrapper";

type FieldsetFormFieldProps<S extends v.ObjectEntries> = Omit<
	FormFieldProps<"fieldset">,
	"fields"
> & {
	name: string;
	fields: v.ObjectSchema<S, undefined>;
	disabled?: boolean;
};

export function FieldsetFormField<S extends v.ObjectEntries>({
	label,
	name,
	bottomText,
	error,
	fields,
	disabled,
}: FieldsetFormFieldProps<S>) {
	const labelId = React.useId();
	const fieldNames = Object.keys(fields.entries);
	const { translatedLabel, translatedBottomText, translatedError } =
		useTranslatedTexts({ label, bottomText, error });

	return (
		<FormFieldGroup
			labelledBy={translatedLabel ? labelId : undefined}
			name={name}
			error={translatedError}
			bottomText={translatedError ? undefined : translatedBottomText}
			className="stack md"
		>
			{translatedLabel ? (
				<div id={labelId} className="text-xs font-semi-bold">
					{translatedLabel}
				</div>
			) : null}
			{fieldNames.map((fieldName) => (
				<FormField
					key={fieldName}
					name={`${name}.${fieldName}`}
					field={fields.entries[fieldName]}
					disabled={disabled}
				/>
			))}
			{translatedError ? (
				<FormMessage type="error" id={errorMessageId(name)}>
					{translatedError}
				</FormMessage>
			) : null}
			{translatedBottomText && !translatedError ? (
				<FormMessage type="info" id={infoMessageId(name)}>
					{translatedBottomText}
				</FormMessage>
			) : null}
		</FormFieldGroup>
	);
}
