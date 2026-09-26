/**
 * Debug: the source events behind a match card, as the per-event cards with
 * their frames (Inspect, Save fixture). Counter/status/strip reads render as
 * the timeline instead and stay out.
 */
import { connectAbilities } from "../core/ability-harvest";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "../core/detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT_TYPE } from "../core/detectors/objective/strip-weapons";
import { withoutRepeatEvents } from "./dedupe-events";
import { EventCard, type GetFrame } from "./EventCard";
import type { FixtureData } from "./fixture-export";
import styles from "./RawDetections.module.css";
import type { ScanEvent } from "./session-data";

export function RawDetections({
	sources,
	getFrame,
}: {
	/** the match's source events, chronological */
	sources: readonly ScanEvent[];
	getFrame: (event: ScanEvent) => GetFrame | undefined;
}) {
	const events = withoutRepeatEvents(sources).filter(
		(e) =>
			e.type !== OBJECTIVE_EVENT_TYPE &&
			e.type !== PLAYER_STATUS_EVENT_TYPE &&
			e.type !== STRIP_WEAPONS_EVENT_TYPE,
	);
	const abilityMap = connectAbilities(sources);
	return (
		<div className={styles.events}>
			{events.map((e) => (
				<EventCard
					key={e.id ?? `${e.type}-${e.t}`}
					type={e.type}
					t={e.t}
					confidence={e.confidence}
					data={e.data as FixtureData}
					abilities={abilityMap.get(e)}
					thumbnail={e.thumbnail}
					detectedAt={e.detectedAt}
					getFrame={getFrame(e)}
				/>
			))}
		</div>
	);
}
