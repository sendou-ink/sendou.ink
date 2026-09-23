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
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { nanoid } from "nanoid";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Image,
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import { MAX_WEAPONS } from "../comp-analyzer-constants";
import styles from "./SelectedWeapons.module.css";

interface SelectedWeaponsProps {
	selectedWeaponIds: MainWeaponId[];
	onRemove: (index: number) => void;
	onReorder: (newIds: MainWeaponId[]) => void;
}

export function SelectedWeapons({
	selectedWeaponIds,
	onRemove,
	onReorder,
}: SelectedWeaponsProps) {
	const { t } = useTranslation(["weapons", "analyzer"]);
	const [rowsState, setRows] = useState(() =>
		reconcileRows([], selectedWeaponIds),
	);

	const rows = reconcileRows(rowsState, selectedWeaponIds);
	if (rows !== rowsState) {
		setRows(rows);
	}

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id) return;

		const oldIndex = rows.findIndex((row) => row.id === active.id);
		const newIndex = rows.findIndex((row) => row.id === over.id);

		if (oldIndex === -1 || newIndex === -1) return;

		const newRows = arrayMove(rows, oldIndex, newIndex);
		setRows(newRows);
		onReorder(newRows.map((row) => row.weaponId));
	};

	const emptySlotCount = MAX_WEAPONS - selectedWeaponIds.length;
	const showDragHandle = selectedWeaponIds.length > 1;

	return (
		<div className={styles.selectedWeapons} data-testid="selected-weapons">
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={rows.map((row) => row.id)}
					strategy={verticalListSortingStrategy}
				>
					{rows.map((row, index) => (
						<SortableWeaponRow
							key={row.id}
							rowId={row.id}
							weaponId={row.weaponId}
							index={index}
							onRemove={onRemove}
							showDragHandle={showDragHandle}
						/>
					))}
				</SortableContext>
			</DndContext>
			{Array.from({ length: emptySlotCount }, (_, i) => (
				<div key={`empty-${i}`} className={styles.selectedWeaponRow}>
					<div className={styles.weaponImageContainerEmpty}>
						<Image path={abilityImageUrl("UNKNOWN")} alt="" size={48} />
					</div>
					<div className={styles.weaponNamePillEmpty}>
						<span className={styles.weaponNameEmpty}>
							{t("analyzer:comp.pickWeapon")}
						</span>
					</div>
					<div className={styles.subSpecialContainerSpacer} />
				</div>
			))}
		</div>
	);
}

interface WeaponRow {
	/** Identity of the slot rather than of the weapon, so rows of the same weapon stay apart while dragging */
	id: string;
	weaponId: MainWeaponId;
}

/** Returns the same rows when they already match, so a reorder of identical weapons is not undone */
function reconcileRows(
	rows: WeaponRow[],
	weaponIds: MainWeaponId[],
): WeaponRow[] {
	const alreadyMatching =
		rows.length === weaponIds.length &&
		rows.every((row, index) => row.weaponId === weaponIds[index]);
	if (alreadyMatching) return rows;

	const unclaimed = [...rows];

	return weaponIds.map((weaponId) => {
		const matchIndex = unclaimed.findIndex((row) => row.weaponId === weaponId);
		if (matchIndex === -1) {
			return { id: nanoid(), weaponId };
		}

		return unclaimed.splice(matchIndex, 1)[0];
	});
}

interface SortableWeaponRowProps {
	rowId: string;
	weaponId: MainWeaponId;
	index: number;
	onRemove: (index: number) => void;
	showDragHandle: boolean;
}

function SortableWeaponRow({
	rowId,
	weaponId,
	index,
	onRemove,
	showDragHandle,
}: SortableWeaponRowProps) {
	const { t } = useTranslation(["weapons", "analyzer"]);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: rowId });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const params = mainWeaponParams(weaponId);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={clsx(styles.selectedWeaponRow, {
				[styles.isDragging]: isDragging,
			})}
			data-testid={`selected-weapon-${index}`}
			{...attributes}
		>
			<div className={styles.weaponImageContainer}>
				<WeaponImage weaponSplId={weaponId} variant="build" size={48} />
			</div>
			<div className={styles.weaponNamePill}>
				<span className={styles.weaponName}>
					{t(`weapons:MAIN_${weaponId}`)}
				</span>
				{showDragHandle ? (
					<button
						type="button"
						className={styles.dragHandle}
						aria-label={t("analyzer:comp.reorderWeapon")}
						{...listeners}
					>
						☰
					</button>
				) : null}
				<button
					type="button"
					className={styles.removeButton}
					onClick={() => onRemove(index)}
					aria-label={t("analyzer:comp.removeWeapon")}
					data-testid={`remove-weapon-${index}`}
				>
					&times;
				</button>
			</div>
			<div className={styles.subSpecialContainer}>
				<div className={styles.kitIcon}>
					<SubWeaponImage subWeaponId={params.subWeaponId} size={24} />
				</div>
				<div className={styles.kitIcon}>
					<SpecialWeaponImage
						specialWeaponId={params.specialWeaponId}
						size={24}
					/>
				</div>
			</div>
		</div>
	);
}
