import { WeaponImage } from "~/components/Image";
import type { ScoreboardOwnData } from "../core/detectors/scoreboard-own/index";
import { AbilityGrid } from "./AbilityGrid";
import { saveFixtureFromEvent } from "./fixture-export";
import { formatTime } from "./format";
import { lobbyLabel, mainWeaponLabel, modeLabel, stageLabel } from "./labels";

export function ScoreboardOwnCard(props: {
	t: number;
	confidence: number;
	data: ScoreboardOwnData;
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
				<span className="status detected">own results</span>
				<span>
					{[
						lobbyLabel(data.lobby),
						modeLabel(data.mode),
						stageLabel(data.stage),
					]
						.map((v) => v ?? "?")
						.join(" · ")}
				</span>
				<span>
					weapon <b>{mainWeaponLabel(data.weaponId) ?? "?"}</b>
				</span>
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
								(f) => f && saveFixtureFromEvent(f, data, "ScoreboardOwn"),
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
					{data.weaponId !== null ? (
						<WeaponImage
							weaponSplId={data.weaponId}
							variant="build"
							size={28}
							className="weapon-icon"
						/>
					) : null}
					<AbilityGrid abilities={data.abilities} />
				</div>
			</div>
		</div>
	);
}
