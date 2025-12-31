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
	clearable?: boolean;
};

export function DualSelectFormField<V extends string>({
	name,
	bottomText,
	error,
	onBlur,
	value,
	onChange,
	clearable,
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
					clearable={clearable}
				/>
				<SelectFormField
					label={fields[1].label}
					items={fields[1].items}
					value={value[1]}
					onChange={(newValue) => onChange([value[0], newValue])}
					onBlur={onBlur}
					clearable={clearable}
				/>
			</div>
			<input type="hidden" name={name} value={JSON.stringify(value)} />
			<FormFieldMessages error={error} bottomText={bottomText} />
		</div>
	);
}
