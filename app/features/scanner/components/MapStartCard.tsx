import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { EventCardMeta, EventCardShell } from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { useEventTimeFormatter } from "./format";
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
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={MAP_START_EVENT_TYPE}
					label="map start"
				/>
				<span>
					<b>{modeLabel(data.mode) ?? "?"}</b> · {stageLabel(data.stage) ?? "?"}
				</span>
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "MapStart" }}
				/>
			</EventCardMeta>
		</EventCardShell>
	);
}
