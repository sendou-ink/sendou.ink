import clsx from "clsx";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import * as React from "react";
import * as R from "remeda";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import styles from "./SeasonSpChart.module.css";

const DEFAULT_WIDTH = 672;
const DEFAULT_HEIGHT = 170;
const MARGIN = { top: 26, right: 14, bottom: 22, left: 14 };
const PEAK_LABEL_CLAMP = 48;
const PX_PER_DATE_LABEL = 120;
const SP_TICKS_TARGET_COUNT = 3;
const SP_TICK_STEP_MULTIPLIERS = [1, 2, 5, 10];
/** Keeps a tick's label from overlapping the baseline's */
const SP_TICK_MIN_GAP_FROM_BASELINE = 14;
const SP_AXIS_WIDTH = 30;
const TOOLTIP_CLAMP = 64;

/**
 * Area chart of a user's SP over a season with the peak marked. Draws at the width it is given by its container
 * so the labels stay the same size regardless of it. Needs at least two points.
 */
export function SeasonSpChart({
	points,
	height = DEFAULT_HEIGHT,
	interactive = false,
	className,
}: {
	/** SP at the end of each day played, dates in "yyyy-MM-dd" format */
	points: Array<{ date: string; sp: number }>;
	height?: number;
	/** Hovering shows the SP of the day closest to the pointer */
	interactive?: boolean;
	className?: string;
}) {
	const { formatter } = useDateTimeFormat({ month: "short", day: "numeric" });
	const { formatter: tooltipDateFormatter } = useDateTimeFormat({
		weekday: "short",
		month: "short",
		day: "numeric",
	});
	const gradientId = React.useId();
	const [width, setWidth] = React.useState(DEFAULT_WIDTH);
	const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

	const measureWidth = (element: SVGSVGElement | null) => {
		if (!element) return;

		const observer = new ResizeObserver(([entry]) => {
			const measuredWidth = Math.round(entry.contentRect.width);
			if (measuredWidth > 0) setWidth(measuredWidth);
		});
		observer.observe(element);

		return () => observer.disconnect();
	};

	const dates = points.map((point) => parseISO(point.date));
	const times = dates.map((date) => date.getTime());
	const minTime = times[0];
	const maxTime = times[times.length - 1];
	const sps = points.map((point) => point.sp);
	const minSp = Math.min(...sps);
	const maxSp = Math.max(...sps);

	const innerHeight = height - MARGIN.top - MARGIN.bottom;
	const bottomY = height - MARGIN.bottom;
	const yAt = (spValue: number) =>
		MARGIN.top +
		(1 - (spValue - minSp) / Math.max(maxSp - minSp, 1)) * innerHeight;

	const spTicks = spTickValues({ minSp, maxSp }).filter(
		(tick) => yAt(minSp) - yAt(tick) >= SP_TICK_MIN_GAP_FROM_BASELINE,
	);
	const plotLeft = MARGIN.left + (spTicks.length > 0 ? SP_AXIS_WIDTH : 0);
	const innerWidth = width - plotLeft - MARGIN.right;
	const xAt = (time: number) =>
		plotLeft + ((time - minTime) / Math.max(maxTime - minTime, 1)) * innerWidth;

	const linePath = points
		.map(
			(point, index) =>
				`${index === 0 ? "M" : "L"}${xAt(times[index]).toFixed(1)} ${yAt(point.sp).toFixed(1)}`,
		)
		.join(" ");
	const areaPath = `${linePath} L${xAt(maxTime).toFixed(1)} ${bottomY} L${xAt(minTime).toFixed(1)} ${bottomY} Z`;

	const peakIndex = sps.indexOf(maxSp);
	const peakX = xAt(times[peakIndex]);
	const peakY = yAt(maxSp);
	const peakLabelX = Math.min(
		Math.max(peakX, plotLeft + PEAK_LABEL_CLAMP - MARGIN.left),
		width - PEAK_LABEL_CLAMP,
	);

	const dateLabels = middleDates({
		first: dates[0],
		last: dates[dates.length - 1],
		count: Math.floor(innerWidth / PX_PER_DATE_LABEL) - 1,
	});

	const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const pointerX = ((event.clientX - rect.left) / rect.width) * width;
		const closestIndex = R.firstBy(R.range(0, points.length), (index) =>
			Math.abs(xAt(times[index]) - pointerX),
		);

		setHoveredIndex(closestIndex ?? null);
	};

	const hovered =
		typeof hoveredIndex === "number"
			? {
					x: xAt(times[hoveredIndex]),
					y: yAt(sps[hoveredIndex]),
					point: points[hoveredIndex],
				}
			: null;

	return (
		<div className={clsx(styles.container, className)}>
			<svg
				ref={measureWidth}
				className={clsx(styles.chart, { [styles.interactive]: interactive })}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label="SP"
				onPointerMove={interactive ? handlePointerMove : undefined}
				onPointerDown={interactive ? handlePointerMove : undefined}
				onPointerLeave={interactive ? () => setHoveredIndex(null) : undefined}
			>
				<defs>
					{/* presentation attributes, not CSS: the image export does not style elements inside defs */}
					<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor="currentColor" stopOpacity={0.3} />
						<stop offset="1" stopColor="currentColor" stopOpacity={0} />
					</linearGradient>
				</defs>
				<line
					className={styles.gridLine}
					x1={plotLeft}
					y1={yAt(minSp)}
					x2={width - MARGIN.right}
					y2={yAt(minSp)}
				/>
				{spTicks.map((tick) => (
					<g key={tick}>
						<line
							className={clsx(styles.gridLine, styles.gridLineDashed)}
							x1={plotLeft}
							y1={yAt(tick)}
							x2={width - MARGIN.right}
							y2={yAt(tick)}
						/>
						<text
							className={styles.label}
							x={plotLeft - 6}
							y={yAt(tick)}
							textAnchor="end"
							dominantBaseline="middle"
						>
							{tick}
						</text>
					</g>
				))}
				<path d={areaPath} fill={`url(#${gradientId})`} />
				<path className={styles.line} d={linePath} />
				{hovered ? (
					<line
						className={styles.hoverLine}
						x1={hovered.x}
						y1={MARGIN.top}
						x2={hovered.x}
						y2={bottomY}
					/>
				) : null}
				<circle className={styles.dot} cx={peakX} cy={peakY} r={4.5} />
				{hovered ? null : (
					<text
						className={styles.peakLabel}
						x={peakLabelX}
						y={peakY - 10}
						textAnchor="middle"
					>
						{maxSp.toFixed(1)}SP
					</text>
				)}
				{hovered ? (
					<circle
						className={styles.dot}
						cx={hovered.x}
						cy={hovered.y}
						r={4.5}
					/>
				) : null}
				<text className={styles.label} x={plotLeft} y={height - 6}>
					{formatter.format(dates[0])}
				</text>
				{dateLabels.map((date) => (
					<text
						key={date.getTime()}
						className={styles.label}
						x={xAt(date.getTime())}
						y={height - 6}
						textAnchor="middle"
					>
						{formatter.format(date)}
					</text>
				))}
				<text
					className={styles.label}
					x={width - MARGIN.right}
					y={height - 6}
					textAnchor="end"
				>
					{formatter.format(dates[dates.length - 1])}
				</text>
			</svg>
			{hovered ? (
				<div
					className={styles.tooltip}
					style={{
						left: Math.min(
							Math.max(hovered.x, TOOLTIP_CLAMP),
							width - TOOLTIP_CLAMP,
						),
						top: hovered.y,
					}}
				>
					<div className={styles.tooltipDate}>
						{tooltipDateFormatter.format(parseISO(hovered.point.date))}
					</div>
					<div className={styles.tooltipSp}>
						{hovered.point.sp.toFixed(1)}SP
					</div>
				</div>
			) : null}
		</div>
	);
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

function spTickValues({ minSp, maxSp }: { minSp: number; maxSp: number }) {
	const range = maxSp - minSp;
	if (range <= 0) return [];

	const roughStep = range / SP_TICKS_TARGET_COUNT;
	const magnitude = Math.max(1, 10 ** Math.floor(Math.log10(roughStep)));
	const step =
		(SP_TICK_STEP_MULTIPLIERS.find(
			(multiplier) => multiplier * magnitude >= roughStep,
		) ?? 10) * magnitude;

	return R.range(
		Math.floor(minSp / step) + 1,
		Math.floor(maxSp / step) + 1,
	).map((multiple) => multiple * step);
}
