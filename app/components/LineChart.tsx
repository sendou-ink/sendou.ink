import clsx from "clsx";
import { addDays, differenceInCalendarDays } from "date-fns";
import * as React from "react";
import * as R from "remeda";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import styles from "./LineChart.module.css";

const DEFAULT_WIDTH = 672;
const DEFAULT_HEIGHT = 170;
const MARGIN = { top: 12, right: 14, bottom: 22, left: 14 };
const MARGIN_TOP_WITH_PEAK_LABEL = 26;
const PEAK_LABEL_CLAMP = 48;
const PX_PER_DATE_LABEL = 120;
const PX_PER_NUMBER_LABEL = 60;
/** Keeps a middle x-axis label from overlapping the first or last one */
const X_LABEL_MIN_GAP_FROM_EDGE = 24;
const Y_TICKS_TARGET_COUNT = 3;
const TICK_STEP_MULTIPLIERS = [1, 2, 5, 10];
/** Keeps a tick's label from overlapping the baseline's */
const Y_TICK_MIN_GAP_FROM_BASELINE = 14;
const Y_AXIS_PX_PER_CHAR = 6;
const Y_AXIS_LABEL_GAP = 8;
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
	const [size, setSize] = React.useState({
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
	});
	const [hoveredX, setHoveredX] = React.useState<number | null>(null);

	const measureSize = (element: SVGSVGElement | null) => {
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
	const allPoints = series.flatMap((s) => s.points);
	const xs = R.unique(allPoints.map((point) => point.x)).sort((a, b) => a - b);
	const minX = xs[0];
	const maxX = xs[xs.length - 1];
	const ys = allPoints.map((point) => point.y);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	const marginTop = showPeak ? MARGIN_TOP_WITH_PEAK_LABEL : MARGIN.top;
	const innerHeight = height - marginTop - MARGIN.bottom;
	const bottomY = height - MARGIN.bottom;
	const yRange = maxY - minY || 1;
	const yAt = (value: number) =>
		marginTop + (1 - (value - minY) / yRange) * innerHeight;

	const yTicks = niceTicks({
		min: minY,
		max: maxY,
		targetCount: Y_TICKS_TARGET_COUNT,
	}).filter(
		(tick) => yAt(minY) - yAt(tick.value) >= Y_TICK_MIN_GAP_FROM_BASELINE,
	);
	const yAxisWidth =
		yTicks.length > 0
			? Math.max(...yTicks.map((tick) => tick.label.length)) *
					Y_AXIS_PX_PER_CHAR +
				Y_AXIS_LABEL_GAP
			: 0;
	const plotLeft = MARGIN.left + yAxisWidth;
	const plotRight = width - MARGIN.right;
	const innerWidth = plotRight - plotLeft;
	const xRange = maxX - minX || 1;
	const xAt = (value: number) =>
		plotLeft + ((value - minX) / xRange) * innerWidth;

	const formatX = (value: number) =>
		xAxis.type === "date"
			? dateLabelFormatter.format(new Date(value))
			: `${value}${xAxis.suffix ?? ""}`;
	const middleXLabels =
		xAxis.type === "date"
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
					.filter(
						(tick) =>
							xAt(tick.value) - plotLeft >= X_LABEL_MIN_GAP_FROM_EDGE &&
							plotRight - xAt(tick.value) >= X_LABEL_MIN_GAP_FROM_EDGE,
					)
					.map((tick) => ({
						...tick,
						label: `${tick.label}${xAxis.suffix ?? ""}`,
					}));

	const peak = showPeak
		? R.firstBy(series[0].points, [(point) => point.y, "desc"])
		: undefined;

	const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const pointerX = ((event.clientX - rect.left) / rect.width) * width;

		setHoveredX(R.firstBy(xs, (x) => Math.abs(xAt(x) - pointerX)) ?? null);
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
					x: xAt(hoveredX),
					y: Math.min(...hoveredPoints.map((point) => yAt(point.y))),
				}
			: null;

	return (
		<div className={clsx(styles.container, className)}>
			<svg
				ref={measureSize}
				className={clsx(styles.chart, { [styles.interactive]: interactive })}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={ariaLabel}
				onPointerMove={interactive ? handlePointerMove : undefined}
				onPointerDown={interactive ? handlePointerMove : undefined}
				onPointerLeave={interactive ? () => setHoveredX(null) : undefined}
			>
				<line
					className={styles.gridLine}
					x1={plotLeft}
					y1={yAt(minY)}
					x2={plotRight}
					y2={yAt(minY)}
				/>
				{yTicks.map((tick) => (
					<g key={tick.label}>
						<line
							className={clsx(styles.gridLine, styles.gridLineDashed)}
							x1={plotLeft}
							y1={yAt(tick.value)}
							x2={plotRight}
							y2={yAt(tick.value)}
						/>
						<text
							className={styles.label}
							x={plotLeft - 6}
							y={yAt(tick.value)}
							textAnchor="end"
							dominantBaseline="middle"
						>
							{tick.label}
						</text>
					</g>
				))}
				{series.map((s, seriesIndex) => {
					const linePath = s.points
						.map(
							(point, index) =>
								`${index === 0 ? "M" : "L"}${xAt(point.x).toFixed(1)} ${yAt(point.y).toFixed(1)}`,
						)
						.join(" ");
					const gradientId = `${gradientIdPrefix}-${seriesIndex}`;

					return (
						<g key={seriesIndex} className={seriesColorClass(seriesIndex)}>
							{area ? (
								<>
									<defs>
										{/* presentation attributes, not CSS: the image export does not style elements inside defs */}
										<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
										d={`${linePath} L${xAt(s.points[s.points.length - 1].x).toFixed(1)} ${bottomY} L${xAt(s.points[0].x).toFixed(1)} ${bottomY} Z`}
										fill={`url(#${gradientId})`}
									/>
								</>
							) : null}
							<path className={styles.line} d={linePath} />
						</g>
					);
				})}
				{tooltipAnchor ? (
					<line
						className={styles.hoverLine}
						x1={tooltipAnchor.x}
						y1={marginTop}
						x2={tooltipAnchor.x}
						y2={bottomY}
					/>
				) : null}
				{highlight?.map((point, index) => (
					<circle
						key={index}
						className={clsx(
							styles.highlight,
							styles[`highlight${index % HIGHLIGHT_COLORS_COUNT}`],
						)}
						cx={xAt(point.x)}
						cy={yAt(point.y)}
						r={5}
					/>
				))}
				{peak ? (
					<circle
						className={clsx(styles.dot, seriesColorClass(0))}
						cx={xAt(peak.x)}
						cy={yAt(peak.y)}
						r={4.5}
					/>
				) : null}
				{peak && !tooltipAnchor ? (
					<text
						className={styles.peakLabel}
						x={Math.min(
							Math.max(xAt(peak.x), plotLeft + PEAK_LABEL_CLAMP - MARGIN.left),
							width - PEAK_LABEL_CLAMP,
						)}
						y={yAt(peak.y) - 10}
						textAnchor="middle"
					>
						{formatValue(peak.y)}
					</text>
				) : null}
				{hoveredPoints.map((point) => (
					<circle
						key={point.seriesIndex}
						className={clsx(styles.dot, seriesColorClass(point.seriesIndex))}
						cx={xAt(point.x)}
						cy={yAt(point.y)}
						r={4.5}
					/>
				))}
				<text className={styles.label} x={plotLeft} y={height - 6}>
					{formatX(minX)}
				</text>
				{middleXLabels.map((xLabel) => (
					<text
						key={xLabel.value}
						className={styles.label}
						x={xAt(xLabel.value)}
						y={height - 6}
						textAnchor="middle"
					>
						{xLabel.label}
					</text>
				))}
				<text
					className={styles.label}
					x={plotRight}
					y={height - 6}
					textAnchor="end"
				>
					{formatX(maxX)}
				</text>
			</svg>
			{tooltipAnchor ? (
				<div
					className={styles.tooltip}
					style={{
						left: tooltipAnchor.x,
						top: tooltipAnchor.y,
						// centered on the point but kept inside the chart's edges
						translate: `clamp(${-tooltipAnchor.x}px, -50%, calc(${width - tooltipAnchor.x}px - 100%)) calc(-100% - var(--s-3))`,
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
