import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { FrameThumb } from "./FrameThumb";
import { modeLabel, stageLabel } from "./labels";
import { MetaPills } from "./MetaChips";

export function MapStartCard(props: {
	t: number;
	confidence: number;
	data: MapStartData;
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
					type={MAP_START_EVENT_TYPE}
					label="map start"
				/>
				<span>
					<b>{modeLabel(data.mode) ?? "?"}</b> · {stageLabel(data.stage) ?? "?"}
				</span>
				{detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "MapStart" }}
				/>
			</div>
		</div>
	);
}
