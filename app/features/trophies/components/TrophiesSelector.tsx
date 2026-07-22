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
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Trash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import styles from "./TrophiesSelector.module.css";
import { Trophy, TrophyContextProvider } from "./Trophy";
import type { TrophyDisplayProps } from "./TrophyDisplay";

type TrophyItem = TrophyDisplayProps["trophies"][number];

export function TrophiesSelector({
	options,
	selectedTrophies,
	onChange,
	onBlur,
	maxCount,
}: {
	options: TrophyDisplayProps["trophies"];
	selectedTrophies: number[];
	onChange: (newTrophies: number[]) => void;
	onBlur?: () => void;
	maxCount?: number;
}) {
	const { t } = useTranslation(["common"]);

	const selectedTrophiesInOrder = selectedTrophies
		.map((id) => options.find((trophy) => trophy.id === id))
		.filter((trophy): trophy is TrophyItem => trophy !== undefined);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleRemove = (trophyId: number) => {
		onChange(selectedTrophies.filter((id) => id !== trophyId));
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = selectedTrophies.indexOf(active.id as number);
		const newIndex = selectedTrophies.indexOf(over.id as number);
		if (oldIndex === -1 || newIndex === -1) return;

		const newOrder = [...selectedTrophies];
		const [removed] = newOrder.splice(oldIndex, 1);
		newOrder.splice(newIndex, 0, removed);
		onChange(newOrder);
	};

	return (
		<div className="stack md">
			{selectedTrophiesInOrder.length > 0 ? (
				<TrophyContextProvider>
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={selectedTrophiesInOrder.map((trophy) => trophy.id)}
							strategy={verticalListSortingStrategy}
						>
							<ul className={styles.list}>
								{selectedTrophiesInOrder.map((trophy) => (
									<SortableTrophyItem
										key={trophy.id}
										trophy={trophy}
										onRemove={handleRemove}
									/>
								))}
							</ul>
						</SortableContext>
					</DndContext>
				</TrophyContextProvider>
			) : (
				<div className="text-lighter text-md font-bold">
					{t("common:trophies.selector.none")}
				</div>
			)}
			{options.length === 0 ? (
				<div className="text-warning text-xs">
					{t("common:trophies.selector.noneAvailable")}
				</div>
			) : (
				<select
					onBlur={() => onBlur?.()}
					onChange={(e) =>
						onChange([...selectedTrophies, Number(e.target.value)])
					}
					disabled={Boolean(maxCount && selectedTrophies.length >= maxCount)}
					data-testid="trophies-selector"
				>
					<option>{t("common:trophies.selector.select")}</option>
					{options
						.filter((trophy) => !selectedTrophies.includes(trophy.id))
						.map((trophy) => (
							<option key={trophy.id} value={trophy.id}>
								{trophy.name}
							</option>
						))}
				</select>
			)}
		</div>
	);
}

function SortableTrophyItem({
	trophy,
	onRemove,
}: {
	trophy: TrophyItem;
	onRemove: (id: number) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: trophy.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<li
			ref={setNodeRef}
			style={style}
			className={clsx(styles.item, { [styles.isDragging]: isDragging })}
			{...attributes}
		>
			<button
				type="button"
				className={styles.dragHandle}
				aria-label="Drag to reorder"
				{...listeners}
			>
				☰
			</button>
			<div className={styles.preview}>
				<Trophy model={trophy.model} preview />
			</div>
			<span className={styles.name}>{trophy.name}</span>
			<SendouButton
				variant="minimal-destructive"
				size="small"
				icon={<Trash />}
				aria-label="Remove"
				onPress={() => onRemove(trophy.id)}
			/>
		</li>
	);
}
