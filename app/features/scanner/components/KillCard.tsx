import { KILL_EVENT_TYPE, type KillData } from "../core/detectors/kill/index";
import { EventCardMeta, EventCardShell } from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { formatClock, useEventTimeFormatter } from "./format";
import { MetaPills } from "./MetaChips";

export function KillCard(props: {
	t: number;
	confidence: number;
	data: KillData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const formatDetectedAt = useEventTimeFormatter();
	// the feed reads newest-first; listing oldest-first reads as the order they happened
	const names = data.names.toReversed().map((name) => name ?? "?");
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={KILL_EVENT_TYPE}
					label="kill"
				/>
				<span>
					{data.time !== null ? `${formatClock(data.time)} · ` : null}
					splatted <b>{names.join(", ")}</b>
				</span>
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: KILL_EVENT_TYPE }}
				/>
			</EventCardMeta>
		</EventCardShell>
	);
}
