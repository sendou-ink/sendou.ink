import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TierListItem } from "../tier-list-maker-schemas";
import { tierListItemId } from "../tier-list-maker-utils";
import styles from "./DraggableItem.module.css";
import { TierListItemImage } from "./TierListItemImage";

interface DraggableItemProps {
	item: TierListItem;
	forcePng?: boolean;
}

export function DraggableItem({ item, forcePng }: DraggableItemProps) {
	const uniqueId = tierListItemId(item);

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
				<TierListItemImage item={item} forcePng={forcePng} />
			</div>
		</div>
	);
}
