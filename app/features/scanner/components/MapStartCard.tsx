import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { EventTypeIcon } from "./EventTypeIcon";
import { FrameThumb } from "./FrameThumb";
import { formatTime } from "./format";
import { modeLabel, stageLabel } from "./labels";

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
				<span>t={formatTime(t)}</span>
				<span className="status detected">
					<EventTypeIcon type={MAP_START_EVENT_TYPE} />
					map start
				</span>
				<span>
					<b>{modeLabel(data.mode) ?? "?"}</b> · {stageLabel(data.stage) ?? "?"}
				</span>
				<span>confidence {(confidence * 100).toFixed(0)}%</span>
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
