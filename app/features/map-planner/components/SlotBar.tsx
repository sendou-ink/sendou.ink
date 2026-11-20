import clsx from "clsx";
import { ChevronsUp, EyeOff, Plus, Waves, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouPopover } from "~/components/elements/Popover";
import { SpecialWeaponImage, WeaponImage } from "~/components/Image";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import { useLatestRef } from "~/hooks/useLatestRef";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as LongPress from "../canvas/LongPress";
import * as PlanCommands from "../core/PlanCommands";
import {
	PLAYER_LABEL_MAX_LENGTH,
	type PlanDocument,
	type PlanPlayer,
	type PlayerStatus,
	type Point,
	SLOTS_PER_TEAM,
	type SlotIndex,
	type TeamIndex,
} from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import styles from "./SlotBar.module.css";
import { WeaponPicker } from "./WeaponPicker";

const TEAMS: TeamIndex[] = [0, 1];

/** The house shape of a slot, in pixels of its 3.5rem × 4rem box, inset so the thickest outline fits. */
const SLOT_SHAPE = {
	width: 56,
	height: 64,
	inset: 1.5,
	cornerRadius: 5,
	/** Where the sloped roof meets the walls. */
	eavesY: 16,
};
/** Roof and eaves rounded, the bottom corners sharp where the team bar runs. */
const SLOT_OUTLINE_PATH = roundedPolygonPath([
	{
		corner: [SLOT_SHAPE.width / 2, SLOT_SHAPE.inset],
		radius: SLOT_SHAPE.cornerRadius,
	},
	{
		corner: [SLOT_SHAPE.width - SLOT_SHAPE.inset, SLOT_SHAPE.eavesY],
		radius: SLOT_SHAPE.cornerRadius,
	},
	{
		corner: [
			SLOT_SHAPE.width - SLOT_SHAPE.inset,
			SLOT_SHAPE.height - SLOT_SHAPE.inset,
		],
		radius: 0,
	},
	{
		corner: [SLOT_SHAPE.inset, SLOT_SHAPE.height - SLOT_SHAPE.inset],
		radius: 0,
	},
	{
		corner: [SLOT_SHAPE.inset, SLOT_SHAPE.eavesY],
		radius: SLOT_SHAPE.cornerRadius,
	},
]);
const SLOT_TEAM_BAR_PATH = `M 0 ${SLOT_SHAPE.height - SLOT_SHAPE.inset} H ${SLOT_SHAPE.width}`;

/** Statuses shown as a badge, dead players are greyed and crossed out instead. */
const STATUS_BADGE_ICONS: Record<
	Exclude<PlayerStatus, "normal" | "dead">,
	React.ComponentType<{ className?: string }>
> = {
	sharking: Waves,
	jumping: ChevronsUp,
};

/**
 * The eight player slots, team A's four on the left and team B's on the right. An empty slot
 * opens the weapon picker; a filled one shows the player, a click puts its token on the map, a
 * double click opens the picker to switch the weapon and a right click or long press opens the
 * player's context menu.
 */
export function SlotBar({
	editor,
	document,
	selection,
	pickerSlot,
	onPickerSlotChange,
	onPlayerClick,
	onPlayerContextMenu,
	onWeaponDragOut,
	className,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	selection: PlanSelection.PlanSelection;
	/** The slot whose weapon picker is open. */
	pickerSlot: SlotIndex | null;
	onPickerSlotChange: (slot: SlotIndex | null) => void;
	/** A filled slot was clicked: its token should go on the map and be selected. */
	onPlayerClick: (slot: SlotIndex) => void;
	/** A filled slot was right clicked or long pressed at a point of the page. */
	onPlayerContextMenu: (slot: SlotIndex, clientPoint: Point) => void;
	/** A weapon is being dragged out of the slot's weapon picker, to be carried onto the map. */
	onWeaponDragOut: (
		slot: SlotIndex,
		weaponId: MainWeaponId,
		clientPoint: Point,
	) => void;
	className?: string;
}) {
	const selectedSlot = React.useSyncExternalStore(
		selection.subscribe,
		() => PlanSelection.selectedSlot(selection.get()),
		() => null,
	);
	const pickWeapon = (slot: SlotIndex, weaponId: MainWeaponId) => {
		editor.apply(PlanCommands.setWeapon(editor.getDocument(), slot, weaponId));
		onPickerSlotChange(null);
		selection.set({ type: "player", slot });
	};

	return (
		<div className={clsx(styles.slotBar, className)}>
			{TEAMS.map((team) => (
				<div
					key={team}
					className={styles.team}
					style={{ "--team-color": document.teams[team].color }}
				>
					{R.range(0, SLOTS_PER_TEAM).map((index) => {
						const slot = (team * SLOTS_PER_TEAM + index) as SlotIndex;
						const player = document.slots[slot];

						return (
							<SendouPopover
								key={slot}
								isOpen={pickerSlot === slot}
								onOpenChange={(isOpen) => {
									if (isOpen) onPickerSlotChange(slot);
									else if (pickerSlot === slot) onPickerSlotChange(null);
								}}
								placement="bottom"
								popoverClassName={styles.pickerPopover}
								trigger={
									<div className={styles.column}>
										{player ? (
											<FilledSlot
												slot={slot}
												player={player}
												isSelected={selectedSlot === slot}
												onClick={() => onPlayerClick(slot)}
												onDoubleClick={() => onPickerSlotChange(slot)}
												onContextMenu={(clientPoint) => {
													selection.set({ type: "player", slot });
													onPlayerContextMenu(slot, clientPoint);
												}}
												onRemove={() => {
													editor.apply(
														PlanCommands.emptySlot(editor.getDocument(), slot),
													);
													if (selectedSlot === slot) selection.set(null);
												}}
												onLabelChange={(label) =>
													editor.apply({
														type: "updatePlayer",
														slot,
														patch: { label },
													})
												}
											/>
										) : (
											<EmptySlot
												slot={slot}
												onClick={() => onPickerSlotChange(slot)}
											/>
										)}
									</div>
								}
							>
								<WeaponPicker
									currentWeaponId={player?.weaponId}
									onPick={(weaponId) => pickWeapon(slot, weaponId)}
									onWeaponDragStart={(weaponId, clientPoint) => {
										onWeaponDragOut(slot, weaponId, clientPoint);
										onPickerSlotChange(null);
									}}
								/>
							</SendouPopover>
						);
					})}
				</div>
			))}
		</div>
	);
}

function EmptySlot({
	slot,
	onClick,
}: {
	slot: SlotIndex;
	onClick: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<>
			<div className={styles.frame}>
				<button
					type="button"
					className={styles.slot}
					onClick={onClick}
					aria-label={t("common:plans.addPlayer")}
					title={t("common:plans.addPlayer")}
					data-testid={`plan-slot-${slot}`}
				>
					<SlotShape />
					<Plus className={styles.addIcon} />
				</button>
			</div>
			<span className={styles.label} />
		</>
	);
}

function FilledSlot({
	slot,
	player,
	isSelected,
	onClick,
	onDoubleClick,
	onContextMenu,
	onRemove,
	onLabelChange,
}: {
	slot: SlotIndex;
	player: PlanPlayer;
	isSelected: boolean;
	onClick: () => void;
	/** Opens the weapon picker to switch the weapon. */
	onDoubleClick: () => void;
	onContextMenu: (clientPoint: Point) => void;
	onRemove: () => void;
	onLabelChange: (label: string) => void;
}) {
	const { t } = useTranslation(["common"]);
	const onContextMenuRef = useLatestRef(onContextMenu);
	const [longPress] = React.useState(() =>
		LongPress.create((clientPoint) => onContextMenuRef.current(clientPoint)),
	);
	const isOnMap = player.position !== null && !player.hidden;
	const badgeStatus =
		player.status === "sharking" || player.status === "jumping"
			? player.status
			: null;

	return (
		<>
			<div className={styles.frame}>
				<button
					type="button"
					className={styles.slot}
					aria-pressed={isSelected}
					data-status={player.status}
					data-on-map={isOnMap}
					onClick={() => {
						if (!longPress.didFire()) onClick();
					}}
					onDoubleClick={onDoubleClick}
					onContextMenu={(event) => {
						event.preventDefault();
						onContextMenu([event.clientX, event.clientY]);
					}}
					onPointerDown={(event) => longPress.pointerDown(event.nativeEvent)}
					onPointerMove={(event) => longPress.pointerMove(event.nativeEvent)}
					onPointerUp={longPress.cancel}
					onPointerCancel={longPress.cancel}
					data-testid={`plan-slot-${slot}`}
				>
					<SlotShape />
					{player.specialActive ? (
						<span className={styles.inSpecial}>
							<SpecialWeaponImage
								specialWeaponId={
									mainWeaponParams(player.weaponId).specialWeaponId
								}
								size={36}
							/>
							<WeaponImage
								weaponSplId={player.weaponId}
								variant="badge"
								size={22}
								className={styles.specialWeaponBadge}
							/>
						</span>
					) : (
						<WeaponImage
							weaponSplId={player.weaponId}
							variant="badge"
							size={40}
						/>
					)}
					{player.status === "dead" ? (
						<X
							className={styles.deadCross}
							aria-label={t("common:plans.status.dead")}
						/>
					) : null}
				</button>
				{badgeStatus ? (
					<StatusBadge
						status={badgeStatus}
						title={t(`common:plans.status.${badgeStatus}`)}
					/>
				) : null}
				{player.hidden ? (
					<span
						className={clsx(styles.badge, styles.hiddenBadge)}
						title={t("common:plans.hidden")}
					>
						<EyeOff className={styles.badgeIcon} />
					</span>
				) : null}
				<button
					type="button"
					className={styles.removeButton}
					onClick={onRemove}
					aria-label={t("common:plans.removePlayer")}
					title={t("common:plans.removePlayer")}
					data-testid={`plan-slot-${slot}-remove`}
				>
					<X />
				</button>
			</div>
			<input
				key={player.label}
				className={styles.label}
				defaultValue={player.label}
				maxLength={PLAYER_LABEL_MAX_LENGTH}
				placeholder={t("common:plans.playerLabel")}
				aria-label={t("common:plans.playerLabel")}
				onBlur={(event) => {
					const label = event.currentTarget.value.trim();
					if (label !== player.label) onLabelChange(label);
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.currentTarget.value = player.label;
					}
					if (event.key === "Enter" || event.key === "Escape") {
						event.currentTarget.blur();
					}
				}}
				data-testid={`plan-slot-${slot}-label`}
			/>
		</>
	);
}

function StatusBadge({
	status,
	title,
}: {
	status: keyof typeof STATUS_BADGE_ICONS;
	title: string;
}) {
	const Icon = STATUS_BADGE_ICONS[status];

	return (
		<span className={styles.badge} title={title}>
			<Icon className={styles.badgeIcon} />
		</span>
	);
}

function SlotShape() {
	return (
		<svg
			className={styles.slotShape}
			viewBox={`0 0 ${SLOT_SHAPE.width} ${SLOT_SHAPE.height}`}
			aria-hidden
		>
			<path className={styles.slotOutline} d={SLOT_OUTLINE_PATH} />
			<path className={styles.slotTeamBar} d={SLOT_TEAM_BAR_PATH} />
		</svg>
	);
}

/** An SVG path around the corners, each rounded off by a curve starting `radius` before it. */
function roundedPolygonPath(
	corners: Array<{ corner: [number, number]; radius: number }>,
) {
	const segments = corners.map(({ corner, radius }, index) => {
		const previous = corners.at(index - 1)!.corner;
		const next = corners[(index + 1) % corners.length].corner;
		const from = towards(corner, previous, radius);
		const to = towards(corner, next, radius);
		return `${index === 0 ? "M" : "L"} ${from} Q ${corner.join(" ")} ${to}`;
	});

	return `${segments.join(" ")} Z`;
}

function towards(
	[x, y]: [number, number],
	[targetX, targetY]: [number, number],
	distance: number,
) {
	const length = Math.hypot(targetX - x, targetY - y);
	const round = (value: number) => Number(value.toFixed(2));

	return `${round(x + ((targetX - x) / length) * distance)} ${round(y + ((targetY - y) / length) * distance)}`;
}
