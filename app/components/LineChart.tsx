import clsx from "clsx";
import { addDays, differenceInCalendarDays } from "date-fns";
import * as React from "react";
import * as R from "remeda";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import styles from "./LineChart.module.css";

const DEFAULT_WIDTH = 672;
const DEFAULT_HEIGHT = 170;
const MARGIN = { top: 12, bottom: 22, inline: 8 };
const MARGIN_TOP_WITH_PEAK_LABEL = 26;
/** Keeps the line's stroke from being clipped at the container's edges */
const SPARKLINE_MARGIN = 2;
/** From the plot's bottom edge to the x-axis labels' baseline */
const X_LABEL_OFFSET = MARGIN.bottom - 6;
const PEAK_LABEL_CLAMP = 48;
const PX_PER_DATE_LABEL = 120;
const PX_PER_NUMBER_LABEL = 60;
/** Keeps a middle x-axis label from overlapping the first or last one */
const X_LABEL_MIN_GAP_FROM_EDGE = 24;
const Y_TICKS_TARGET_COUNT = 3;
const TICK_STEP_MULTIPLIERS = [1, 2, 5, 10];
/** Keeps a tick's label from overlapping the baseline's */
const Y_TICK_MIN_GAP_FROM_BASELINE = 14;
/** From a y tick's grid line to its label's baseline, the label sits on top of the line */
const Y_LABEL_OFFSET = -4;
const SERIES_COLORS_COUNT = 3;
const HIGHLIGHT_COLORS_COUNT = 2;

export interface LineChartSeries {
	/** Shown in the tooltip when the chart has more than one series */
	label: React.ReactNode;
	/** Sorted by `x` ascending */
	points: Array<{ x: number; y: number }>;
}

/**
 * SVG line chart that draws at the size its container gives it so the labels stay the same size
 * regardless of it. Height comes from the container, override it via `className`. Needs at least two points.
 */
export function LineChart({
	series,
	xAxis,
	formatValue = String,
	area = false,
	showPeak = false,
	highlight,
	interactive = false,
	sparkline = false,
	className,
	ariaLabel,
}: {
	series: LineChartSeries[];
	/** "date": `x` values are timestamps in milliseconds; "number": plain numbers shown with an optional `suffix` */
	xAxis: { type: "date" } | { type: "number"; suffix?: string };
	/** Formats `y` values for the tooltip and the peak label */
	formatValue?: (value: number) => string;
	/** Gradient fill below the lines */
	area?: boolean;
	/** Marks and labels the highest point of the first series */
	showPeak?: boolean;
	/** Markers at points of interest, e.g. one per build compared */
	highlight?: Array<{ x: number; y: number }>;
	/** Hovering shows the values closest to the pointer */
	interactive?: boolean;
	/** Only the lines, no axes, labels or grid lines, e.g. inline in a table row */
	sparkline?: boolean;
	className?: string;
	ariaLabel: string;
}) {
	const { formatter: dateLabelFormatter } = useDateTimeFormat({
		month: "short",
		day: "numeric",
	});
	const { formatter: tooltipDateFormatter } = useDateTimeFormat({
		weekday: "short",
		month: "short",
		day: "numeric",
	});
	const gradientIdPrefix = React.useId();
	const [size, setSize] = React.useState<{
		width: number;
		height: number;
	} | null>(null);
	const [hoveredX, setHoveredX] = React.useState<number | null>(null);

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

	const { width, height } = size ?? {
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
	};
	const allPoints = series.flatMap((s) => s.points);
	const xs = R.unique(allPoints.map((point) => point.x)).sort((a, b) => a - b);
	const minX = xs[0];
	const maxX = xs[xs.length - 1];
	const ys = allPoints.map((point) => point.y);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	const marginTop = sparkline
		? SPARKLINE_MARGIN
		: showPeak
			? MARGIN_TOP_WITH_PEAK_LABEL
			: MARGIN.top;
	const marginBottom = sparkline ? SPARKLINE_MARGIN : MARGIN.bottom;
	const innerHeight = height - marginTop - marginBottom;
	const yRange = maxY - minY || 1;
	const yPercent = (value: number) => (1 - (value - minY) / yRange) * 100;

	const yTicks = niceTicks({
		min: minY,
		max: maxY,
		targetCount: sparkline ? 0 : Y_TICKS_TARGET_COUNT,
	}).filter(
		(tick) =>
			((yPercent(minY) - yPercent(tick.value)) / 100) * innerHeight >=
			Y_TICK_MIN_GAP_FROM_BASELINE,
	);
	const plotInset = sparkline ? SPARKLINE_MARGIN : MARGIN.inline;
	const innerWidth = width - plotInset * 2;
	const xRange = maxX - minX || 1;
	const xPercent = (value: number) => ((value - minX) / xRange) * 100;
	const isFarEnoughFromEdges = (value: number) =>
		(xPercent(value) / 100) * innerWidth >= X_LABEL_MIN_GAP_FROM_EDGE &&
		((100 - xPercent(value)) / 100) * innerWidth >= X_LABEL_MIN_GAP_FROM_EDGE;

	const formatX = (value: number) =>
		xAxis.type === "date"
			? dateLabelFormatter.format(new Date(value))
			: `${value}${xAxis.suffix ?? ""}`;
	// how many fit depends on the width which is only known once measured on the client
	const middleXLabels =
		!size || sparkline
			? []
			: xAxis.type === "date"
				? middleDates({
						first: new Date(minX),
						last: new Date(maxX),
						count: Math.floor(innerWidth / PX_PER_DATE_LABEL) - 1,
					}).map((date) => ({
						value: date.getTime(),
						label: dateLabelFormatter.format(date),
					}))
				: niceTicks({
						min: minX,
						max: maxX,
						targetCount: Math.floor(innerWidth / PX_PER_NUMBER_LABEL),
					})
						.filter((tick) => isFarEnoughFromEdges(tick.value))
						.map((tick) => ({
							...tick,
							label: `${tick.label}${xAxis.suffix ?? ""}`,
						}));

	const peak = showPeak
		? R.firstBy(series[0].points, [(point) => point.y, "desc"])
		: undefined;

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const pointerPercent =
			((event.clientX - rect.left - plotInset) / (rect.width - plotInset * 2)) *
			100;

		setHoveredX(
			R.firstBy(xs, (x) => Math.abs(xPercent(x) - pointerPercent)) ?? null,
		);
	};

	const hoveredPoints =
		typeof hoveredX === "number"
			? series.flatMap((s, seriesIndex) => {
					const point = s.points.find((p) => p.x === hoveredX);
					return point ? [{ ...point, seriesIndex, label: s.label }] : [];
				})
			: [];
	const tooltipAnchor =
		typeof hoveredX === "number" && hoveredPoints.length > 0
			? {
					xPercent: xPercent(hoveredX),
					yPercent: Math.min(
						...hoveredPoints.map((point) => yPercent(point.y)),
					),
				}
			: null;
	const tooltipAnchorX = tooltipAnchor
		? (tooltipAnchor.xPercent / 100) * innerWidth
		: 0;

	return (
		<div
			ref={measureSize}
			className={clsx(styles.container, className, {
				[styles.interactive]: interactive,
			})}
			role="img"
			aria-label={ariaLabel}
			onPointerMove={interactive ? handlePointerMove : undefined}
			onPointerDown={interactive ? handlePointerMove : undefined}
			onPointerLeave={interactive ? () => setHoveredX(null) : undefined}
		>
			{/* coordinates are percentages of the plot area so the server render matches the client's at any size */}
			<div
				className={styles.plot}
				style={{
					inset: `${marginTop}px ${plotInset}px ${marginBottom}px`,
				}}
			>
				<svg
					className={styles.chart}
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden
				>
					{series.map((s, seriesIndex) => {
						const linePath = s.points
							.map(
								(point, index) =>
									`${index === 0 ? "M" : "L"}${xPercent(point.x).toFixed(2)} ${yPercent(point.y).toFixed(2)}`,
							)
							.join(" ");
						const gradientId = `${gradientIdPrefix}-${seriesIndex}`;

						return (
							<g key={seriesIndex} className={seriesColorClass(seriesIndex)}>
								{area ? (
									<>
										<defs>
											{/* presentation attributes, not CSS: the image export does not style elements inside defs */}
											<linearGradient
												id={gradientId}
												x1="0"
												y1="0"
												x2="0"
												y2="1"
											>
												<stop
													offset="0"
													stopColor="currentColor"
													stopOpacity={0.3}
												/>
												<stop
													offset="1"
													stopColor="currentColor"
													stopOpacity={0}
												/>
											</linearGradient>
										</defs>
										<path
											d={`${linePath} L${xPercent(s.points[s.points.length - 1].x).toFixed(2)} 100 L${xPercent(s.points[0].x).toFixed(2)} 100 Z`}
											fill={`url(#${gradientId})`}
										/>
									</>
								) : null}
								<path className={styles.line} d={linePath} />
							</g>
						);
					})}
				</svg>
				<svg className={styles.chart} aria-hidden>
					{!sparkline ? (
						<line
							className={styles.gridLine}
							x1="0"
							y1="100%"
							x2="100%"
							y2="100%"
						/>
					) : null}
					{yTicks.map((tick) => (
						<g key={tick.label}>
							<line
								className={clsx(styles.gridLine, styles.gridLineDashed)}
								x1="0"
								y1={`${yPercent(tick.value)}%`}
								x2="100%"
								y2={`${yPercent(tick.value)}%`}
							/>
							<text
								className={clsx(styles.label, styles.yLabel)}
								x="0"
								y={`${yPercent(tick.value)}%`}
								dy={Y_LABEL_OFFSET}
							>
								{tick.label}
							</text>
						</g>
					))}
					{tooltipAnchor ? (
						<line
							className={styles.hoverLine}
							x1={`${tooltipAnchor.xPercent}%`}
							y1="0"
							x2={`${tooltipAnchor.xPercent}%`}
							y2="100%"
						/>
					) : null}
					{highlight?.map((point, index) => (
						<circle
							key={index}
							className={clsx(
								styles.highlight,
								styles[`highlight${index % HIGHLIGHT_COLORS_COUNT}`],
							)}
							cx={`${xPercent(point.x)}%`}
							cy={`${yPercent(point.y)}%`}
							r={5}
						/>
					))}
					{peak ? (
						<circle
							className={clsx(styles.dot, seriesColorClass(0))}
							cx={`${xPercent(peak.x)}%`}
							cy={`${yPercent(peak.y)}%`}
							r={4.5}
						/>
					) : null}
					{hoveredPoints.map((point) => (
						<circle
							key={point.seriesIndex}
							className={clsx(styles.dot, seriesColorClass(point.seriesIndex))}
							cx={`${xPercent(point.x)}%`}
							cy={`${yPercent(point.y)}%`}
							r={4.5}
						/>
					))}
					{!sparkline ? (
						<text className={styles.label} x="0" y="100%" dy={X_LABEL_OFFSET}>
							{formatX(minX)}
						</text>
					) : null}
					{middleXLabels.map((xLabel) => (
						<text
							key={xLabel.value}
							className={styles.label}
							x={`${xPercent(xLabel.value)}%`}
							y="100%"
							dy={X_LABEL_OFFSET}
							textAnchor="middle"
						>
							{xLabel.label}
						</text>
					))}
					{!sparkline ? (
						<text
							className={styles.label}
							x="100%"
							y="100%"
							dy={X_LABEL_OFFSET}
							textAnchor="end"
						>
							{formatX(maxX)}
						</text>
					) : null}
				</svg>
				{peak && !tooltipAnchor ? (
					<div
						className={styles.peakLabel}
						style={{
							left: `clamp(${PEAK_LABEL_CLAMP - plotInset}px, ${xPercent(peak.x)}%, calc(100% + ${plotInset - PEAK_LABEL_CLAMP}px))`,
							top: `${yPercent(peak.y)}%`,
						}}
					>
						{formatValue(peak.y)}
					</div>
				) : null}
				{tooltipAnchor ? (
					<div
						className={styles.tooltip}
						style={{
							left: `${tooltipAnchor.xPercent}%`,
							top: `${tooltipAnchor.yPercent}%`,
							// centered on the point but kept inside the chart's edges
							translate: `clamp(${-plotInset - tooltipAnchorX}px, -50%, calc(${innerWidth + plotInset - tooltipAnchorX}px - 100%)) calc(-100% - var(--s-3))`,
						}}
					>
						<div className={styles.tooltipHeader}>
							{xAxis.type === "date"
								? tooltipDateFormatter.format(new Date(hoveredX!))
								: formatX(hoveredX!)}
						</div>
						{series.length === 1 ? (
							<div className={styles.tooltipValue}>
								{formatValue(hoveredPoints[0].y)}
							</div>
						) : (
							hoveredPoints.map((point) => (
								<div key={point.seriesIndex} className={styles.tooltipRow}>
									<div
										className={clsx(
											styles.tooltipDot,
											seriesColorClass(point.seriesIndex),
										)}
									/>
									{point.label}
									<div className={styles.tooltipRowValue}>
										{formatValue(point.y)}
									</div>
								</div>
							))
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}

function seriesColorClass(seriesIndex: number) {
	return styles[`series${seriesIndex % SERIES_COLORS_COUNT}`];
}

function middleDates({
	first,
	last,
	count,
}: {
	first: Date;
	last: Date;
	count: number;
}) {
	const daysBetween = differenceInCalendarDays(last, first);
	const labelsCount = Math.min(count, daysBetween - 1);
	if (labelsCount <= 0) return [];

	return R.unique(
		R.range(1, labelsCount + 1).map((index) =>
			Math.round((daysBetween * index) / (labelsCount + 1)),
		),
	).map((dayOffset) => addDays(first, dayOffset));
}

/** Round-numbered ticks strictly above `min` and up to `max` */
function niceTicks({
	min,
	max,
	targetCount,
}: {
	min: number;
	max: number;
	targetCount: number;
}) {
	const range = max - min;
	if (range <= 0 || targetCount <= 0) return [];

	const roughStep = range / targetCount;
	const magnitude = 10 ** Math.floor(Math.log10(roughStep));
	const step =
		(TICK_STEP_MULTIPLIERS.find(
			(multiplier) => multiplier * magnitude >= roughStep,
		) ?? 10) * magnitude;
	const decimals = Math.max(0, -Math.floor(Math.log10(step)));

	return R.range(Math.floor(min / step) + 1, Math.floor(max / step) + 1).map(
		(multiple) => {
			const value = multiple * step;
			return { value, label: value.toFixed(decimals) };
		},
	);
}
