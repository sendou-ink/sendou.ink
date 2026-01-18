import type * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { PlusIcon } from "~/components/icons/Plus";
import { TrashIcon } from "~/components/icons/Trash";
import type { FormFieldProps } from "../types";
import styles from "./ArrayFormField.module.css";
import { useTranslatedTexts } from "./FormFieldWrapper";

type ArrayFormFieldProps = Omit<FormFieldProps<"array">, "field"> & {
	name: string;
	value: unknown[];
	onChange: (value: unknown[]) => void;
	renderItem: (index: number, name: string) => React.ReactNode;
	isObjectArray?: boolean;
	sortable?: boolean;
	itemInitialValue?: unknown;
};

export function ArrayFormField({
	label,
	name,
	bottomText,
	error,
	min = 0,
	max,
	value,
	onChange,
	renderItem,
	isObjectArray,
	sortable,
	itemInitialValue,
}: ArrayFormFieldProps) {
	const { t } = useTranslation(["common"]);
	const { translatedLabel, translatedBottomText, translatedError } =
		useTranslatedTexts({ label, bottomText, error });

	const count = value.length;

	const handleAdd = () => {
		const newItemValue =
			itemInitialValue !== undefined
				? itemInitialValue
				: isObjectArray
					? {}
					: undefined;
		onChange([...value, newItemValue]);
	};

	const handleRemoveAt = (index: number) => {
		onChange(value.filter((_, i) => i !== index));
	};

	return (
		<div className="stack md w-full">
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
			{Array.from({ length: count }).map((_, idx) =>
				isObjectArray ? (
					<ArrayItemFieldset
						key={idx}
						index={idx}
						canRemove={count > min}
						onRemove={() => handleRemoveAt(idx)}
						sortable={sortable}
					>
						{renderItem(idx, `${name}[${idx}]`)}
					</ArrayItemFieldset>
				) : (
					<div key={idx} className="stack horizontal sm items-center w-full">
						<div className={styles.itemInput}>
							{renderItem(idx, `${name}[${idx}]`)}
						</div>
						{count > min ? (
							<SendouButton
								icon={<TrashIcon />}
								aria-label="Remove item"
								size="small"
								variant="minimal-destructive"
								onPress={() => handleRemoveAt(idx)}
							/>
						) : null}
					</div>
				),
			)}
			{translatedError ? (
				<FormMessage type="error">{translatedError}</FormMessage>
			) : null}
			{translatedBottomText && !translatedError ? (
				<FormMessage type="info">{translatedBottomText}</FormMessage>
			) : null}
			<SendouButton
				size="small"
				icon={<PlusIcon />}
				onPress={handleAdd}
				isDisabled={count >= max}
				style={{ margin: "0 auto" }}
			>
				{t("common:actions.add")}
			</SendouButton>
		</div>
	);
}

function ArrayItemFieldset({
	index,
	children,
	canRemove,
	onRemove,
	sortable,
}: {
	index: number;
	children: React.ReactNode;
	canRemove: boolean;
	onRemove: () => void;
	sortable?: boolean;
}) {
	return (
		<fieldset className={styles.card}>
			<div className={styles.header}>
				{sortable ? <span className={styles.dragHandle}>☰</span> : null}
				<legend className={styles.headerLabel}>#{index + 1}</legend>
				{canRemove ? (
					<SendouButton
						icon={<TrashIcon />}
						aria-label="Remove item"
						size="small"
						variant="minimal-destructive"
						onPress={onRemove}
					/>
				) : null}
			</div>
			<div className={styles.content}>{children}</div>
		</fieldset>
	);
}
