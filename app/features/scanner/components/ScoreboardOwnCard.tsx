import { WeaponImage } from "~/components/Image";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import { AbilityGrid } from "./AbilityGrid";
import { FrameThumb } from "./FrameThumb";
import { lobbyLabel, mainWeaponLabel, modeLabel, stageLabel } from "./labels";
import { MetaPills } from "./MetaChips";

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
				<MetaPills
					t={t}
					confidence={confidence}
					type={SCOREBOARD_OWN_EVENT_TYPE}
					label="own results"
				/>
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
