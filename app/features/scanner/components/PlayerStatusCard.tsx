import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "../core/detectors/objective/player-status";
import { EventCardMeta, EventCardShell } from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { formatClock, useEventTimeFormatter } from "./format";
import { MetaPills } from "./MetaChips";

export function PlayerStatusCard(props: {
	t: number;
	confidence: number;
	data: PlayerStatusData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const side = (index: 0 | 1) =>
		data.dead[index]
			.map((dead, slot) => (dead ? "✕" : data.special[index][slot] ? "★" : "·"))
			.join("");
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={PLAYER_STATUS_EVENT_TYPE}
					label={`players (${data.layout})`}
				/>
				<span>
					{data.time !== null ? `${formatClock(data.time)} · ` : null}
					<b>
						{side(0)} – {side(1)}
					</b>
				</span>
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: PLAYER_STATUS_EVENT_TYPE }}
				/>
			</EventCardMeta>
		</EventCardShell>
	);
}
