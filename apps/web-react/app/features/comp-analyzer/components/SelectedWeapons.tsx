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
import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	abilityImageUrl,
	specialWeaponImageUrl,
	subWeaponImageUrl,
} from "~/utils/urls";
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

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = selectedWeaponIds.indexOf(active.id as MainWeaponId);
			const newIndex = selectedWeaponIds.indexOf(over.id as MainWeaponId);

			const newIds = [...selectedWeaponIds];
			const [removed] = newIds.splice(oldIndex, 1);
			newIds.splice(newIndex, 0, removed);

			onReorder(newIds);
		}
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
					items={selectedWeaponIds}
					strategy={verticalListSortingStrategy}
				>
					{selectedWeaponIds.map((weaponId, index) => (
						<SortableWeaponRow
							key={weaponId}
							weaponId={weaponId}
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

interface SortableWeaponRowProps {
	weaponId: MainWeaponId;
	index: number;
	onRemove: (index: number) => void;
	showDragHandle: boolean;
}

function SortableWeaponRow({
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
	} = useSortable({ id: weaponId });

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
					<Image
						path={subWeaponImageUrl(params.subWeaponId)}
						alt={t(`weapons:SUB_${params.subWeaponId}`)}
						size={24}
					/>
				</div>
				<div className={styles.kitIcon}>
					<Image
						path={specialWeaponImageUrl(params.specialWeaponId)}
						alt={t(`weapons:SPECIAL_${params.specialWeaponId}`)}
						size={24}
					/>
				</div>
			</div>
		</div>
	);
}
