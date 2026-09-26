/**
 * Line chart of a game's objective-counter reads, one falling line per team. Control is a state,
 * not a count, so it gets its own lane below the zero gridline (strip in the controlling team's
 * color); penalty is a translucent band between score and score + penalty, so its thickness is
 * the extra count to burn through. Series colors are the chart tokens from vars.css: the text-tier
 * colors are too pastel to tell apart as marks.
 */

import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import styles from "./ObjectiveTimeline.module.css";
import {
	formatElapsed,
	smoothPenalties,
	TIMELINE_PLOT_GUTTER_PX,
} from "./objective-timeline-utils";

/** count-axis units of gutter kept below zero for the control lane */
const CONTROL_LANE_DEPTH = 13;
const CONTROL_LANE_Y = -6;
const COUNT_TICK_STEP = 25;
const SUGGESTED_MAX_COUNT = 100;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 240;
const PLOT_TOP_PX = 6;
const TIME_LABELS_HEIGHT_PX = 18;
const Y_LABEL_GAP_PX = 6;
const MAX_TIME_TICKS = 8;
const PX_PER_TIME_TICK = 56;
const TIME_TICK_STEPS_SECONDS = [
	1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
];
/** Time labels closer than this to a plot edge are aligned inwards so they stay inside the card */
const TIME_LABEL_EDGE_PX = 14;
const TOOLTIP_CURSOR_GAP_PX = 12;
/** Cursor position past this fraction of the chart flips the tooltip to its left side */
const TOOLTIP_FLIP_RATIO = 0.55;

const SIDES = [0, 1] as const;

/** One objective-counter read, values in `[alpha, bravo]` order. */
export interface ObjectiveTimelineSample {
	/** seconds shown on the match timer at the read ("3:35" = 215); null = unreadable */
	time: number | null;
	/** displayed count per team; null = unreadable */
	score: [number | null, number | null];
	/** penalty pill value per team; null = no pill (or unreadable) */
	penalty: [number | null, number | null];
	/** which team held the objective at the read */
	control: [boolean, boolean];
}

export interface ObjectiveTimelineEvent {
	/** whole seconds into the source (video, stream or game) the read was made at */
	t: number;
	data: ObjectiveTimelineSample;
}

export function ObjectiveTimeline({
	events,
	teamLabels,
	domain,
	showTooltip = true,
}: {
	events: readonly ObjectiveTimelineEvent[];
	teamLabels: readonly [string, string];
	/** x-axis range override, to share the player-status timeline's axis */
	domain?: [number, number];
	/** off when a parent renders its own scrub readout over the chart */
	showTooltip?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const [size, setSize] = React.useState({
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
	});
	const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

	const sorted = events.toSorted((a, b) => a.t - b.t);
	if (sorted.length === 0) return null;

	const measureSize = (element: HTMLDivElement | null) => {
		if (!element) return;

		const observer = new ResizeObserver(([entry]) => {
			const width = Math.round(entry.contentRect.width);
			const height = Math.round(entry.contentRect.height);
			if (width > 0 && height > 0) setSize({ width, height });
		});
		observer.observe(element);

		return () => observer.disconnect();
	};

	const { width, height } = size;
	const series = SIDES.map((side) => {
		const penalties = smoothPenalties(
			sorted.map((event) => ({
				t: event.t,
				penalty: event.data.penalty[side],
			})),
		);
		const carriedScores = carryForward(
			sorted.map((event) => event.data.score[side]),
		);
		return { penalties, carriedScores };
	});

	const maxCount = Math.max(
		SUGGESTED_MAX_COUNT,
		...sorted.flatMap((event) =>
			event.data.score.filter((score) => typeof score === "number"),
		),
		...series.flatMap(({ penalties, carriedScores }) =>
			carriedScores.flatMap((score, i) =>
				typeof score === "number" ? [score + (penalties[i] ?? 0)] : [],
			),
		),
	);
	const xMin = domain?.[0] ?? sorted[0]!.t;
	const xMax = domain?.[1] ?? sorted[sorted.length - 1]!.t;
	const xRange = Math.max(xMax - xMin, 1);

	const plotLeft = TIMELINE_PLOT_GUTTER_PX;
	const plotRight = width;
	const plotTop = PLOT_TOP_PX;
	const plotBottom = height - TIME_LABELS_HEIGHT_PX;
	const xAt = (time: number) =>
		plotLeft + ((time - xMin) / xRange) * (plotRight - plotLeft);
	const yAt = (count: number) =>
		plotTop +
		((maxCount - count) / (maxCount + CONTROL_LANE_DEPTH)) *
			(plotBottom - plotTop);
	const zeroY = yAt(0);

	const countTicks = R.range(0, Math.floor(maxCount / COUNT_TICK_STEP) + 1).map(
		(multiple) => multiple * COUNT_TICK_STEP,
	);
	const timeTicks = timeTickValues({
		min: xMin,
		max: xMax,
		maxCount: R.clamp(Math.floor((plotRight - plotLeft) / PX_PER_TIME_TICK), {
			min: 2,
			max: MAX_TIME_TICKS,
		}),
	});

	const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const pointerX = ((event.clientX - rect.left) / rect.width) * width;
		const closestIndex = R.firstBy(R.range(0, sorted.length), (index) =>
			Math.abs(xAt(sorted[index]!.t) - pointerX),
		);

		setHoveredIndex(closestIndex ?? null);
	};

	const hoveredEvent =
		showTooltip && typeof hoveredIndex === "number"
			? sorted[hoveredIndex]
			: undefined;
	const hovered = hoveredEvent
		? hoveredState({ event: hoveredEvent, xAt, yAt, plotTop, plotBottom })
		: null;

	return (
		<div className={styles.container}>
			<div className={styles.legend}>
				{SIDES.map((side) => (
					<span key={side} className={styles.legendItem}>
						<span className={clsx(styles.swatch, sideClassName(side))} />
						{teamLabels[side]}
					</span>
				))}
			</div>
			<div ref={measureSize} className={styles.plot}>
				<svg
					className={clsx(styles.chart, {
						[styles.interactive]: showTooltip,
					})}
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label={`${teamLabels[0]} / ${teamLabels[1]}`}
					onPointerMove={showTooltip ? handlePointerMove : undefined}
					onPointerDown={showTooltip ? handlePointerMove : undefined}
					onPointerLeave={showTooltip ? () => setHoveredIndex(null) : undefined}
				>
					{timeTicks.map((tick) => (
						<line
							key={tick}
							className={clsx(styles.gridLine, styles.gridLineDashed)}
							x1={xAt(tick)}
							y1={plotTop}
							x2={xAt(tick)}
							y2={zeroY}
						/>
					))}
					{countTicks.map((tick) => (
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
								{tick}
							</text>
						</g>
					))}
					{SIDES.map((side) => (
						<g key={side} className={sideClassName(side)}>
							<PenaltyBand
								events={sorted}
								carriedScores={series[side]!.carriedScores}
								penalties={series[side]!.penalties}
								xAt={xAt}
								yAt={yAt}
							/>
						</g>
					))}
					{SIDES.map((side) => (
						<g key={side} className={sideClassName(side)}>
							<path
								className={styles.scoreLine}
								d={curvePath(
									sorted.flatMap((event) => {
										const score = event.data.score[side];
										return typeof score === "number"
											? [{ x: xAt(event.t), y: yAt(score) }]
											: [];
									}),
								)}
							/>
						</g>
					))}
					{SIDES.map((side) => (
						<g key={side} className={sideClassName(side)}>
							{controlRuns(sorted, side).map((run) => (
								<line
									key={run.start}
									className={styles.controlLane}
									x1={xAt(run.start)}
									y1={yAt(CONTROL_LANE_Y)}
									x2={xAt(run.end)}
									y2={yAt(CONTROL_LANE_Y)}
								/>
							))}
						</g>
					))}
					{hovered ? (
						<>
							<line
								className={styles.hoverLine}
								x1={hovered.x}
								y1={plotTop}
								x2={hovered.x}
								y2={plotBottom}
							/>
							{SIDES.map((side) => {
								const y = hovered.scoreYs[side];
								return typeof y === "number" ? (
									<circle
										key={side}
										className={clsx(styles.dot, sideClassName(side))}
										cx={hovered.x}
										cy={y}
										r={4}
									/>
								) : null;
							})}
						</>
					) : null}
					{timeTicks.map((tick) => (
						<text
							key={tick}
							className={styles.label}
							x={xAt(tick)}
							y={height - 4}
							textAnchor={timeLabelAnchor({
								x: xAt(tick),
								plotLeft,
								plotRight,
							})}
						>
							{formatElapsed(tick)}
						</text>
					))}
				</svg>
				{hovered && hoveredEvent ? (
					<div
						className={styles.tooltip}
						style={
							hovered.x > width * TOOLTIP_FLIP_RATIO
								? {
										top: hovered.y,
										right: width - hovered.x + TOOLTIP_CURSOR_GAP_PX,
									}
								: { top: hovered.y, left: hovered.x + TOOLTIP_CURSOR_GAP_PX }
						}
					>
						<div className={styles.tooltipTitle}>
							{formatElapsed(hoveredEvent.t)}
							{typeof hoveredEvent.data.time === "number"
								? ` · ${t("common:objectiveTimeline.timeLeft", {
										time: formatClock(hoveredEvent.data.time),
									})}`
								: null}
						</div>
						{SIDES.map((side) => {
							const { score, penalty, control } = hoveredEvent.data;
							return (
								<div key={side} className={styles.tooltipRow}>
									<span className={clsx(styles.swatch, sideClassName(side))} />
									{[
										`${teamLabels[side]}: ${score[side] ?? "?"}`,
										typeof penalty[side] === "number"
											? t("common:objectiveTimeline.penalty", {
													value: penalty[side],
												})
											: null,
										control[side]
											? t("common:objectiveTimeline.inControl")
											: null,
									]
										.filter(Boolean)
										.join(" · ")}
								</div>
							);
						})}
					</div>
				) : null}
			</div>
		</div>
	);
}

/** Band between score and score + penalty; its edge is drawn only where a penalty exists so zero-height stretches stay invisible. */
function PenaltyBand({
	events,
	carriedScores,
	penalties,
	xAt,
	yAt,
}: {
	events: readonly ObjectiveTimelineEvent[];
	carriedScores: (number | null)[];
	penalties: (number | null)[];
	xAt: (time: number) => number;
	yAt: (count: number) => number;
}) {
	if (!penalties.some((penalty) => (penalty ?? 0) > 0)) return null;

	const indexes = R.range(0, events.length).filter(
		(i) => typeof carriedScores[i] === "number",
	);
	const topPoints = indexes.map((i) => ({
		x: xAt(events[i]!.t),
		y: yAt(carriedScores[i]! + (penalties[i] ?? 0)),
	}));
	const bottomPoints = indexes.map((i) => ({
		x: xAt(events[i]!.t),
		y: yAt(carriedScores[i]!),
	}));
	const topSegments = curveSegments(topPoints);
	const bottomSegments = curveSegments(bottomPoints);
	if (topSegments.length === 0) return null;

	const areaPath = [
		`M${point(topPoints[0]!)}`,
		...topSegments.map(forwardSegment),
		`L${point(bottomPoints[bottomPoints.length - 1]!)}`,
		...bottomSegments.toReversed().map(backwardSegment),
		"Z",
	].join(" ");

	const hasPenalty = (i: number) => (penalties[indexes[i]!] ?? 0) > 0;
	const edgePath = topSegments
		.map((segment, i) =>
			hasPenalty(i) || hasPenalty(i + 1)
				? `M${point(segment.from)} ${forwardSegment(segment)}`
				: "",
		)
		.join(" ");

	return (
		<>
			<path className={styles.penaltyBand} d={areaPath} />
			{edgePath.trim() ? (
				<path className={styles.penaltyEdge} d={edgePath} />
			) : null}
		</>
	);
}

function sideClassName(side: 0 | 1) {
	return side === 0 ? styles.alpha : styles.bravo;
}

function hoveredState({
	event,
	xAt,
	yAt,
	plotTop,
	plotBottom,
}: {
	event: ObjectiveTimelineEvent;
	xAt: (time: number) => number;
	yAt: (count: number) => number;
	plotTop: number;
	plotBottom: number;
}) {
	const scoreYs = event.data.score.map((score) =>
		typeof score === "number" ? yAt(score) : null,
	);
	const knownYs = scoreYs.filter((y) => typeof y === "number");

	return {
		x: xAt(event.t),
		y:
			knownYs.length > 0
				? R.mean(knownYs)!
				: plotTop + (plotBottom - plotTop) / 2,
		scoreYs,
	};
}

/** Last readable value at or before each index; null until the first one. */
function carryForward(values: (number | null)[]) {
	let last: number | null = null;
	return values.map((value) => {
		last = value ?? last;
		return last;
	});
}

/**
 * Stretches where the team held control. The read where control was lost is kept in the run so the
 * strip extends exactly to where control ended.
 */
function controlRuns(
	sorted: readonly ObjectiveTimelineEvent[],
	side: 0 | 1,
): Array<{ start: number; end: number }> {
	const runs: Array<{ start: number; end: number }> = [];
	let current: { start: number; end: number } | null = null;
	for (const [i, event] of sorted.entries()) {
		const inLane =
			event.data.control[side] || sorted[i - 1]?.data.control[side];
		if (inLane) {
			current ??= { start: event.t, end: event.t };
			current.end = event.t;
		} else if (current) {
			runs.push(current);
			current = null;
		}
	}
	if (current) runs.push(current);

	return runs;
}

function timeTickValues({
	min,
	max,
	maxCount,
}: {
	min: number;
	max: number;
	maxCount: number;
}) {
	const range = Math.max(max - min, 1);
	const step =
		TIME_TICK_STEPS_SECONDS.find(
			(candidate) => range / candidate <= maxCount - 1,
		) ?? Math.ceil(range / (maxCount - 1) / 3600) * 3600;

	return R.range(Math.ceil(min / step), Math.floor(max / step) + 1).map(
		(multiple) => multiple * step,
	);
}

function timeLabelAnchor({
	x,
	plotLeft,
	plotRight,
}: {
	x: number;
	plotLeft: number;
	plotRight: number;
}) {
	if (x - plotLeft < TIME_LABEL_EDGE_PX) return "start";
	if (plotRight - x < TIME_LABEL_EDGE_PX) return "end";
	return "middle";
}

/** the match timer's M:SS (215 → "3:35") */
function formatClock(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const rest = String(Math.floor(seconds % 60)).padStart(2, "0");
	return `${minutes}:${rest}`;
}

interface Point {
	x: number;
	y: number;
}

interface CurveSegment {
	from: Point;
	control1: Point;
	control2: Point;
	to: Point;
}

function curvePath(points: Point[]) {
	if (points.length === 0) return "";

	return [
		`M${point(points[0]!)}`,
		...curveSegments(points).map(forwardSegment),
	].join(" ");
}

/** Monotone cubic interpolation (Fritsch–Carlson, like d3's curveMonotoneX): smooth without overshooting the reads. */
function curveSegments(points: Point[]): CurveSegment[] {
	if (points.length < 2) return [];

	const secants = points.slice(1).map((to, i) => safeSlope(points[i]!, to));
	const tangents = points.map((current, i) => {
		const previous = points[i - 1];
		const next = points[i + 1];
		if (!previous || !next) return secants[Math.min(i, secants.length - 1)]!;

		const secantBefore = secants[i - 1]!;
		const secantAfter = secants[i]!;
		const widthBefore = current.x - previous.x;
		const widthAfter = next.x - current.x;
		const weighted =
			widthBefore + widthAfter > 0
				? (secantBefore * widthAfter + secantAfter * widthBefore) /
					(widthBefore + widthAfter)
				: 0;
		return (
			(Math.sign(secantBefore) + Math.sign(secantAfter)) *
				Math.min(
					Math.abs(secantBefore),
					Math.abs(secantAfter),
					0.5 * Math.abs(weighted),
				) || 0
		);
	});

	return points.slice(1).map((to, i) => {
		const from = points[i]!;
		const third = (to.x - from.x) / 3;
		return {
			from,
			control1: { x: from.x + third, y: from.y + third * tangents[i]! },
			control2: { x: to.x - third, y: to.y - third * tangents[i + 1]! },
			to,
		};
	});
}

function safeSlope(from: Point, to: Point) {
	const width = to.x - from.x;
	return width > 0 ? (to.y - from.y) / width : 0;
}

function forwardSegment(segment: CurveSegment) {
	return `C${point(segment.control1)} ${point(segment.control2)} ${point(segment.to)}`;
}

function backwardSegment(segment: CurveSegment) {
	return `C${point(segment.control2)} ${point(segment.control1)} ${point(segment.from)}`;
}

function point({ x, y }: Point) {
	return `${x.toFixed(1)} ${y.toFixed(1)}`;
}
