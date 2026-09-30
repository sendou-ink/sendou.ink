import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "../core/detectors/objective/index";
import { EventCardMeta, EventCardShell } from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { formatClock, useEventTimeFormatter } from "./format";
import { MetaPills } from "./MetaChips";

export function ObjectiveCard(props: {
	t: number;
	confidence: number;
	data: ObjectiveData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const side = (index: 0 | 1) => {
		const score = data.score[index] ?? "?";
		const penalty =
			data.penalty[index] !== null ? ` (+${data.penalty[index]})` : "";
		return `${score}${penalty}`;
	};
	const holder = data.control.findIndex(Boolean);
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={OBJECTIVE_EVENT_TYPE}
					label="objective"
				/>
				<span>
					{data.time !== null ? `${formatClock(data.time)} · ` : null}
					<b>
						{side(0)} – {side(1)}
					</b>
					{holder >= 0
						? ` · ${holder === 0 ? "alpha" : "bravo"} in control`
						: null}
				</span>
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: OBJECTIVE_EVENT_TYPE }}
				/>
			</EventCardMeta>
		</EventCardShell>
	);
}
