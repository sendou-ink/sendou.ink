import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import type { FormFieldItems, FormFieldProps } from "../types";
import { ariaAttributes } from "../utils";
import {
	FormFieldMessages,
	FormFieldWrapper,
	useTranslatedTexts,
} from "./FormFieldWrapper";
import styles from "./SelectFormField.module.css";

type SelectFormFieldProps<V extends string> = Omit<
	FormFieldProps<"select">,
	"items" | "clearable" | "onBlur" | "name" | "searchable"
> & {
	name?: string;
	items: FormFieldItems<V>;
	value: V | null;
	onChange: (value: V | null) => void;
	onSelect?: (value: V) => void;
	onBlur?: () => void;
	clearable?: boolean;
	searchable?: boolean;
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
	clearable,
	searchable,
}: SelectFormFieldProps<V>) {
	const { t, i18n } = useTranslation(["common"]);
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

	if (searchable) {
		return (
			<SearchableSelect
				name={name}
				label={label}
				bottomText={bottomText}
				error={error}
				items={itemsWithResolvedLabels}
				value={value}
				onChange={onChange}
				onBlur={onBlur}
				clearable={clearable}
				searchPlaceholder={t("common:actions.search")}
			/>
		);
	}

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
				{clearable ? <option value="">—</option> : null}
				{itemsWithResolvedLabels.map((item) => (
					<option key={item.value} value={item.value}>
						{item.resolvedLabel}
					</option>
				))}
			</select>
		</FormFieldWrapper>
	);
}

function SearchableSelect<V extends string>({
	name,
	label,
	bottomText,
	error,
	items,
	value,
	onChange,
	onBlur,
	clearable,
	searchPlaceholder,
}: {
	name?: string;
	label?: string;
	bottomText?: string;
	error?: string;
	items: Array<{ value: V; resolvedLabel: string }>;
	value: V | null;
	onChange: (value: V | null) => void;
	onBlur?: () => void;
	clearable?: boolean;
	searchPlaceholder: string;
}) {
	const { translatedLabel } = useTranslatedTexts({ label });

	const selectItems = items.map((item) => ({
		id: item.value,
		textValue: item.resolvedLabel,
	}));

	return (
		<div className={styles.searchable}>
			<SendouSelect
				label={translatedLabel}
				selectedKey={value}
				onSelectionChange={(key) => {
					const newValue = key === "" ? null : (key as V);
					onChange(newValue);
					onBlur?.();
				}}
				items={selectItems}
				search={{ placeholder: searchPlaceholder }}
				clearable={clearable}
			>
				{(item) => (
					<SendouSelectItem id={item.id} textValue={item.textValue}>
						{item.textValue}
					</SendouSelectItem>
				)}
			</SendouSelect>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</div>
	);
}
