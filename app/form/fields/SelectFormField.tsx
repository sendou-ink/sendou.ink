import * as React from "react";
import { useTranslation } from "react-i18next";
import type { FormFieldItems, FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import { FormFieldWrapper } from "./FormFieldWrapper";

type SelectFormFieldProps<V extends string> = Omit<
	FormFieldProps<"select">,
	"items" | "clearable" | "onBlur" | "name"
> & {
	name?: string;
	items: FormFieldItems<V>;
	value: V | null;
	onChange: (value: V | null) => void;
	onSelect?: (value: V) => void;
	onBlur?: () => void;
};

export function SelectFormField<V extends string>({
	name,
	label,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	onSelect,
}: SelectFormFieldProps<V>) {
	const { t, i18n } = useTranslation();
	const id = React.useId();

	const itemsWithResolvedLabels = items.map((item) => {
		const itemLabel = item.label;
		const resolvedLabel =
			typeof itemLabel === "function"
				? itemLabel(i18n.language)
				: typeof itemLabel === "string" && itemLabel.includes(":")
					? t(itemLabel as never)
					: String(itemLabel);

		return {
			value: item.value,
			resolvedLabel,
		};
	});

	const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newValue = e.target.value === "" ? null : (e.target.value as V);
		onChange(newValue);
		if (newValue && onSelect) {
			onSelect(newValue);
		}
	};

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={error}
			bottomText={bottomText}
		>
			<select
				id={id}
				name={name}
				value={value ?? ""}
				onChange={handleChange}
				onBlur={() => onBlur?.()}
				{...ariaAttributes({ id, error, bottomText })}
			>
				{itemsWithResolvedLabels.map((item) => (
					<option key={item.value} value={item.value}>
						{item.resolvedLabel}
					</option>
				))}
			</select>
		</FormFieldWrapper>
	);
}
