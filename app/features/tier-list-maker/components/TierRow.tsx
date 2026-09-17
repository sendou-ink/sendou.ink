import { useDroppable } from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Plus, Trash } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { useTierListState } from "../contexts/TierListContext";
import {
	PRESET_COLORS,
	TIER_NAME_MAX_LENGTH,
} from "../tier-list-maker-constants";
import type { TierListMakerTier } from "../tier-list-maker-schemas";
import {
	isLightColor,
	tierListItemId,
	tierNameFontSize,
	tierTextColor,
} from "../tier-list-maker-utils";
import { DraggableItem } from "./DraggableItem";
import styles from "./TierRow.module.css";

interface TierRowProps {
	tier: TierListMakerTier;
}

export function TierRow({ tier }: TierRowProps) {
	const {
		state,
		activeItem,
		getItemsInTier,
		handleRemoveTier,
		handleRenameTier,
		handleChangeTierColor,
		handleMoveTierUp,
		handleMoveTierDown,
		showTierHeaders,
		placementMode,
		selectedTierId,
		setSelectedTierId,
	} = useTierListState();

	const items = getItemsInTier(tier.id);
	const { t } = useTranslation(["tier-list-maker", "common"]);
	const { setNodeRef, isOver } = useDroppable({
		id: tier.id,
	});

	const combinedRef = useLockedHeightWhileDragging({
		setNodeRef,
		isDragging: activeItem !== null,
	});

	const tierIndex = state.tiers.findIndex(
		(candidate) => candidate.id === tier.id,
	);
	const isFirstTier = tierIndex === 0;
	const isLastTier = tierIndex === state.tiers.length - 1;

	const isClickMode = placementMode === "click";
	const isSelected = isClickMode && selectedTierId === tier.id;

	const hasCustomColor = !PRESET_COLORS.includes(tier.color);

	const selectTierProps = isClickMode
		? {
				role: "button",
				tabIndex: 0,
				onClick: () => setSelectedTierId(tier.id),
				onKeyDown: (event: KeyboardEvent) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setSelectedTierId(tier.id);
					}
				},
			}
		: {};

	return (
		<div className={styles.container}>
			{showTierHeaders ? (
				<SendouPopover
					trigger={
						<button
							type="button"
							className={styles.tierLabel}
							style={{
								backgroundColor: tier.color,
							}}
						>
							<span
								className={styles.tierName}
								style={{
									fontSize: tierNameFontSize(tier.name),
									color: tierTextColor(tier.color),
								}}
							>
								{tier.name}
							</span>
						</button>
					}
				>
					<div className={styles.popupContent}>
						<div className="stack horizontal justify-between items-center">
							<span className="font-bold text-md">
								{t("tier-list-maker:editingTier")}
							</span>
							<SendouButton
								onClick={() => handleRemoveTier(tier.id)}
								variant="minimal-destructive"
								className={styles.deleteButton}
								icon={<Trash />}
								aria-label={t("common:actions.delete")}
							/>
						</div>
						<input
							type="text"
							value={tier.name}
							onChange={(e) => handleRenameTier(tier.id, e.target.value)}
							className={styles.nameInput}
							maxLength={TIER_NAME_MAX_LENGTH}
						/>
						<div className={styles.colorGrid}>
							{PRESET_COLORS.map((color) => (
								<button
									key={color}
									type="button"
									className={clsx(styles.colorButton, {
										[styles.colorButtonSelected]: tier.color === color,
									})}
									style={{ backgroundColor: color }}
									onClick={() => handleChangeTierColor(tier.id, color)}
									aria-label={color}
								/>
							))}
							<label
								className={clsx(styles.colorButton, styles.customColorButton, {
									[styles.colorButtonSelected]: hasCustomColor,
									[styles.customColorButtonOnLight]:
										hasCustomColor && isLightColor(tier.color),
									[styles.customColorButtonOnDark]:
										hasCustomColor && !isLightColor(tier.color),
								})}
								style={
									hasCustomColor ? { backgroundColor: tier.color } : undefined
								}
							>
								<Plus className={styles.customColorIcon} />
								<input
									type="color"
									className={styles.customColorInput}
									value={tier.color}
									aria-label={t("tier-list-maker:custom")}
									onChange={(e) =>
										handleChangeTierColor(tier.id, e.target.value)
									}
								/>
							</label>
						</div>
					</div>
				</SendouPopover>
			) : null}

			<div
				ref={combinedRef}
				className={clsx(styles.targetZone, {
					[styles.targetZoneOver]: isOver,
					[styles.targetZoneSelectable]: isClickMode,
					[styles.targetZoneSelected]: isSelected,
				})}
				{...selectTierProps}
			>
				{items.length === 0 ? (
					<div className={styles.emptyMessage}>
						{isClickMode
							? t("tier-list-maker:clickToAdd")
							: t("tier-list-maker:dropItems")}
					</div>
				) : items.length > 0 ? (
					<SortableContext
						items={items.map(tierListItemId)}
						strategy={horizontalListSortingStrategy}
					>
						{items.map((item) => (
							<DraggableItem key={tierListItemId(item)} item={item} />
						))}
					</SortableContext>
				) : null}
			</div>

			<div className={styles.arrowControls}>
				<button
					className={clsx(styles.arrowButton, styles.arrowButtonUpper)}
					onClick={() => handleMoveTierUp(tier.id)}
					disabled={isFirstTier}
					type="button"
					aria-label="Move tier up"
				>
					<ChevronUp className={styles.arrowIcon} />
				</button>
				<button
					className={clsx(styles.arrowButton, styles.arrowButtonLower)}
					onClick={() => handleMoveTierDown(tier.id)}
					disabled={isLastTier}
					type="button"
					aria-label="Move tier down"
				>
					<ChevronDown className={styles.arrowIcon} />
				</button>
			</div>
		</div>
	);
}

function useLockedHeightWhileDragging({
	setNodeRef,
	isDragging,
}: {
	setNodeRef: (node: HTMLElement | null) => void;
	isDragging: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);

	const combinedRef = (node: HTMLDivElement | null) => {
		ref.current = node;
		setNodeRef(node);
	};

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		if (isDragging) {
			const rect = el.getBoundingClientRect();
			const firstItem = el.firstElementChild;
			const topOffset = firstItem
				? firstItem.getBoundingClientRect().top - rect.top
				: undefined;

			el.style.height = `${rect.height}px`;
			el.style.overflow = "hidden";

			if (topOffset !== undefined) {
				el.style.alignContent = "flex-start";
				el.style.paddingTop = `${topOffset}px`;
			}
		} else {
			el.style.height = "";
			el.style.overflow = "";
			el.style.alignContent = "";
			el.style.paddingTop = "";
		}
	}, [isDragging]);

	return combinedRef;
}
