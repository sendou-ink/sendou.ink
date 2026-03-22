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
import { Star, Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
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
	name,
	label,
	bottomText,
	error,
	maxCount,
	disableSorting,
	disableFavorites,
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
		const newWeapon = {
			id: weaponId,
			isFavorite: false,
		};

		const newValue = [...value, newWeapon];

		if (disableSorting) {
			newValue.sort((a, b) => a.id - b.id);
		}

		onChange(newValue);
		onBlur(newValue);
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
		const newValue = value.filter((weapon) => weapon.id !== weaponId);
		onChange(newValue);
		onBlur(newValue);
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

	const weaponList = (
		<ul className={styles.list}>
			{value.map((weapon) =>
				disableSorting ? (
					<StaticWeaponItem
						key={weapon.id}
						weapon={weapon}
						showFavoriteToggle={!disableFavorites}
						onToggleFavorite={handleToggleFavorite}
						onRemove={handleRemove}
					/>
				) : (
					<SortableWeaponItem
						key={weapon.id}
						weapon={weapon}
						showFavoriteToggle={!disableFavorites}
						onToggleFavorite={handleToggleFavorite}
						onRemove={handleRemove}
					/>
				),
			)}
		</ul>
	);

	return (
		<FormFieldWrapper
			id={id}
			name={name}
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

			{value.length > 0 ? (
				disableSorting ? (
					weaponList
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={value.map((weapon) => weapon.id)}
							strategy={verticalListSortingStrategy}
						>
							{weaponList}
						</SortableContext>
					</DndContext>
				)
			) : null}
		</FormFieldWrapper>
	);
}

function StaticWeaponItem({
	weapon,
	showFavoriteToggle,
	onToggleFavorite,
	onRemove,
}: {
	weapon: WeaponPoolItem;
	showFavoriteToggle: boolean;
	onToggleFavorite: (id: MainWeaponId) => void;
	onRemove: (id: MainWeaponId) => void;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<li className={styles.item}>
			<WeaponImage
				weaponSplId={weapon.id}
				variant={
					showFavoriteToggle && weapon.isFavorite ? "badge-5-star" : "badge"
				}
				size={32}
				className={styles.weaponImage}
			/>
			<span className={styles.weaponName}>
				{t(`weapons:MAIN_${weapon.id}`)}
			</span>
			<div className={styles.actions}>
				{showFavoriteToggle ? (
					<SendouButton
						variant="minimal"
						size="small"
						icon={
							weapon.isFavorite ? (
								<Star className={styles.starIconFilled} fill="currentColor" />
							) : (
								<Star className={styles.starIconOutlined} />
							)
						}
						aria-label="Toggle favorite"
						onPress={() => onToggleFavorite(weapon.id)}
					/>
				) : null}
				<SendouButton
					variant="minimal-destructive"
					size="small"
					icon={<Trash />}
					aria-label="Delete"
					onPress={() => onRemove(weapon.id)}
				/>
			</div>
		</li>
	);
}

function SortableWeaponItem({
	weapon,
	showFavoriteToggle,
	onToggleFavorite,
	onRemove,
}: {
	weapon: WeaponPoolItem;
	showFavoriteToggle: boolean;
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
				variant={
					showFavoriteToggle && weapon.isFavorite ? "badge-5-star" : "badge"
				}
				size={32}
				className={styles.weaponImage}
			/>
			<span className={styles.weaponName}>
				{t(`weapons:MAIN_${weapon.id}`)}
			</span>
			<div className={styles.actions}>
				{showFavoriteToggle ? (
					<SendouButton
						variant="minimal"
						size="small"
						icon={
							weapon.isFavorite ? (
								<Star className={styles.starIconFilled} fill="currentColor" />
							) : (
								<Star className={styles.starIconOutlined} />
							)
						}
						aria-label="Toggle favorite"
						onPress={() => onToggleFavorite(weapon.id)}
					/>
				) : null}
				<SendouButton
					variant="minimal-destructive"
					size="small"
					icon={<Trash />}
					aria-label="Delete"
					onPress={() => onRemove(weapon.id)}
				/>
			</div>
		</li>
	);
}
