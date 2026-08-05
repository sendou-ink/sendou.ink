import type { ReactNode } from "react";
import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
	type MinimapEnemy,
	type MinimapTeammate,
} from "../core/detectors/minimap/index";
import type { CardSlot } from "../core/detectors/minimap/rois";
import type { ScannerAbility } from "../scanner-types";
import { EventTypeIcon } from "./EventTypeIcon";
import { FrameThumb } from "./FrameThumb";
import { formatTime } from "./format";
import { stageLabel } from "./labels";

const ENEMY_SLOT_LETTERS = ["A", "B", "X", "Y"] as const;

function AbilityRow({ abilities }: { abilities: (ScannerAbility | null)[] }) {
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

function SlotChevron({ direction }: { direction: CardSlot }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="3.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-label={direction}
			role="img"
		>
			<polyline points="6 14.5 12 8.5 18 14.5" />
		</svg>
	);
}

function TeammateMarker({ slot }: { slot: CardSlot }) {
	if (slot === "self") {
		return <span className="slot-marker">●</span>;
	}
	return (
		<span className={`slot-marker ${slot}`}>
			<SlotChevron direction={slot} />
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
		<div className="minimap-player">
			{marker}
			{player.weaponId !== null ? (
				<WeaponImage
					weaponSplId={player.weaponId}
					variant="build"
					size={24}
					className="weapon-icon"
				/>
			) : (
				<span className="weapon-missing">?</span>
			)}
			<span className="name">{player.name ?? ""}</span>
			<span className="abilities">
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
	return (
		<div className="card">
			<div className="meta">
				<span>t={formatTime(t)}</span>
				<span className="status detected">
					<EventTypeIcon type={MINIMAP_EVENT_TYPE} />
					minimap
				</span>
				{data.stage !== null && <span>{stageLabel(data.stage)}</span>}
				<span>confidence {(confidence * 100).toFixed(0)}%</span>
				{detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "Minimap" }}
				/>
			</div>
			<div className="teams">
				<div className="team">
					<h3>Team</h3>
					{data.teammates.map((p) => (
						<PlayerRow
							key={p.slot}
							marker={<TeammateMarker slot={p.slot} />}
							player={p}
						/>
					))}
				</div>
				{data.enemies.length > 0 ? (
					<div className="team">
						<h3>Enemies</h3>
						{data.enemies.map((p, i) => (
							<PlayerRow
								key={i}
								marker={
									<span className="slot-marker">
										{ENEMY_SLOT_LETTERS[i] ?? i + 1}
									</span>
								}
								player={p}
							/>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
