import { useFieldArray, useFormContext } from "react-hook-form";
import type { z } from "zod";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { AddFieldButton } from "./AddFieldButton";
import { RemoveFieldButton } from "./RemoveFieldButton";

export function TextArrayFormField<T extends z.ZodTypeAny>({
	label,
	name,
	defaultFieldValue,
	bottomText,
}: {
	label: string;
	name: keyof z.infer<T> & string;
	defaultFieldValue: string;
	bottomText?: string;
}) {
	const {
		register,
		formState: { errors },
		clearErrors,
	} = useFormContext();
	const { fields, append, remove } = useFieldArray({
		name,
	});

	const rootError = errors[name]?.root;

	return (
		<div>
			<Label>{label}</Label>
			<div className="stack md">
				{fields.map((field, index) => {
					// @ts-expect-error
					const error = errors[name]?.[index]?.value;

					return (
						<div key={field.id}>
							<div className="stack horizontal md">
								<input {...register(`${name}.${index}.value`)} />
								{fields.length > 1 ? (
									<RemoveFieldButton
										onClick={() => {
											remove(index);
											clearErrors(`${name}.root`);
										}}
									/>
								) : null}
							</div>
							{error && (
								<FormMessage type="error">
									{error.message as string}
								</FormMessage>
							)}
						</div>
					);
				})}
				<AddFieldButton
					// @ts-expect-error
					onClick={() => append({ value: defaultFieldValue })}
				/>
				{rootError && (
					<FormMessage type="error">{rootError.message as string}</FormMessage>
				)}
				{bottomText && !rootError ? (
					<FormMessage type="info">{bottomText}</FormMessage>
				) : null}
			</div>
		</div>
	);
}
