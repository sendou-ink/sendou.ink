import { ChevronDown, ChevronUp, Plus, Trash } from "lucide-react";
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
	disabled?: boolean;
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
	disabled,
}: ArrayFormFieldProps) {
	const { t } = useTranslation(["common"]);
	const { translatedLabel, translatedBottomText, translatedError } =
		useTranslatedTexts({ label, bottomText, error });

	const count = value.length;
	// an empty array still shows one input; the value stays empty until edited
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
		// pad up to the visible rows first so the added item appears below the placeholder row
		const padded = [...value];
		while (padded.length < visibleCount) {
			padded.push(makeNewItem());
		}
		onChange([...padded, makeNewItem()]);
	};

	// an untouched item still equals the template, like the empty-array placeholder
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

	// a single pristine row is the placeholder, so no remove button; a lone edited row stays removable
	const canRemoveAt = (index: number) =>
		!disabled &&
		(canRemoveItem ? canRemoveItem(value[index], index) : true) &&
		count > min &&
		(count > minVisible || !isPristineItem(value[index]));

	const handleRemoveAt = (index: number) => {
		const next = value.filter((_, i) => i !== index);
		// a lone pristine row would still fail validation on submit, so collapse to empty
		onChange(next.length === 1 && isPristineItem(next[0]) ? [] : next);
	};

	const itemKey = (idx: number) => {
		if (!isObjectArray) return idx;
		return ((value[idx] as Record<string, unknown>)?._key as string) ?? idx;
	};

	// primitive arrays render inline without the fieldset header that carries the reorder controls
	const isSortable = Boolean(sortable) && isObjectArray && !disabled;

	const handleMoveAt = (index: number, direction: 1 | -1) => {
		const target = index + direction;
		if (target < 0 || target >= count) return;

		const next = [...value];
		[next[index], next[target]] = [next[target], next[index]];
		onChange(next);
	};

	return (
		<div className="stack md w-full">
			{translatedLabel ? (
				<div className="text-xs font-semi-bold">{translatedLabel}</div>
			) : null}
			{isObjectArray
				? Array.from({ length: visibleCount }).map((_, idx) => (
						<ArrayItemFieldset
							key={itemKey(idx)}
							index={idx}
							canRemove={canRemoveAt(idx)}
							removeButtonTestId={`${name}-remove-item-button`}
							onRemove={() => handleRemoveAt(idx)}
							sortable={isSortable}
							canMoveUp={idx > 0}
							canMoveDown={idx < count - 1}
							onMoveUp={() => handleMoveAt(idx, -1)}
							onMoveDown={() => handleMoveAt(idx, 1)}
						>
							{renderItem(idx, `${name}[${idx}]`)}
						</ArrayItemFieldset>
					))
				: Array.from({ length: visibleCount }).map((_, idx) => (
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
									data-testid={`${name}-remove-item-button`}
								/>
							) : null}
						</div>
					))}
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
					isDisabled={count >= max || disabled}
					className="m-0-auto"
					data-testid={`${name}-add-item-button`}
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
	removeButtonTestId,
	onRemove,
	sortable,
	canMoveUp,
	canMoveDown,
	onMoveUp,
	onMoveDown,
}: {
	index: number;
	children: React.ReactNode;
	canRemove: boolean;
	removeButtonTestId?: string;
	onRemove: () => void;
	sortable?: boolean;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
}) {
	return (
		<fieldset className={styles.card}>
			<div className={styles.header}>
				<legend className={styles.headerLabel}>#{index + 1}</legend>
				{sortable ? (
					<>
						<SendouButton
							shape="circle"
							icon={<ChevronDown />}
							aria-label="Move down"
							size="small"
							variant="minimal"
							onPress={onMoveDown}
							isDisabled={!canMoveDown}
						/>
						<SendouButton
							shape="circle"
							icon={<ChevronUp />}
							aria-label="Move up"
							size="small"
							variant="minimal"
							onPress={onMoveUp}
							isDisabled={!canMoveUp}
						/>
					</>
				) : null}
				<SendouButton
					className={canRemove ? undefined : "invisible"}
					shape="circle"
					icon={<Trash />}
					aria-label="Remove item"
					size="small"
					variant="minimal-destructive"
					onPress={onRemove}
					isDisabled={!canRemove}
					data-testid={removeButtonTestId}
				/>
			</div>
			<div className={styles.content}>{children}</div>
		</fieldset>
	);
}
