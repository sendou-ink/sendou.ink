import type { FormFieldItems, FormFieldProps } from "../types";
import { FormFieldMessages } from "./FormFieldWrapper";
import { SelectFormField } from "./SelectFormField";

type DualSelectFormFieldProps<V extends string> = Omit<
	FormFieldProps<"dual-select">,
	"clearable"
> & {
	fields: [
		{ label?: string; items: FormFieldItems<V> },
		{ label?: string; items: FormFieldItems<V> },
	];
	value: [V | null, V | null];
	onChange: (value: [V | null, V | null]) => void;
};

export function DualSelectFormField<V extends string>({
	name,
	bottomText,
	error,
	onBlur,
	value,
	onChange,
	fields,
}: DualSelectFormFieldProps<V>) {
	return (
		<div className="stack xs">
			<div className="stack horizontal md">
				<SelectFormField
					label={fields[0].label}
					items={fields[0].items}
					value={value[0]}
					onChange={(newValue) => onChange([newValue, value[1]])}
					onBlur={onBlur}
				/>
				<SelectFormField
					label={fields[1].label}
					items={fields[1].items}
					value={value[1]}
					onChange={(newValue) => onChange([value[0], newValue])}
					onBlur={onBlur}
				/>
			</div>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</div>
	);
}
