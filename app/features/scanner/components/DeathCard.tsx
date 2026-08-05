import { WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import { AbilityGrid } from "./AbilityGrid";
import { EventTypeIcon } from "./EventTypeIcon";
import { FrameThumb } from "./FrameThumb";
import { formatTime } from "./format";
import { weaponLabel } from "./labels";

export function DeathCard(props: {
	t: number;
	confidence: number;
	data: DeathData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const weaponName = weaponLabel(data.weaponType, data.weaponId);
	return (
		<div className="card">
			<div className="meta">
				<span>t={formatTime(t)}</span>
				<span className="status detected">
					<EventTypeIcon type={DEATH_EVENT_TYPE} />
					death
				</span>
				<span>
					splatted by <b>{weaponName ?? "?"}</b>
					{data.name && <> ({data.name})</>}
				</span>
				<span>confidence {(confidence * 100).toFixed(0)}%</span>
				{detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "Death" }}
				/>
			</div>
			<div className="teams solo">
				<div className="team">
					{data.weaponId !== null && data.weaponType === "MAIN" ? (
						<WeaponImage
							weaponSplId={data.weaponId as MainWeaponId}
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
