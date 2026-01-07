import type { z } from "zod";
import { FormMessage } from "~/components/FormMessage";
import { FormField } from "../FormField";
import type { FormFieldProps } from "../types";
import { useTranslatedTexts } from "./FormFieldWrapper";

type FieldsetFormFieldProps<S extends z.ZodRawShape> = Omit<
	FormFieldProps<"fieldset">,
	"fields"
> & {
	name: string;
	fields: z.ZodObject<S>;
};

export function FieldsetFormField<S extends z.ZodRawShape>({
	label,
	name,
	bottomText,
	error,
	fields,
}: FieldsetFormFieldProps<S>) {
	const fieldNames = Object.keys(fields.shape);
	const { translatedLabel, translatedBottomText, translatedError } =
		useTranslatedTexts({ label, bottomText, error });

	return (
		<div className="stack md">
			{translatedLabel ? (
				<div
					style={{
						fontSize: "var(--fonts-xs)",
						fontWeight: "var(--semi-bold)",
					}}
				>
					{translatedLabel}
				</div>
			) : null}
			{fieldNames.map((fieldName) => (
				<FormField
					key={fieldName}
					name={`${name}.${fieldName}`}
					field={fields.shape[fieldName] as z.ZodType}
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
