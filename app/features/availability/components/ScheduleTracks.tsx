import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { AVAILABILITY } from "../availability-constants";
import type { DayTimeRange } from "../availability-types";
import styles from "./ScheduleTracks.module.css";

const AXIS_LABEL_EVERY_HOURS = 2;
const MINUTES_IN_HOUR = 60;
/** However little is on the tracks, a compact window still reads as a stretch of a day. */
const MIN_FITTED_SPAN_MINUTES = 4 * MINUTES_IN_HOUR;

export type ClockWindow = ReturnType<typeof useClockWindow>;

/**
 * The hours the day tracks show and how a day range maps onto them. Defaults to the evening
 * hours people play in, the expanders widening towards the morning on either end. `fitTo`
 * compacts it around what is on the tracks instead (read-only views), so the width goes to the
 * bars rather than hours nobody is free in. The expanders still open the full day either way.
 */
export function useClockWindow({
	fitTo,
	expandTo,
}: {
	/** Everything drawn on the tracks, in minutes from their own day's midnight. */
	fitTo?: Array<DayTimeRange>;
	/** Content the window must reach even outside the default hours (a typed time, a week saved in another timezone). For the editor. */
	expandTo?: Array<DayTimeRange>;
} = {}) {
	const [earlierShown, setEarlierShown] = React.useState(false);
	const [laterShown, setLaterShown] = React.useState(false);

	const fitted = fittedWindow(fitTo);
	const expanded = fittedWindow(expandTo);
	const defaultStart =
		fitted?.start ??
		Math.min(
			expanded?.start ?? Number.POSITIVE_INFINITY,
			AVAILABILITY.TRACK_START_MINUTES,
		);
	const defaultEnd =
		fitted?.end ??
		Math.max(
			expanded?.end ?? Number.NEGATIVE_INFINITY,
			AVAILABILITY.TRACK_END_MINUTES,
		);

	const trackStart = earlierShown
		? Math.min(AVAILABILITY.TRACK_EARLIER_START_MINUTES, defaultStart)
		: defaultStart;
	const trackEnd = laterShown
		? Math.max(AVAILABILITY.TRACK_LATER_END_MINUTES, defaultEnd)
		: defaultEnd;

	const pct = (minutes: number) =>
		((Math.min(Math.max(minutes, trackStart), trackEnd) - trackStart) /
			(trackEnd - trackStart)) *
		100;

	const hours: Array<number> = [];
	for (
		let hour = trackStart / MINUTES_IN_HOUR;
		hour <= trackEnd / MINUTES_IN_HOUR;
		hour += AXIS_LABEL_EVERY_HOURS
	) {
		hours.push(hour);
	}

	return {
		trackStart,
		trackEnd,
		hours,
		earlierShown,
		setEarlierShown,
		laterShown,
		setLaterShown,
		pct,
		barStyle: (range: DayTimeRange) => ({
			left: `${pct(range.start)}%`,
			width: `${pct(range.end) - pct(range.start)}%`,
		}),
	};
}

/** Whole hours around everything on the tracks, rounded so a label lands on both edges. Null when nothing to fit. */
function fittedWindow(ranges?: Array<DayTimeRange>) {
	if (!ranges || ranges.length === 0) return null;

	const start =
		Math.floor(
			Math.min(...ranges.map((range) => range.start)) / MINUTES_IN_HOUR,
		) * MINUTES_IN_HOUR;
	const end =
		Math.ceil(Math.max(...ranges.map((range) => range.end)) / MINUTES_IN_HOUR) *
		MINUTES_IN_HOUR;

	const labelStep = AXIS_LABEL_EVERY_HOURS * MINUTES_IN_HOUR;
	const span = Math.max(end - start, MIN_FITTED_SPAN_MINUTES);

	return { start, end: start + Math.ceil(span / labelStep) * labelStep };
}

/** The hour labels above the day tracks, with the expanders widening the clock window. */
export function ClockAxis({
	clockWindow,
	dayStartsAt,
}: {
	clockWindow: ClockWindow;
	/** Midnight of any of the shown days, the hour labels are read off it. */
	dayStartsAt: Date;
}) {
	const { t } = useTranslation(["schedule"]);
	const { formatter } = useDateTimeFormat({ hour: "numeric" });

	const hourAt = (hour: number) =>
		new Date(dayStartsAt.getTime() + hour * MINUTES_IN_HOUR * 60 * 1000);

	return (
		<>
			<button
				type="button"
				className={clsx(styles.axisToggle, styles.axisLead)}
				onClick={() => clockWindow.setEarlierShown(!clockWindow.earlierShown)}
			>
				{clockWindow.earlierShown ? (
					<ChevronRight size={12} aria-hidden />
				) : (
					<ChevronLeft size={12} aria-hidden />
				)}
				{t("schedule:editor.earlier")}
			</button>
			<div className={styles.axis}>
				{clockWindow.hours.map((hour) => (
					<span
						key={hour}
						className={clsx(styles.axisLabel, {
							[styles.axisLabelFirst]:
								hour * MINUTES_IN_HOUR === clockWindow.trackStart,
							[styles.axisLabelLast]:
								hour * MINUTES_IN_HOUR === clockWindow.trackEnd,
						})}
						style={{ left: `${clockWindow.pct(hour * MINUTES_IN_HOUR)}%` }}
					>
						{formatter.format(hourAt(hour))}
					</span>
				))}
			</div>
			<button
				type="button"
				className={clsx(styles.axisToggle, styles.axisTrail)}
				onClick={() => clockWindow.setLaterShown(!clockWindow.laterShown)}
			>
				{t("schedule:editor.later")}
				{clockWindow.laterShown ? (
					<ChevronLeft size={12} aria-hidden />
				) : (
					<ChevronRight size={12} aria-hidden />
				)}
			</button>
		</>
	);
}

/** The hour gridlines of one day track, midnight drawn stronger than the rest. */
export function TrackTicks({ clockWindow }: { clockWindow: ClockWindow }) {
	return clockWindow.hours
		.filter(
			(hour) =>
				hour * MINUTES_IN_HOUR > clockWindow.trackStart &&
				hour * MINUTES_IN_HOUR < clockWindow.trackEnd,
		)
		.map((hour) => (
			<div
				key={hour}
				className={clsx(styles.tick, {
					[styles.tickMidnight]: hour === 24,
				})}
				style={{ left: `${clockWindow.pct(hour * MINUTES_IN_HOUR)}%` }}
			/>
		));
}

/** A commitment on a day track: a hatched block naming what the time is taken by. */
export function TrackCommitment({
	clockWindow,
	range,
	name,
}: {
	clockWindow: ClockWindow;
	range: DayTimeRange;
	name: string;
}) {
	return (
		<div
			className={styles.commitment}
			style={clockWindow.barStyle(range)}
			title={name}
			data-testid="availability-commitment"
		>
			<span className={styles.commitmentName}>{name}</span>
		</div>
	);
}
