import { useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import { useTierListState } from "../contexts/TierListContext";
import { DraggableItem } from "./DraggableItem";
import styles from "./ItemPool.module.css";

export function ItemPool() {
	const { availableItems } = useTierListState();
	const { setNodeRef, isOver } = useDroppable({
		id: "item-pool",
	});

	return (
		<div
			ref={setNodeRef}
			className={clsx(styles.pool, {
				// xxx: the styling probably makes no sense? text better?
				[styles.poolOver]: isOver,
			})}
		>
			{availableItems.map((item) => (
				<DraggableItem key={`${item.type}:${item.id}`} item={item} />
			))}
		</div>
	);
}
