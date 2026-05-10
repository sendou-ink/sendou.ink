import { useDroppable } from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Trash } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { useTierListState } from "../contexts/TierListContext";
import {
	PRESET_COLORS,
	TIER_NAME_FONT_SIZE_BREAKPOINTS,
	TIER_NAME_FONT_SIZE_MIN,
	TIER_NAME_MAX_LENGTH,
} from "../tier-list-maker-constants";
import type { TierListMakerTier } from "../tier-list-maker-schemas";
import { tierListItemId } from "../tier-list-maker-utils";
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
		screenshotMode,
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

	const tierIndex = state.tiers.findIndex((t) => t.id === tier.id);
	const isFirstTier = tierIndex === 0;
	const isLastTier = tierIndex === state.tiers.length - 1;

	return (
		<div className={styles.container}>
			{showTierHeaders ? (
				<SendouPopover
					trigger={
						<Button
							className={styles.tierLabel}
							style={{
								backgroundColor: tier.color,
							}}
						>
							<span
								className={styles.tierName}
								style={{ fontSize: tierNameFontSize(tier.name) }}
							>
								{tier.name}
							</span>
						</Button>
					}
				>
					<div className={styles.popupContent}>
						<div className="stack horizontal justify-between">
							<span className="font-bold text-md">
								{t("tier-list-maker:editingTier")}
							</span>
						</div>
						<div className="stack md">
							<input
								type="text"
								value={tier.name}
								onChange={(e) => handleRenameTier(tier.id, e.target.value)}
								className={styles.nameInput}
								maxLength={TIER_NAME_MAX_LENGTH}
							/>
							<div className={styles.colorPickerContainer}>
								<div className={styles.presetColorsGrid}>
									{PRESET_COLORS.map((color) => (
										<button
											key={color}
											type="button"
											className={clsx(styles.colorButton, {
												[styles.colorButtonSelected]: tier.color === color,
											})}
											style={{ backgroundColor: color }}
											onClick={() => handleChangeTierColor(tier.id, color)}
											aria-label={`Select color ${color}`}
										/>
									))}
								</div>
								<label className={styles.customColorLabel}>
									<span className="text-xs">{t("tier-list-maker:custom")}</span>
									<input
										type="color"
										value={tier.color}
										onChange={(e) =>
											handleChangeTierColor(tier.id, e.target.value)
										}
									/>
								</label>
							</div>
						</div>
						<div className="stack horizontal justify-end">
							<SendouButton
								onPress={() => handleRemoveTier(tier.id)}
								variant="minimal-destructive"
								icon={<Trash />}
							/>
						</div>
					</div>
				</SendouPopover>
			) : null}

			<div
				ref={combinedRef}
				style={{
					borderRadius: screenshotMode ? "var(--radius-field)" : undefined,
				}}
				className={clsx(styles.targetZone, {
					[styles.targetZoneOver]: isOver,
				})}
			>
				{items.length === 0 && !screenshotMode ? (
					<div className={styles.emptyMessage}>
						{t("tier-list-maker:dropItems")}
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

			{!screenshotMode ? (
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
			) : null}
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

function tierNameFontSize(name: string) {
	const length = name.length;
	for (const breakpoint of TIER_NAME_FONT_SIZE_BREAKPOINTS) {
		if (length <= breakpoint.maxLength) {
			return breakpoint.fontSize;
		}
	}
	return TIER_NAME_FONT_SIZE_MIN;
}
