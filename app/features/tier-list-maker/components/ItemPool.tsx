import { useDroppable } from "@dnd-kit/core";
import { useTierListState } from "../contexts/TierListContext";
import type { TierListItem } from "../tier-list-maker-schemas";
import { tierListItemId } from "../tier-list-maker-utils";
import { DraggableItem } from "./DraggableItem";
import styles from "./ItemPool.module.css";
import { TierListItemImage } from "./TierListItemImage";

export function ItemPool() {
	const { availableItems, placementMode, selectedTierId, handleAddItemToTier } =
		useTierListState();
	const { setNodeRef } = useDroppable({
		id: "item-pool",
	});

	return (
		<div ref={setNodeRef} className={styles.pool}>
			{availableItems.map((item) =>
				placementMode === "click" ? (
					<ClickableItem
						key={tierListItemId(item)}
						item={item}
						disabled={!selectedTierId}
						onClick={() =>
							selectedTierId && handleAddItemToTier(item, selectedTierId)
						}
					/>
				) : (
					<DraggableItem key={tierListItemId(item)} item={item} />
				),
			)}
		</div>
	);
}

function ClickableItem({
	item,
	onClick,
	disabled,
}: {
	item: TierListItem;
	onClick: () => void;
	disabled: boolean;
}) {
	return (
		<button
			type="button"
			data-item-id={tierListItemId(item)}
			className={styles.clickableItem}
			onClick={onClick}
			disabled={disabled}
		>
			<TierListItemImage item={item} />
		</button>
	);
}
