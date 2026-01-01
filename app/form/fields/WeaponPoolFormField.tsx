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
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
import { StarIcon } from "~/components/icons/Star";
import { StarFilledIcon } from "~/components/icons/StarFilled";
import { TrashIcon } from "~/components/icons/Trash";
import { WeaponSelect } from "~/components/WeaponSelect";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { FormFieldProps } from "../types";
import { FormFieldWrapper } from "./FormFieldWrapper";

import styles from "./WeaponPoolFormField.module.css";

export type WeaponPoolItem = {
	id: MainWeaponId;
	isFavorite: boolean;
};

type WeaponPoolFormFieldProps = FormFieldProps<"weapon-pool"> & {
	value: WeaponPoolItem[];
	onChange: (value: WeaponPoolItem[]) => void;
};

export function WeaponPoolFormField({
	label,
	name,
	bottomText,
	error,
	maxCount,
	value,
	onChange,
	onBlur,
}: WeaponPoolFormFieldProps) {
	const { t } = useTranslation(["forms"]);
	const id = React.useId();
	const isFull = value.length >= maxCount;

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const disabledWeaponIds = value.map((weapon) => weapon.id);

	const handleSelect = (weaponId: MainWeaponId) => {
		onChange([
			...value,
			{
				id: weaponId,
				isFavorite: false,
			},
		]);
		onBlur();
	};

	const handleToggleFavorite = (weaponId: MainWeaponId) => {
		onChange(
			value.map((weapon) =>
				weapon.id === weaponId
					? { ...weapon, isFavorite: !weapon.isFavorite }
					: weapon,
			),
		);
	};

	const handleRemove = (weaponId: MainWeaponId) => {
		onChange(value.filter((weapon) => weapon.id !== weaponId));
		onBlur();
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = value.findIndex((weapon) => weapon.id === active.id);
			const newIndex = value.findIndex((weapon) => weapon.id === over.id);

			const newValue = [...value];
			const [removed] = newValue.splice(oldIndex, 1);
			newValue.splice(newIndex, 0, removed);

			onChange(newValue);
		}
	};

	return (
		<FormFieldWrapper
			id={id}
			label={label}
			error={error}
			bottomText={bottomText}
		>
			<WeaponSelect
				key={value.length}
				onChange={(weaponId) => {
					if (weaponId !== null) {
						handleSelect(weaponId);
					}
				}}
				disabledWeaponIds={disabledWeaponIds}
				clearable
				isDisabled={isFull}
				placeholder={
					isFull ? t("forms:placeholders.weaponPoolFull") : undefined
				}
			/>
			<input type="hidden" name={name} value={JSON.stringify(value)} />

			{value.length > 0 ? (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={value.map((weapon) => weapon.id)}
						strategy={verticalListSortingStrategy}
					>
						<ul className={styles.list}>
							{value.map((weapon) => (
								<SortableWeaponItem
									key={weapon.id}
									weapon={weapon}
									onToggleFavorite={handleToggleFavorite}
									onRemove={handleRemove}
								/>
							))}
						</ul>
					</SortableContext>
				</DndContext>
			) : null}
		</FormFieldWrapper>
	);
}

function SortableWeaponItem({
	weapon,
	onToggleFavorite,
	onRemove,
}: {
	weapon: WeaponPoolItem;
	onToggleFavorite: (id: MainWeaponId) => void;
	onRemove: (id: MainWeaponId) => void;
}) {
	const { t } = useTranslation(["weapons"]);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: weapon.id });

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
			<WeaponImage
				weaponSplId={weapon.id}
				variant={weapon.isFavorite ? "badge-5-star" : "badge"}
				size={32}
			/>
			<span className={styles.weaponName}>
				{t(`weapons:MAIN_${weapon.id}`)}
			</span>
			<div className={styles.actions}>
				<SendouButton
					variant="minimal"
					size="small"
					icon={
						weapon.isFavorite ? (
							<StarFilledIcon className={styles.starIconFilled} />
						) : (
							<StarIcon className={styles.starIconOutlined} />
						)
					}
					aria-label="Toggle favorite"
					onPress={() => onToggleFavorite(weapon.id)}
				/>
				<SendouButton
					variant="minimal-destructive"
					size="small"
					icon={<TrashIcon />}
					aria-label="Delete"
					onPress={() => onRemove(weapon.id)}
				/>
			</div>
		</li>
	);
}
