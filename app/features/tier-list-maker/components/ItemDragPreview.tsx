import type { TierListItem } from "../tier-list-maker-types";
import styles from "./ItemDragPreview.module.css";
import { TierListItemImage } from "./TierListItemImage";

interface ItemDragPreviewProps {
	item: TierListItem;
}

export function ItemDragPreview({ item }: ItemDragPreviewProps) {
	return (
		<div className={styles.preview}>
			<TierListItemImage item={item} />
		</div>
	);
}
