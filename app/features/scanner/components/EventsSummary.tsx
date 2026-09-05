/**
 * One light line summarizing raw detections as per-type counts, with a toggle
 * for their card feed. Callers pass only events not covered by a match card.
 */

import * as R from "remeda";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import { SCOREBOARD_EVENT_TYPE } from "../core/detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log-replay/index";
import { SCOREBOARD_OWN_EVENT_TYPE } from "../core/detectors/scoreboard-own/index";
import styles from "./EventsSummary.module.css";
import { EventTypeIcon } from "./EventTypeIcon";

const EVENT_TYPE_LABELS: Record<string, string> = {
	[MAP_START_EVENT_TYPE]: "map start",
	[DEATH_EVENT_TYPE]: "death",
	[MINIMAP_EVENT_TYPE]: "minimap",
	[OBJECTIVE_EVENT_TYPE]: "objective",
	[SCOREBOARD_EVENT_TYPE]: "scoreboard",
	[SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE]: "replay scoreboard",
	[SCOREBOARD_BATTLE_LOG_EVENT_TYPE]: "battle log",
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
	const counts = R.countBy(events, (event) => event.type);
	const sorted = Object.entries(counts).toSorted((a, b) => b[1] - a[1]);

	return (
		<div className={styles.summary}>
			{sorted.map(([type, count]) => {
				const label = EVENT_TYPE_LABELS[type] ?? type;
				return (
					<span
						key={type}
						className={styles.type}
						title={`${count} ${label}${count === 1 ? "" : "s"}`}
					>
						<span className={styles.icon}>
							<EventTypeIcon type={type} />
						</span>
						×{count}
					</span>
				);
			})}
			<button type="button" className={styles.toggle} onClick={onToggle}>
				{open ? "Hide events" : "Show events"}
			</button>
		</div>
	);
}
