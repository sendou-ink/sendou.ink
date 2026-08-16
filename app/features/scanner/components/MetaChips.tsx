/**
 * The pill group every event card's meta row opens with: video timestamp,
 * detection confidence and the event type, kept tight together so the free-form
 * detail text that follows reads as a separate group.
 */

import { Clock, Gauge } from "lucide-react";
import { EventTypeIcon } from "./EventTypeIcon";
import { formatTime } from "./format";
import styles from "./MetaChips.module.css";

export function MetaPills({
	t,
	confidence,
	type,
	label,
}: {
	t: number;
	confidence: number;
	type: string;
	label: string;
}) {
	return (
		<div className={styles.pills}>
			<span className={styles.chip} title="Video timestamp">
				<Clock size={12} aria-hidden />
				{formatTime(t)}
			</span>
			<span className={styles.chip} title="Detection confidence">
				<Gauge size={12} aria-hidden />
				{(confidence * 100).toFixed(0)}%
			</span>
			<span className={styles.chip}>
				<EventTypeIcon type={type} />
				{label}
			</span>
		</div>
	);
}
