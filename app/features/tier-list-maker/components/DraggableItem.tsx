import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TierListItem } from "../tier-list-maker-schemas";
import styles from "./DraggableItem.module.css";
import { TierListItemImage } from "./TierListItemImage";

interface DraggableItemProps {
	item: TierListItem;
}

export function DraggableItem({ item }: DraggableItemProps) {
	// xxx: this is incorrect when we have the mode to add multiple of the same item
	const uniqueId = `${item.type}:${item.id}`;

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: uniqueId,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.3 : 1,
	};

	return (
		<div ref={setNodeRef} className={styles.item} style={style}>
			<div data-item-id={uniqueId} {...listeners} {...attributes}>
				<TierListItemImage item={item} />
			</div>
		</div>
	);
}
