import { useDroppable } from "@dnd-kit/core";
import { useTierListState } from "../contexts/TierListContext";
import * as DragIds from "../core/DragIds";
import type { TierListItem } from "../tier-list-maker-schemas";
import { DraggableItem } from "./DraggableItem";
import styles from "./ItemPool.module.css";
import { TierListItemImage } from "./TierListItemImage";

export function ItemPool() {
	const { availableItems, placementMode, selectedTierId, handleAddItemToTier } =
		useTierListState();
	const { setNodeRef } = useDroppable({
		id: DragIds.POOL_ID,
	});

	return (
		<div ref={setNodeRef} className={styles.pool}>
			{availableItems.map((item) =>
				placementMode === "click" ? (
					<ClickableItem
						key={DragIds.itemId(item)}
						item={item}
						disabled={!selectedTierId}
						onClick={() =>
							selectedTierId && handleAddItemToTier(item, selectedTierId)
						}
					/>
				) : (
					<DraggableItem key={DragIds.itemId(item)} item={item} />
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
			data-item-id={DragIds.itemId(item)}
			className={styles.clickableItem}
			onClick={onClick}
			disabled={disabled}
		>
			<TierListItemImage item={item} />
		</button>
	);
}
