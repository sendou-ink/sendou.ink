import type { DragEndEvent } from "@dnd-kit/core";
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Trash } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import type { CustomFieldRenderProps } from "~/form/FormField";
import {
	GAME_BADGE_IDS,
	type GameBadgeId,
} from "~/modules/in-game-lists/game-badge-ids";
import { gameBadgeUrl } from "~/utils/urls";
import styles from "./GameBadgeSelectField.module.css";

const MIN_SEARCH_LENGTH = 2;

export function GameBadgeSelectField({
	value,
	onChange,
	maxCount,
}: CustomFieldRenderProps<string[]> & { maxCount: number }) {
	const { t } = useTranslation(["user", "game-badges"]);
	const [search, setSearch] = useState("");

	const selectedIds = value ?? [];

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const filteredBadges =
		search.length >= MIN_SEARCH_LENGTH
			? GAME_BADGE_IDS.filter(
					(id) =>
						t(`game-badges:${id}`)
							.toLowerCase()
							.includes(search.toLowerCase()) && !selectedIds.includes(id),
				)
			: [];

	const handleAdd = (id: string) => {
		if (selectedIds.length >= maxCount) return;
		if (selectedIds.includes(id)) return;
		onChange([...selectedIds, id]);
	};

	const handleRemove = (id: string) => {
		onChange(selectedIds.filter((selectedId) => selectedId !== id));
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = selectedIds.indexOf(active.id as string);
		const newIndex = selectedIds.indexOf(over.id as string);
		if (oldIndex === -1 || newIndex === -1) return;

		const newIds = [...selectedIds];
		const [removed] = newIds.splice(oldIndex, 1);
		newIds.splice(newIndex, 0, removed);

		onChange(newIds);
	};

	return (
		<div className={styles.container}>
			<div>
				<label>{t("user:widgets.forms.gameBadges")}</label>
				<div className={styles.selectedBadges}>
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext items={selectedIds} strategy={rectSortingStrategy}>
							{selectedIds.map((id) => (
								<SortableSelectedBadge
									key={id}
									id={id as GameBadgeId}
									onRemove={handleRemove}
								/>
							))}
						</SortableContext>
					</DndContext>
					<span className={styles.count}>
						{selectedIds.length}/{maxCount}
					</span>
				</div>
			</div>

			<input
				type="text"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder={t("user:widgets.forms.gameBadgesSearch")}
				className={styles.searchInput}
			/>

			{filteredBadges.length > 0 ? (
				<div className={styles.resultsGrid}>
					{filteredBadges.map((id) => (
						<button
							key={id}
							type="button"
							className={styles.badgeButton}
							onClick={() => handleAdd(id)}
							title={t(`game-badges:${id}`)}
						>
							<img
								src={gameBadgeUrl(id)}
								alt={t(`game-badges:${id}`)}
								className={styles.badgeImage}
							/>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function SortableSelectedBadge({
	id,
	onRemove,
}: {
	id: GameBadgeId;
	onRemove: (id: string) => void;
}) {
	const { t } = useTranslation(["common", "game-badges"]);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const name = t(`game-badges:${id}`);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={clsx(styles.selectedBadge, {
				[styles.isDragging]: isDragging,
			})}
		>
			<button
				type="button"
				className={clsx(styles.badgeButton, styles.dragButton)}
				title={name}
				aria-label={`${name} (drag to reorder)`}
				{...attributes}
				{...listeners}
			>
				<img src={gameBadgeUrl(id)} alt="" className={styles.badgeImage} />
			</button>
			<SendouButton
				variant="minimal-destructive"
				size="miniscule"
				shape="circle"
				icon={<Trash />}
				aria-label={`${t("common:actions.remove")} ${name}`}
				onClick={() => onRemove(id)}
			/>
		</div>
	);
}
