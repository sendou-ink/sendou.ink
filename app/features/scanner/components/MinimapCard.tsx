import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import type {
	MinimapData,
	MinimapEnemy,
	MinimapTeammate,
} from "../core/detectors/minimap/index";
import type { ScannerAbility } from "../scanner-types";
import { saveFixtureFromEvent } from "./fixture-export";
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
		<tr>
			<td>{label}</td>
			<td>{player.name ?? ""}</td>
			<td>
				{player.weaponId !== null ? (
					<WeaponImage
						weaponSplId={player.weaponId}
						variant="build"
						size={28}
						className="weapon-icon"
					/>
				) : (
					"?"
				)}
			</td>
			<td>
				<AbilityRow abilities={player.abilities} />
			</td>
		</tr>
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
				<span className="status detected">minimap</span>
				{data.stage !== null && <span>{stageLabel(data.stage)}</span>}
				<span>confidence {(confidence * 100).toFixed(0)}%</span>
				{detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
				{onInspect && (
					<button type="button" onClick={onInspect}>
						Inspect
					</button>
				)}
				{getFrame && (
					<button
						type="button"
						onClick={() =>
							void getFrame().then(
								(f) => f && saveFixtureFromEvent(f, data, "Minimap"),
							)
						}
					>
						Save fixture
					</button>
				)}
				{thumbnail && (
					<img className="thumb" src={thumbnail} alt="analyzed frame" />
				)}
			</div>
			<div className="teams">
				<div className="team">
					<table className="players">
						<tbody>
							{data.teammates.map((p) => (
								<PlayerRow key={p.slot} label={p.slot} player={p} />
							))}
							{data.enemies.map((p, i) => (
								<PlayerRow key={`e${i}`} label={`enemy ${i + 1}`} player={p} />
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
