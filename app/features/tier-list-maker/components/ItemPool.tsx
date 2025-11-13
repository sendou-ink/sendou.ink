import { useDroppable } from "@dnd-kit/core";
import { useTierListState } from "../contexts/TierListContext";
import { DraggableItem } from "./DraggableItem";
import styles from "./ItemPool.module.css";

export function ItemPool() {
	const { availableItems } = useTierListState();
	const { setNodeRef } = useDroppable({
		id: "item-pool",
	});

	return (
		<div ref={setNodeRef} className={styles.pool}>
			{availableItems.map((item) => (
				<DraggableItem key={`${item.type}:${item.id}`} item={item} />
			))}
		</div>
	);
}
