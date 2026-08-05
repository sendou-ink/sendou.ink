import { WeaponImage } from "~/components/Image";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import { AbilityGrid } from "./AbilityGrid";
import { EventTypeIcon } from "./EventTypeIcon";
import { FrameThumb } from "./FrameThumb";
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
				<span className="status detected">
					<EventTypeIcon type={SCOREBOARD_OWN_EVENT_TYPE} />
					own results
				</span>
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
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "ScoreboardOwn" }}
				/>
			</div>
			<div className="teams solo">
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
