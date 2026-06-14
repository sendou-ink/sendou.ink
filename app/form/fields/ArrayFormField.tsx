import { Plus, Trash } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { isDeepEqual, omit } from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
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
	addable?: boolean;
	canRemoveItem?: (itemValue: unknown, index: number) => boolean;
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
	addable = true,
	canRemoveItem,
}: ArrayFormFieldProps) {
	const { t } = useTranslation(["common"]);
	const { translatedLabel, translatedBottomText, translatedError } =
		useTranslatedTexts({ label, bottomText, error });

	const count = value.length;
	// Always render at least one item so an empty array still shows an input
	// the user can fill, rather than only an "Add" button. The underlying value
	// stays empty until edited, so submitting an untouched field sends nothing.
	const minVisible = Math.max(min, 1);
	const visibleCount = Math.max(count, minVisible);

	const makeNewItem = () => {
		const baseValue =
			itemInitialValue !== undefined
				? itemInitialValue
				: isObjectArray
					? {}
					: undefined;
		return typeof baseValue === "object" && baseValue !== null
			? {
					...(baseValue as Record<string, unknown>),
					_key: crypto.randomUUID(),
				}
			: baseValue;
	};

	const handleAdd = () => {
		// While the array is empty we still render one placeholder row that isn't
		// part of `value` yet. Pad `value` up to the number of visible rows first so
		// the added item appears below them instead of only backing the placeholder.
		const padded = [...value];
		while (padded.length < visibleCount) {
			padded.push(makeNewItem());
		}
		onChange([...padded, makeNewItem()]);
	};

	// An item the user hasn't touched still equals the freshly added template, so
	// it's indistinguishable from the placeholder shown for an empty array.
	const isPristineItem = (item: unknown) => {
		const template = itemInitialValue;
		if (typeof template === "object" && template !== null) {
			if (typeof item !== "object" || item === null) return true;
			return isDeepEqual(
				omit(item as Record<string, unknown>, ["_key"]),
				template,
			);
		}
		return template === undefined
			? item === null || item === undefined || item === ""
			: isDeepEqual(item, template);
	};

	// A single pristine row is indistinguishable from the empty-array placeholder,
	// so it shouldn't offer a remove button (you can't go below one visible row
	// anyway). A lone edited row stays removable so the only item can be cleared.
	const canRemoveAt = (index: number) =>
		(canRemoveItem ? canRemoveItem(value[index], index) : true) &&
		count > min &&
		(count > minVisible || !isPristineItem(value[index]));

	const handleRemoveAt = (index: number) => {
		const next = value.filter((_, i) => i !== index);
		// Removing down to a single pristine row would leave a stray entry that
		// looks untouched but still fails validation on submit; collapse it back to
		// an empty array so it matches the pristine state.
		onChange(next.length === 1 && isPristineItem(next[0]) ? [] : next);
	};

	const itemKey = (idx: number) => {
		if (!isObjectArray) return idx;
		return ((value[idx] as Record<string, unknown>)?._key as string) ?? idx;
	};

	return (
		<div className="stack md w-full">
			{translatedLabel ? (
				<div className="text-xs font-semi-bold">{translatedLabel}</div>
			) : null}
			{Array.from({ length: visibleCount }).map((_, idx) =>
				isObjectArray ? (
					<ArrayItemFieldset
						key={itemKey(idx)}
						index={idx}
						canRemove={canRemoveAt(idx)}
						onRemove={() => handleRemoveAt(idx)}
						sortable={sortable}
					>
						{renderItem(idx, `${name}[${idx}]`)}
					</ArrayItemFieldset>
				) : (
					<div
						key={itemKey(idx)}
						className="stack horizontal sm items-start w-full"
					>
						<div className={styles.itemInput}>
							{renderItem(idx, `${name}[${idx}]`)}
						</div>
						{canRemoveAt(idx) ? (
							<SendouButton
								icon={<Trash />}
								aria-label="Remove item"
								size="small"
								variant="minimal-destructive"
								onPress={() => handleRemoveAt(idx)}
								className={styles.removeButton}
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
			{addable ? (
				<SendouButton
					size="small"
					variant="outlined"
					icon={<Plus />}
					onPress={handleAdd}
					isDisabled={count >= max}
					className="m-0-auto"
				>
					{t("common:actions.add")}
				</SendouButton>
			) : null}
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
				<SendouButton
					className={canRemove ? undefined : "invisible"}
					shape="circle"
					icon={<Trash />}
					aria-label="Remove item"
					size="small"
					variant="minimal-destructive"
					onPress={onRemove}
					isDisabled={!canRemove}
				/>
			</div>
			<div className={styles.content}>{children}</div>
		</fieldset>
	);
}
