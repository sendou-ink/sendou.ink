import { isSameDay } from "date-fns";
import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import type { BusyBlock, TimeRange } from "../availability-types";
import styles from "./ScheduleDayCell.module.css";

/**
 * One day of one person's week: free ranges plus, where shown, commitments and the day note.
 * Shared by the team schedule grid and the single person week view so they cannot drift apart.
 */
export function ScheduleDayCell({
	reported,
	ranges,
	busy = [],
	note,
}: {
	/** False when they have not filled the week in at all, which reads differently from being unavailable. */
	reported: boolean;
	ranges: Array<TimeRange>;
	busy?: Array<BusyBlock>;
	note?: string;
}) {
	const { t } = useTranslation(["schedule"]);
	const rangeText = useRangeText();

	const busyName = (block: BusyBlock) =>
		block.name ?? t("schedule:commitment.scrim");

	return (
		<div className={styles.content}>
			{!reported ? (
				<span className={styles.unknown} title={t("schedule:team.noSchedule")}>
					?
				</span>
			) : ranges.length === 0 && busy.length === 0 ? (
				<span
					className={styles.unavailable}
					title={t("schedule:team.notAvailable")}
				>
					—
				</span>
			) : (
				ranges.map((range) => (
					<div
						key={range.startsAt}
						className={styles.range}
						data-testid="schedule-range"
					>
						{rangeText(range)}
					</div>
				))
			)}
			{busy.map((block, index) => (
				<div
					key={index}
					className={styles.busy}
					title={`${rangeText(block)} · ${busyName(block)}`}
					data-testid="schedule-busy"
				>
					<span className={styles.busyName}>{busyName(block)}</span>
				</div>
			))}
			{note ? (
				<span title={note}>
					<Flag className={styles.noteFlag} size={12} aria-hidden />
				</span>
			) : null}
		</div>
	);
}

/** Times only: `formatRange` expands to full dates across days, so a range crossing midnight formats its ends separately. */
export function useRangeText() {
	const { formatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "2-digit",
	});

	return (range: TimeRange) =>
		isSameDay(
			databaseTimestampToDate(range.startsAt),
			databaseTimestampToDate(range.endsAt),
		)
			? formatter.formatRange(range.startsAt, range.endsAt)
			: `${formatter.format(range.startsAt)} – ${formatter.format(range.endsAt)}`;
}
