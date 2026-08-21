import type * as v from "valibot";
import { FormMessage } from "~/components/FormMessage";
import { FormField } from "../FormField";
import type { FormFieldProps } from "../types";
import { useTranslatedTexts } from "./FormFieldWrapper";

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
	const fieldNames = Object.keys(fields.entries);
	const { translatedLabel, translatedBottomText, translatedError } =
		useTranslatedTexts({ label, bottomText, error });

	return (
		<div className="stack md">
			{translatedLabel ? (
				<div className="text-xs font-semi-bold">{translatedLabel}</div>
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
				<FormMessage type="error">{translatedError}</FormMessage>
			) : null}
			{translatedBottomText && !translatedError ? (
				<FormMessage type="info">{translatedBottomText}</FormMessage>
			) : null}
		</div>
	);
}
