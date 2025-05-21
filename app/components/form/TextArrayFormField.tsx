import {
	type FieldPath,
	type FieldValues,
	useFieldArray,
	useFormContext,
} from "react-hook-form";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { AddFieldButton } from "./AddFieldButton";
import { RemoveFieldButton } from "./RemoveFieldButton";

export function TextArrayFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
	/** If "plain", value in the text array is a plain string. If "object" then an object containing the text under "value" key */
	format = "plain",
}: {
	label: string;
	name: FieldPath<T>;
	bottomText?: string;
	format?: "plain" | "object";
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
								<input
									{...register(
										format === "plain"
											? `${name}.${index}`
											: `${name}.${index}.value`,
									)}
								/>
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
					onClick={() => append(format === "plain" ? "" : { value: "" })}
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
