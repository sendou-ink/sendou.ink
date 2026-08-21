import clsx from "clsx";
import { ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
	type MinimapEnemy,
	type MinimapTeammate,
} from "../core/detectors/minimap/index";
import type { CardSlot } from "../core/detectors/minimap/rois";
import {
	EventCardMeta,
	EventCardShell,
	EventCardTeam,
	EventCardTeams,
} from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { useEventTimeFormatter } from "./format";
import { stageLabel } from "./labels";
import { MetaPills } from "./MetaChips";
import styles from "./MinimapCard.module.css";

const ENEMY_SLOT_LETTERS = ["A", "B", "X", "Y"] as const;

function AbilityRow({
	abilities,
}: {
	abilities: (AbilityWithUnknown | null)[];
}) {
	return (
		<>
			{abilities.map((id, i) =>
				id ? (
					<Ability key={i} ability={id} size="TINY" />
				) : (
					<span key={i} title="unreadable badge">
						?
					</span>
				),
			)}
		</>
	);
}

/** `up` needs no rotation, `self` renders a dot instead of a chevron */
const SLOT_ROTATION_CLASS: Record<CardSlot, string | undefined> = {
	up: undefined,
	down: styles.down,
	left: styles.left,
	right: styles.right,
	self: undefined,
};

function TeammateMarker({ slot }: { slot: CardSlot }) {
	if (slot === "self") {
		return <span className={styles.slotMarker}>●</span>;
	}
	return (
		<span className={clsx(styles.slotMarker, SLOT_ROTATION_CLASS[slot])}>
			<ChevronUp strokeWidth={3.5} aria-label={slot} role="img" />
		</span>
	);
}

function PlayerRow({
	marker,
	player,
}: {
	marker: ReactNode;
	player: MinimapTeammate | MinimapEnemy;
}) {
	return (
		<div className={styles.player}>
			{marker}
			{player.weaponId !== null ? (
				<WeaponImage
					weaponSplId={player.weaponId}
					variant="build"
					size={24}
					className={styles.weapon}
				/>
			) : (
				<span className={styles.weaponMissing}>?</span>
			)}
			<span className={styles.name}>{player.name ?? ""}</span>
			{player.dead ? (
				<span
					className={clsx(styles.statusChip, styles.dead)}
					title="respawning (struck out)"
				>
					✕
				</span>
			) : null}
			{player.specialReady ? (
				<span
					className={clsx(styles.statusChip, styles.special)}
					title="special ready (camo)"
				>
					★
				</span>
			) : null}
			<span className={styles.abilities}>
				<AbilityRow abilities={player.abilities} />
			</span>
		</div>
	);
}

export function MinimapCard(props: {
	t: number;
	confidence: number;
	data: MinimapData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={MINIMAP_EVENT_TYPE}
					label="minimap"
				/>
				{data.stage !== null ? <span>{stageLabel(data.stage)}</span> : null}
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "Minimap" }}
				/>
			</EventCardMeta>
			<EventCardTeams>
				<EventCardTeam>
					<h3>Team</h3>
					{data.teammates.map((p) => (
						<PlayerRow
							key={p.slot}
							marker={<TeammateMarker slot={p.slot} />}
							player={p}
						/>
					))}
				</EventCardTeam>
				{data.enemies.length > 0 ? (
					<EventCardTeam>
						<h3>Enemies</h3>
						{data.enemies.map((p, i) => (
							<PlayerRow
								key={i}
								marker={
									<span className={styles.slotMarker}>
										{ENEMY_SLOT_LETTERS[i] ?? i + 1}
									</span>
								}
								player={p}
							/>
						))}
					</EventCardTeam>
				) : null}
			</EventCardTeams>
		</EventCardShell>
	);
}
