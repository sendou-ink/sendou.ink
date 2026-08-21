import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "../core/detectors/objective/strip-weapons";
import { EventCardMeta, EventCardShell } from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { formatClock, useEventTimeFormatter } from "./format";
import { mainWeaponLabel } from "./labels";
import { MetaPills } from "./MetaChips";

export function StripWeaponsCard(props: {
	t: number;
	confidence: number;
	data: StripWeaponsData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const side = (index: 0 | 1) =>
		data.slots[index]
			.map((candidates) =>
				candidates === null
					? "✕"
					: (mainWeaponLabel(candidates[0]?.weaponId ?? null) ?? "?"),
			)
			.join(" | ");
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={STRIP_WEAPONS_EVENT_TYPE}
					label={`strip weapons (${data.layout})`}
				/>
				<span>
					{data.time !== null ? `${formatClock(data.time)} · ` : null}
					<b>{side(0)}</b> vs <b>{side(1)}</b>
				</span>
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: STRIP_WEAPONS_EVENT_TYPE }}
				/>
			</EventCardMeta>
		</EventCardShell>
	);
}
