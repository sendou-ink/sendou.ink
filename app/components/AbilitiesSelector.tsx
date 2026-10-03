import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	MouseSensor,
	pointerWithin,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import clsx from "clsx";
import {
	HatGlasses,
	Layers,
	type LucideIcon,
	Shirt,
	SportShoe,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability as AbilityName,
	AbilityType,
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
} from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import styles from "./AbilitiesSelector.module.css";
import { Ability } from "./Ability";
import * as AbilitySlots from "./AbilitySlots";
import { Image } from "./Image";

const SLOTS_DROPPABLE_ID = "slots";
const PREVIEW_SHOW_DELAY_MS = 150;
const PREVIEW_HIDE_DELAY_MS = 100;

const PALETTE_GROUPS: PaletteGroup[] = [
	{ type: "STACKABLE", label: "Stackable abilities", Icon: Layers },
	{
		type: "HEAD_MAIN_ONLY",
		label: "Headgear-only abilities",
		Icon: HatGlasses,
	},
	{ type: "CLOTHES_MAIN_ONLY", label: "Clothing-only abilities", Icon: Shirt },
	{ type: "SHOES_MAIN_ONLY", label: "Shoes-only abilities", Icon: SportShoe },
];

interface PaletteGroup {
	type: AbilityType;
	label: string;
	Icon: LucideIcon;
}

interface DragData {
	ability: AbilityName;
	from?: AbilitySlots.Slot;
}

interface AbilitiesSelectorProps {
	selectedAbilities: BuildAbilitiesTupleWithUnknown;
	onChange: (newAbilities: BuildAbilitiesTupleWithUnknown) => void;
}

export function AbilitiesSelector({
	selectedAbilities,
	onChange,
}: AbilitiesSelectorProps) {
	const [, startTransition] = React.useTransition();
	const [dragging, setDragging] = React.useState<DragData | null>(null);
	const [dropRemoves, setDropRemoves] = React.useState(false);
	const [previewAbility, setPreviewAbility] =
		React.useState<AbilityName | null>(null);
	const previewTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(null);
	const suppressClickRef = React.useRef(false);

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
	);

	const previewSlot =
		!dragging && previewAbility
			? AbilitySlots.firstEmptyValidSlot(selectedAbilities, previewAbility)
			: null;

	const isAllowedAt = (slot: AbilitySlots.Slot) => {
		if (dragging?.from) {
			return AbilitySlots.canMove(selectedAbilities, dragging.from, slot);
		}

		const ability = dragging?.ability ?? previewAbility;
		return !ability || AbilitySlots.canPlaceAt(ability, slot);
	};

	// switching between abilities is instant, only showing and hiding the preview is delayed
	const schedulePreview = (
		ability: AbilityName | null,
		{ immediate = false } = {},
	) => {
		if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);

		if (immediate || (ability && previewAbility)) {
			setPreviewAbility(ability);
			return;
		}

		previewTimeoutRef.current = setTimeout(
			() => setPreviewAbility(ability),
			ability ? PREVIEW_SHOW_DELAY_MS : PREVIEW_HIDE_DELAY_MS,
		);
	};

	const handleSlotClick = (slot: AbilitySlots.Slot) => {
		if (suppressClickRef.current) return;

		onChange(AbilitySlots.remove(selectedAbilities, slot));
	};

	const handlePaletteClick = (ability: AbilityName) => {
		if (suppressClickRef.current) return;

		startTransition(() => {
			onChange(AbilitySlots.add(selectedAbilities, ability));
		});
	};

	const handleDragStart = (event: DragStartEvent) => {
		setDragging(event.active.data.current as DragData);
		schedulePreview(null, { immediate: true });
	};

	const handleDragOver = (event: DragOverEvent) => {
		const data = event.active.data.current as DragData;
		setDropRemoves(Boolean(data.from) && !event.over);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const data = event.active.data.current as DragData;
		const targetSlot = event.over?.data.current?.slot as
			| AbilitySlots.Slot
			| undefined;

		stopDragging();

		if (targetSlot) {
			onChange(
				data.from
					? AbilitySlots.move(selectedAbilities, data.from, targetSlot)
					: AbilitySlots.placeAt(selectedAbilities, data.ability, targetSlot),
			);
		} else if (data.from && !event.over) {
			onChange(AbilitySlots.remove(selectedAbilities, data.from));
		}
	};

	// the pointer release that ends a drag also fires a click on the dragged element
	const stopDragging = () => {
		setDragging(null);
		setDropRemoves(false);
		suppressClickRef.current = true;
		setTimeout(() => {
			suppressClickRef.current = false;
		});
	};

	const renderPaletteGroup = (group: PaletteGroup) => (
		<fieldset
			key={group.type}
			aria-label={group.label}
			className={styles.paletteGroup}
		>
			<span aria-hidden className={styles.rowMarker}>
				<group.Icon size={22} strokeWidth={2.5} />
			</span>
			{abilities
				.filter((ability) => ability.type === group.type)
				.map((ability) => (
					<PaletteButton
						key={ability.name}
						ability={ability.name}
						isUnplaceable={
							!AbilitySlots.firstEmptyValidSlot(selectedAbilities, ability.name)
						}
						isDragging={!dragging?.from && dragging?.ability === ability.name}
						onClick={() => handlePaletteClick(ability.name)}
						onPreviewChange={(isPreviewing) =>
							schedulePreview(isPreviewing ? ability.name : null)
						}
					/>
				))}
		</fieldset>
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={slotsFirstCollisionDetection}
			autoScroll={false}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={stopDragging}
		>
			<div className={styles.container} data-testid="ability-selector">
				<SlotGrid>
					{selectedAbilities.map((row, rowI) =>
						row.map((ability, abilityI) => {
							const slot = { rowI, abilityI };

							return (
								<AbilitySlot
									key={`${rowI}-${abilityI}`}
									slot={slot}
									ability={ability}
									isDragging={Boolean(dragging)}
									isDragSource={
										dragging?.from ? isSameSlot(dragging.from, slot) : false
									}
									isAllowed={isAllowedAt(slot)}
									ghostAbility={
										previewAbility &&
										previewSlot &&
										isSameSlot(previewSlot, slot)
											? previewAbility
											: null
									}
									onClick={() => handleSlotClick(slot)}
								/>
							);
						}),
					)}
				</SlotGrid>
				<div className={styles.palette}>
					{PALETTE_GROUPS.map(renderPaletteGroup)}
				</div>
			</div>
			<DragOverlay dropAnimation={null}>
				{dragging ? (
					<div
						className={clsx(styles.dragOverlay, {
							[styles.dropRemoves]: dropRemoves,
						})}
					>
						<Ability ability={dragging.ability} size="SUB" />
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

function SlotGrid({ children }: { children: React.ReactNode }) {
	const { setNodeRef } = useDroppable({ id: SLOTS_DROPPABLE_ID });

	return (
		<div ref={setNodeRef} className={styles.slots}>
			{children}
		</div>
	);
}

function AbilitySlot({
	slot,
	ability,
	isDragging,
	isDragSource,
	isAllowed,
	ghostAbility,
	onClick,
}: {
	slot: AbilitySlots.Slot;
	ability: AbilityWithUnknown;
	isDragging: boolean;
	isDragSource: boolean;
	isAllowed: boolean;
	ghostAbility: AbilityName | null;
	onClick: () => void;
}) {
	const slotKey = `${slot.rowI}-${slot.abilityI}`;
	const droppable = useDroppable({
		id: `slot-drop-${slotKey}`,
		data: { slot },
		disabled: !isAllowed,
	});
	const draggable = useDraggable({
		id: `slot-drag-${slotKey}`,
		data: { ability, from: slot },
		disabled: ability === "UNKNOWN",
	});

	return (
		<div
			ref={(node) => {
				droppable.setNodeRef(node);
				draggable.setNodeRef(node);
			}}
			className={clsx(styles.slot, {
				[styles.draggable]: ability !== "UNKNOWN",
				[styles.dimmed]: !isAllowed,
				[styles.dragSource]: isDragSource,
				[styles.highlighted]: isDragging && droppable.isOver,
			})}
			{...draggable.listeners}
		>
			<Ability
				ability={ability}
				size={slot.abilityI === 0 ? "MAIN" : "SUB"}
				onClick={onClick}
			/>
			{ghostAbility ? (
				<Image
					alt=""
					path={abilityImageUrl(ghostAbility)}
					containerClassName={styles.ghost}
				/>
			) : null}
		</div>
	);
}

function PaletteButton({
	ability,
	isUnplaceable,
	isDragging,
	onClick,
	onPreviewChange,
}: {
	ability: AbilityName;
	isUnplaceable: boolean;
	isDragging: boolean;
	onClick: () => void;
	onPreviewChange: (isPreviewing: boolean) => void;
}) {
	const { t } = useTranslation(["game-misc"]);
	const { setNodeRef, listeners } = useDraggable({
		id: `palette-${ability}`,
		data: { ability } satisfies DragData,
	});

	const name = t(`game-misc:ABILITY_${ability}`);

	return (
		<button
			ref={setNodeRef}
			className={clsx(styles.abilityButton, {
				[styles.isDragging]: isDragging,
				[styles.unplaceable]: isUnplaceable,
			})}
			type="button"
			aria-label={name}
			aria-disabled={isUnplaceable || undefined}
			title={name}
			onClick={isUnplaceable ? undefined : onClick}
			onPointerEnter={(event) => {
				if (event.pointerType === "mouse") onPreviewChange(true);
			}}
			onPointerLeave={() => onPreviewChange(false)}
			onFocus={(event) => {
				if (event.currentTarget.matches(":focus-visible")) {
					onPreviewChange(true);
				}
			}}
			onBlur={() => onPreviewChange(false)}
			data-testid={`${ability}-ability-button`}
			{...listeners}
		>
			<Image alt="" path={abilityImageUrl(ability)} width={32} height={32} />
		</button>
	);
}

const slotsFirstCollisionDetection: CollisionDetection = (args) => {
	const collisions = pointerWithin(args);
	const slotCollision = collisions.find(
		(collision) => collision.id !== SLOTS_DROPPABLE_ID,
	);

	return slotCollision ? [slotCollision] : collisions;
};

function isSameSlot(a: AbilitySlots.Slot, b: AbilitySlots.Slot) {
	return a.rowI === b.rowI && a.abilityI === b.abilityI;
}
