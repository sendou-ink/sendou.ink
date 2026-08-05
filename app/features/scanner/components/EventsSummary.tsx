/**
 * One light line summarizing a scan's raw detections as per-type counts,
 * with a toggle for the full event card feed — the matches are the main
 * view, the events stay one click away.
 */

import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import { SCOREBOARD_EVENT_TYPE } from "../core/detectors/scoreboard/index";
import { SCOREBOARD_OWN_EVENT_TYPE } from "../core/detectors/scoreboard-own/index";
import { SCOREBOARD_REPLAY_EVENT_TYPE } from "../core/detectors/scoreboard-replay/index";
import { EventTypeIcon } from "./EventTypeIcon";

const EVENT_TYPE_LABELS: Record<string, string> = {
	[MAP_START_EVENT_TYPE]: "map start",
	[DEATH_EVENT_TYPE]: "death",
	[MINIMAP_EVENT_TYPE]: "minimap",
	[SCOREBOARD_EVENT_TYPE]: "scoreboard",
	[SCOREBOARD_REPLAY_EVENT_TYPE]: "replay scoreboard",
	[SCOREBOARD_OWN_EVENT_TYPE]: "own result",
};

export function EventsSummary({
	events,
	open,
	onToggle,
}: {
	events: ReadonlyArray<{ type: string }>;
	open: boolean;
	onToggle: () => void;
}) {
	const counts = new Map<string, number>();
	for (const event of events) {
		counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
	}
	const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

	return (
		<div className="events-summary">
			{sorted.map(([type, count]) => {
				const label = EVENT_TYPE_LABELS[type] ?? type;
				return (
					<span
						key={type}
						className="events-summary-type"
						title={`${count} ${label}${count === 1 ? "" : "s"}`}
					>
						<span className="events-summary-icon">
							<EventTypeIcon type={type} />
						</span>
						×{count}
					</span>
				);
			})}
			<button type="button" className="events-toggle" onClick={onToggle}>
				{open ? "hide events" : "show events"}
			</button>
		</div>
	);
}
