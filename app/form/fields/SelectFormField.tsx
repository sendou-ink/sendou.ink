import * as React from "react";
import { Text } from "react-aria-components";
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

const TWO_LINE_ROW_HEIGHT = 52;

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
	disabled?: boolean;
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
	disabled,
}: SelectFormFieldProps<V>) {
	const { t, i18n } = useTranslation(["common"]);
	const id = React.useId();

	const itemsWithResolvedLabels = items.map((item) => {
		const itemLabel = item.label;
		const resolvedLabel =
			typeof itemLabel === "function"
				? itemLabel(i18n.language)
				: typeof itemLabel === "string" &&
						itemLabel.includes(":") &&
						i18n.exists(itemLabel)
					? t(itemLabel as never)
					: String(itemLabel);

		return {
			value: item.value,
			resolvedLabel,
			description: item.description,
		};
	});

	const hasDescriptions = itemsWithResolvedLabels.some(
		(item) => item.description,
	);

	if (searchable || hasDescriptions) {
		return (
			<CustomSelect
				name={name}
				label={label}
				bottomText={bottomText}
				error={error}
				items={itemsWithResolvedLabels}
				value={value}
				onChange={onChange}
				onBlur={onBlur}
				clearable={clearable}
				disabled={disabled}
				searchPlaceholder={searchable ? t("common:actions.search") : undefined}
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
				disabled={disabled}
				{...ariaAttributes({ name, error, bottomText })}
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

function CustomSelect<V extends string>({
	name,
	label,
	bottomText,
	error,
	items,
	value,
	onChange,
	onBlur,
	clearable,
	disabled,
	searchPlaceholder,
}: {
	name?: string;
	label?: string;
	bottomText?: string;
	error?: string;
	items: Array<{
		value: V;
		resolvedLabel: string;
		description?: React.ReactNode;
	}>;
	value: V | null;
	onChange: (value: V | null) => void;
	onBlur?: () => void;
	clearable?: boolean;
	disabled?: boolean;
	searchPlaceholder?: string;
}) {
	const { translatedLabel } = useTranslatedTexts({ label });

	const hasDescriptions = items.some((item) => item.description);

	// searchable selects' Autocomplete drops falsy keys, so only plain selects get a "—" clear item
	const hasEmptyItem = Boolean(clearable && !searchPlaceholder);

	const selectItems = [
		...(hasEmptyItem
			? [{ id: "", textValue: "—", description: undefined }]
			: []),
		...items.map((item) => ({
			id: item.value as string,
			textValue: item.resolvedLabel,
			description: item.description,
		})),
	];

	return (
		<div className={styles.searchable}>
			<SendouSelect
				label={translatedLabel}
				selectedKey={value ?? (hasEmptyItem ? "" : null)}
				onSelectionChange={(key) => {
					const newValue = key === "" ? null : (key as V);
					onChange(newValue);
					onBlur?.();
				}}
				items={selectItems}
				search={
					searchPlaceholder ? { placeholder: searchPlaceholder } : undefined
				}
				clearable={clearable && !hasEmptyItem}
				isDisabled={disabled}
				estimatedRowHeight={hasDescriptions ? TWO_LINE_ROW_HEIGHT : undefined}
			>
				{(item) => (
					<SendouSelectItem id={item.id} textValue={item.textValue}>
						{item.description ? (
							<span className={styles.twoLineItem}>
								<Text slot="label">{item.textValue}</Text>
								<Text slot="description" className={styles.itemDescription}>
									{item.description}
								</Text>
							</span>
						) : (
							item.textValue
						)}
					</SendouSelectItem>
				)}
			</SendouSelect>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</div>
	);
}
