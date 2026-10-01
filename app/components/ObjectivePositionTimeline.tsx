/**
 * Tug-of-war chart of a Tower Control / Rainmaker objective along its track: the middle line is
 * the start, up is toward the end alpha pushes to and fills in alpha's color, down toward bravo's
 * goal in bravo's. Shares the objective chart's x-axis and y-label gutter so both line up.
 */

import clsx from "clsx";
import { useElementSize } from "~/hooks/useElementSize";
import styles from "./ObjectivePositionTimeline.module.css";
import type { ObjectiveTimelineEvent } from "./ObjectiveTimeline";
import {
	TIMELINE_PLOT_GUTTER_PX,
	timelineTimeTicks,
} from "./objective-timeline-utils";

const TRACK_END = 100;
const POSITION_TICKS = [TRACK_END, 0, -TRACK_END];
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 116;
const PLOT_PADDING_Y_PX = 6;
const Y_LABEL_GAP_PX = 6;

export function ObjectivePositionTimeline({
	events,
	domain,
}: {
	/** sorted by `t`; events without a position read are skipped */
	events: readonly ObjectiveTimelineEvent[];
	domain: [number, number];
}) {
	const { ref: measureRef, size } = useElementSize<HTMLDivElement>();

	const reads = events.flatMap((event) =>
		event.data.position != null
			? [{ t: event.t, position: event.data.position }]
			: [],
	);
	if (reads.length === 0) return null;

	const { width, height } = size ?? {
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
	};
	const [xMin, xMax] = domain;
	const xRange = Math.max(xMax - xMin, 1);
	const plotLeft = TIMELINE_PLOT_GUTTER_PX;
	const plotRight = width;
	const plotTop = PLOT_PADDING_Y_PX;
	const plotBottom = height - PLOT_PADDING_Y_PX;
	const xAt = (time: number) =>
		plotLeft + ((time - xMin) / xRange) * (plotRight - plotLeft);
	const yAt = (position: number) =>
		plotTop +
		((TRACK_END - position) / (2 * TRACK_END)) * (plotBottom - plotTop);

	const withCrossings = withZeroCrossings(reads);
	const areaPath = (clamp: (position: number) => number) =>
		[
			`M${xAt(withCrossings[0]!.t).toFixed(1)} ${yAt(0).toFixed(1)}`,
			...withCrossings.map(
				(read) =>
					`L${xAt(read.t).toFixed(1)} ${yAt(clamp(read.position)).toFixed(1)}`,
			),
			`L${xAt(withCrossings[withCrossings.length - 1]!.t).toFixed(1)} ${yAt(0).toFixed(1)}`,
			"Z",
		].join(" ");

	return (
		<div className={styles.container}>
			<div ref={measureRef} className={styles.plot}>
				<svg
					className={styles.chart}
					viewBox={`0 0 ${width} ${height}`}
					aria-hidden="true"
				>
					{timelineTimeTicks({
						min: xMin,
						max: xMax,
						plotWidth: plotRight - plotLeft,
					}).map((tick) => (
						<line
							key={tick}
							className={clsx(styles.gridLine, styles.gridLineDashed)}
							x1={xAt(tick)}
							y1={plotTop}
							x2={xAt(tick)}
							y2={plotBottom}
						/>
					))}
					{POSITION_TICKS.map((tick) => (
						<g key={tick}>
							<line
								className={clsx(
									styles.gridLine,
									tick === 0 ? styles.gridLineZero : styles.gridLineDashed,
								)}
								x1={plotLeft}
								y1={yAt(tick)}
								x2={plotRight}
								y2={yAt(tick)}
							/>
							<text
								className={styles.label}
								x={plotLeft - Y_LABEL_GAP_PX}
								y={yAt(tick)}
								textAnchor="end"
								dominantBaseline="middle"
							>
								{Math.abs(tick)}
							</text>
						</g>
					))}
					<path
						className={clsx(styles.area, styles.alpha)}
						d={areaPath((position) => Math.max(position, 0))}
					/>
					<path
						className={clsx(styles.area, styles.bravo)}
						d={areaPath((position) => Math.min(position, 0))}
					/>
					<polyline
						className={styles.line}
						points={reads
							.map(
								(read) =>
									`${xAt(read.t).toFixed(1)},${yAt(read.position).toFixed(1)}`,
							)
							.join(" ")}
					/>
				</svg>
			</div>
		</div>
	);
}

/** Inserts a read at each point the line crosses the middle, so clamping either side to zero keeps the exact shape. */
function withZeroCrossings(reads: Array<{ t: number; position: number }>) {
	return reads.flatMap((read, i) => {
		const previous = reads[i - 1];
		if (!previous || previous.position * read.position >= 0) return [read];

		const ratio = previous.position / (previous.position - read.position);
		return [
			{ t: previous.t + (read.t - previous.t) * ratio, position: 0 },
			read,
		];
	});
}
