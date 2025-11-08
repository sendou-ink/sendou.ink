import { useDroppable } from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import clsx from "clsx";
import { useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { TrashIcon } from "~/components/icons/Trash";
import { useTierListState } from "../contexts/TierListContext";
import type { Tier } from "../tier-list-maker-types";
import { DraggableItem } from "./DraggableItem";
import styles from "./TierRow.module.css";

interface TierRowProps {
	tier: Tier;
}

export function TierRow({ tier }: TierRowProps) {
	const {
		getItemsInTier,
		handleRemoveTier,
		handleRenameTier,
		handleChangeTierColor,
	} = useTierListState();

	const items = getItemsInTier(tier.id);
	const { t } = useTranslation(["tier-list-maker", "common"]);
	const { setNodeRef, isOver } = useDroppable({
		id: tier.id,
	});

	const [isPopupOpen, setIsPopupOpen] = useState(false);
	const [name, setName] = useState(tier.name);
	const [color, setColor] = useState(tier.color);

	const handlePopupOpenChange = (isOpen: boolean) => {
		if (isOpen) {
			setName(tier.name);
			setColor(tier.color);
		}
		setIsPopupOpen(isOpen);
	};

	const handleSaveEdit = () => {
		handleRenameTier(tier.id, name);
		handleChangeTierColor(tier.id, color);
		setIsPopupOpen(false);
	};

	const handleDelete = () => {
		handleRemoveTier(tier.id);
		setIsPopupOpen(false);
	};

	return (
		<div className={styles.container}>
			<SendouPopover
				trigger={
					<Button
						className={styles.tierLabel}
						style={{ backgroundColor: tier.color }}
						onPress={() => setIsPopupOpen(true)}
					>
						<span className={styles.tierName}>{tier.name}</span>
					</Button>
				}
				isOpen={isPopupOpen}
				onOpenChange={handlePopupOpenChange}
			>
				<div className={styles.popupContent}>
					<div className="stack horizontal justify-between">
						{/** xxx: translate */}
						<span className="font-bold text-md">Editing tier</span>
					</div>
					<div className="stack md">
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className={styles.nameInput}
							maxLength={10}
						/>
						<input
							type="color"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className="plain"
						/>
					</div>
					<div className="stack horizontal justify-between">
						<SendouButton onPress={handleSaveEdit}>
							{t("common:actions.save")}
						</SendouButton>
						<SendouButton
							onPress={handleDelete}
							variant="minimal-destructive"
							icon={<TrashIcon />}
						/>
					</div>
				</div>
			</SendouPopover>

			<div
				ref={setNodeRef}
				className={clsx(styles.weaponZone, {
					// xxx: probably makes no sense? text better?
					[styles.weaponZoneOver]: isOver,
				})}
			>
				{items.length === 0 ? (
					<div className={styles.emptyMessage}>
						{t("tier-list-maker:dropItems")}
					</div>
				) : (
					<SortableContext
						items={items.map((item) => `${item.type}:${item.id}`)}
						strategy={horizontalListSortingStrategy}
					>
						{items.map((item) => (
							<DraggableItem key={`${item.type}:${item.id}`} item={item} />
						))}
					</SortableContext>
				)}
			</div>
		</div>
	);
}
