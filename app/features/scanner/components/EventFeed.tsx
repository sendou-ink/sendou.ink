/** The latest reads of a running capture as one-line rows, newest first. */
import * as R from "remeda";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import { KILL_EVENT_TYPE } from "../core/detectors/kill/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { SCOREBOARD_EVENT_TYPE } from "../core/detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log/index";
import { SCOREBOARD_OWN_EVENT_TYPE } from "../core/detectors/scoreboard-own/index";
import { formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import type { ScannerMatch } from "../core/scanner-match";
import styles from "./EventFeed.module.css";
import { EventTypeIcon } from "./EventTypeIcon";
import type { ScanEvent } from "./session-data";

const FEED_LENGTH = 6;

interface FeedItem {
	t: number;
	type: string;
	label: string;
}

export function EventFeed({
	events,
	matches,
	originT,
}: {
	events: ScanEvent[];
	matches: ScannerMatch[];
	originT: number;
}) {
	const items = R.pipe(
		[
			...events.flatMap((event) => {
				const label = eventLabel(event);
				return label === null ? [] : [{ t: event.t, type: event.type, label }];
			}),
			// the builder's splats, not the raw feed reads: each stack change re-reads the same rows
			...matches.flatMap((match) =>
				(match.kills ?? []).map(
					(kill): FeedItem => ({
						t: kill.t,
						type: KILL_EVENT_TYPE,
						label: kill.name ? `Splatted ${kill.name}` : "Splat",
					}),
				),
			),
		],
		R.sortBy([R.prop("t"), "desc"]),
		R.take(FEED_LENGTH),
		withUniqueKeys,
	);

	return (
		<ol className={styles.feed}>
			{items.length === 0 ? (
				<li className={styles.empty}>Waiting for the first read…</li>
			) : (
				items.map((item) => (
					<li key={item.key} className={styles.item}>
						<span className={styles.icon}>
							<EventTypeIcon type={item.type} size={14} />
						</span>
						<span className={styles.time}>
							{formatPosition(item.t - originT)}
						</span>
						<span className={styles.label}>{item.label}</span>
					</li>
				))
			)}
		</ol>
	);
}

/** `t` is whole seconds, so e.g. a double splat shares type and `t` */
function withUniqueKeys(items: FeedItem[]) {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const base = `${item.type}-${item.t}-${item.label}`;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return { ...item, key: `${base}-${count}` };
	});
}

function eventLabel(event: ScanEvent): string | null {
	switch (event.type) {
		case MAP_START_EVENT_TYPE: {
			const data = event.data as MapStartData;
			const what = [modeLabel(data.mode), stageLabel(data.stage)]
				.filter(Boolean)
				.join(" on ");
			return what ? `Game started: ${what}` : "Game started";
		}
		case DEATH_EVENT_TYPE: {
			const name = (event.data as DeathData).name;
			return name ? `Splatted by ${name}` : "Splatted";
		}
		case SCOREBOARD_EVENT_TYPE:
			return "Results screen read";
		case SCOREBOARD_OWN_EVENT_TYPE:
			return "Personal results read";
		case SCOREBOARD_BATTLE_LOG_EVENT_TYPE:
			return "Battle history read";
		default:
			return null;
	}
}
