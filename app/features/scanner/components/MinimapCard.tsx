import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
	type MinimapEnemy,
	type MinimapTeammate,
} from "../core/detectors/minimap/index";
import type { ScannerAbility } from "../scanner-types";
import { EventTypeIcon } from "./EventTypeIcon";
import { FrameThumb } from "./FrameThumb";
import { formatTime } from "./format";
import { stageLabel } from "./labels";

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

function PlayerRow({
	label,
	player,
}: {
	label: string;
	player: MinimapTeammate | MinimapEnemy;
}) {
	return (
		<div className="minimap-player">
			<span className="slot">{label}</span>
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
						<PlayerRow key={p.slot} label={p.slot} player={p} />
					))}
				</div>
				{data.enemies.length > 0 ? (
					<div className="team">
						<h3>Enemies</h3>
						{data.enemies.map((p, i) => (
							<PlayerRow key={i} label={`${i + 1}`} player={p} />
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
