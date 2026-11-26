import {
	ArrowLeftRight,
	BringToFront,
	ChevronsUp,
	Eye,
	EyeOff,
	Radius,
	Repeat,
	SendToBack,
	Trash2,
	User,
	Waves,
	X,
} from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import {
	SendouContextMenu,
	SendouMenuItem,
	SendouMenuSection,
} from "~/components/elements/Menu";
import { SpecialWeaponImage, SubWeaponImage } from "~/components/Image";
import type { ContextMenuTarget } from "../canvas/PlanCanvas";
import * as PlanCommands from "../core/PlanCommands";
import {
	PLAYER_STATUSES,
	type PlanDocument,
	type PlayerStatus,
	type Point,
	type SlotIndex,
} from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanKit from "../core/PlanKit";
import type { PlanOperation } from "../core/PlanOperation";

const ITEM_IMAGE_SIZE = 18;

const STATUS_ICONS: Record<PlayerStatus, React.ComponentType> = {
	normal: User,
	sharking: Waves,
	jumping: ChevronsUp,
	dead: X,
};

/** The menu of a player, a marker or drawings, opened by a right click (or for players and markers a long press) on it or a player's slot. */
export function PlanContextMenu({
	editor,
	document,
	target,
	clientPoint,
	onClose,
	onSwitchWeapon,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	target: ContextMenuTarget;
	clientPoint: Point;
	onClose: () => void;
	/** Opens the weapon picker of the slot. */
	onSwitchWeapon: (slot: SlotIndex) => void;
}) {
	const point = { x: clientPoint[0], y: clientPoint[1] };

	if (target.type === "drawings") {
		return (
			<DrawingsMenu
				editor={editor}
				document={document}
				ids={target.ids}
				clientPoint={point}
				onClose={onClose}
			/>
		);
	}

	if (target.type === "marker") {
		return (
			<MarkerMenu
				editor={editor}
				document={document}
				id={target.id}
				clientPoint={point}
				onClose={onClose}
			/>
		);
	}

	return (
		<PlayerMenu
			editor={editor}
			document={document}
			slot={target.slot}
			clientPoint={point}
			onClose={onClose}
			onSwitchWeapon={onSwitchWeapon}
		/>
	);
}

function PlayerMenu({
	editor,
	document,
	slot,
	clientPoint,
	onClose,
	onSwitchWeapon,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	slot: SlotIndex;
	clientPoint: { x: number; y: number };
	onClose: () => void;
	onSwitchWeapon: (slot: SlotIndex) => void;
}) {
	const { t } = useTranslation(["common", "weapons"]);
	const player = document.slots[slot];
	if (!player) return null;

	const isOnMap = PlanCommands.isOnMap(document, slot);
	const weaponName = t(`weapons:MAIN_${player.weaponId}`);
	const apply = (
		command: (document: PlanDocument, slot: SlotIndex) => PlanOperation[],
	) => editor.apply(command(editor.getDocument(), slot));

	return (
		<SendouContextMenu
			clientPoint={clientPoint}
			onClose={onClose}
			aria-label={weaponName}
			data-testid="plan-context-menu"
		>
			<SendouMenuSection
				headerText={
					player.label ? `${player.label} · ${weaponName}` : weaponName
				}
			>
				<SendouMenuItem
					icon={isOnMap ? <EyeOff /> : <Eye />}
					onAction={() => apply(PlanCommands.toggleHidden)}
					data-testid="plan-menu-hide"
				>
					{isOnMap
						? t("common:actions.hide")
						: t("common:plans.menu.showOnMap")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={<Radius />}
					isActive={player.radiusShown}
					onAction={() =>
						editor.apply({
							type: "updatePlayer",
							slot,
							patch: { radiusShown: !player.radiusShown },
						})
					}
					data-testid="plan-menu-radius"
				>
					{t("common:plans.menu.showRadius")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={<Repeat />}
					onAction={() => apply(PlanCommands.switchKit)}
					data-testid="plan-menu-switch-kit"
				>
					{t("common:plans.menu.switchKit")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={<ArrowLeftRight />}
					onAction={() => onSwitchWeapon(slot)}
					data-testid="plan-menu-switch-weapon"
				>
					{t("common:plans.menu.switchWeapon")}
				</SendouMenuItem>
			</SendouMenuSection>
			<SendouMenuSection headerText={t("common:plans.menu.status")}>
				{PLAYER_STATUSES.map((status) => {
					const Icon = STATUS_ICONS[status];

					return (
						<SendouMenuItem
							key={status}
							icon={<Icon />}
							isActive={player.status === status}
							onAction={() =>
								editor.apply(
									PlanCommands.setStatus(editor.getDocument(), slot, status),
								)
							}
							data-testid={`plan-menu-status-${status}`}
						>
							{t(`common:plans.status.${status}`)}
						</SendouMenuItem>
					);
				})}
			</SendouMenuSection>
			<SendouMenuSection>
				<SendouMenuItem
					icon={
						<SpecialWeaponImage
							specialWeaponId={PlanKit.specialOf(player.weaponId)}
							size={ITEM_IMAGE_SIZE}
						/>
					}
					isActive={player.specialActive}
					onAction={() => apply(PlanCommands.toggleSpecial)}
					data-testid="plan-menu-special"
				>
					{player.specialActive
						? t("common:plans.menu.endSpecial")
						: t("common:plans.menu.enableSpecial")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={
						<SubWeaponImage
							subWeaponId={PlanKit.subOf(player.weaponId)}
							size={ITEM_IMAGE_SIZE}
						/>
					}
					isDisabled={!isOnMap}
					onAction={() => apply(PlanCommands.throwSub)}
					data-testid="plan-menu-throw-sub"
				>
					{t("common:plans.menu.throwSub")}
				</SendouMenuItem>
			</SendouMenuSection>
		</SendouContextMenu>
	);
}

function MarkerMenu({
	editor,
	document,
	id,
	clientPoint,
	onClose,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	id: string;
	clientPoint: { x: number; y: number };
	onClose: () => void;
}) {
	const { t } = useTranslation(["common", "weapons"]);
	const marker = document.markers.find((candidate) => candidate.id === id);
	const owner = marker ? document.slots[marker.owner] : null;
	if (!marker || !owner) return null;

	const name =
		marker.kind === "sub"
			? t(`weapons:SUB_${PlanKit.subOf(owner.weaponId)}`)
			: t(`weapons:SPECIAL_${PlanKit.specialOf(owner.weaponId)}`);

	return (
		<SendouContextMenu
			clientPoint={clientPoint}
			onClose={onClose}
			aria-label={name}
			data-testid="plan-context-menu"
		>
			<SendouMenuSection headerText={name}>
				<SendouMenuItem
					icon={<Trash2 />}
					isDestructive
					onAction={() => editor.apply({ type: "removeMarker", id })}
					data-testid="plan-menu-remove-marker"
				>
					{t("common:actions.remove")}
				</SendouMenuItem>
			</SendouMenuSection>
		</SendouContextMenu>
	);
}

function DrawingsMenu({
	editor,
	document,
	ids,
	clientPoint,
	onClose,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	ids: string[];
	clientPoint: { x: number; y: number };
	onClose: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const toFront = PlanCommands.reorderDrawings(document, ids, "front");
	const toBack = PlanCommands.reorderDrawings(document, ids, "back");

	return (
		<SendouContextMenu
			clientPoint={clientPoint}
			onClose={onClose}
			aria-label={t("common:plans.menu.drawings")}
			data-testid="plan-context-menu"
		>
			<SendouMenuSection>
				<SendouMenuItem
					icon={<BringToFront />}
					isDisabled={toFront.length === 0}
					onAction={() =>
						editor.apply(
							PlanCommands.reorderDrawings(editor.getDocument(), ids, "front"),
						)
					}
					data-testid="plan-menu-bring-to-front"
				>
					{t("common:plans.menu.bringToFront")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={<SendToBack />}
					isDisabled={toBack.length === 0}
					onAction={() =>
						editor.apply(
							PlanCommands.reorderDrawings(editor.getDocument(), ids, "back"),
						)
					}
					data-testid="plan-menu-send-to-back"
				>
					{t("common:plans.menu.sendToBack")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={<Trash2 />}
					isDestructive
					onAction={() =>
						editor.apply(PlanCommands.removeDrawings(editor.getDocument(), ids))
					}
					data-testid="plan-menu-delete-drawings"
				>
					{t("common:actions.delete")}
				</SendouMenuItem>
			</SendouMenuSection>
		</SendouContextMenu>
	);
}
