import clsx from "clsx";
import { format } from "date-fns";
import * as React from "react";
import * as R from "remeda";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./ReportsBarChart.module.css";

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 184;
const MARGIN = { top: 8, right: 4, bottom: 20 };
const Y_LABEL_GAP_PX = 6;
const Y_LABEL_CHAR_WIDTH_PX = 7;
const PX_PER_COUNT_TICK = 32;
const COUNT_TICK_STEP_MULTIPLIERS = [1, 2, 5, 10];
const PX_PER_MONTH_LABEL = 52;
const BAR_WIDTH_RATIO = 0.7;
const MAX_BAR_WIDTH_PX = 40;
const BAR_RADIUS_PX = 3;
const TOOLTIP_CLAMP = 40;

/** One bar per calendar month, count axis starting at zero. */
export function ReportsBarChart({
	monthlyCounts,
}: {
	monthlyCounts: Array<{
		/** Start of the calendar month as a JavaScript timestamp */
		month: number;
		count: number;
	}>;
}) {
	const isHydrated = useHydrated();
	const [size, setSize] = React.useState({
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
	});
	const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

	// month labels depend on the viewer's time zone, so they are only rendered on the client
	if (!isHydrated || monthlyCounts.length === 0) {
		return <div className={styles.container} />;
	}

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
	const plotTop = MARGIN.top;
	const plotBottom = height - MARGIN.bottom;
	const countTicks = countTickValues({
		maxCount: Math.max(...monthlyCounts.map(({ count }) => count)),
		maxTickCount: Math.max(
			2,
			Math.floor((plotBottom - plotTop) / PX_PER_COUNT_TICK),
		),
	});
	const topCount = countTicks[countTicks.length - 1]!;
	const yAt = (count: number) =>
		plotBottom - (count / topCount) * (plotBottom - plotTop);

	const plotLeft =
		String(topCount).length * Y_LABEL_CHAR_WIDTH_PX + Y_LABEL_GAP_PX;
	const plotRight = width - MARGIN.right;
	const bandWidth = (plotRight - plotLeft) / monthlyCounts.length;
	const barWidth = Math.min(bandWidth * BAR_WIDTH_RATIO, MAX_BAR_WIDTH_PX);
	const bandCenterX = (index: number) =>
		plotLeft + bandWidth * index + bandWidth / 2;
	const monthLabelEvery = Math.ceil(PX_PER_MONTH_LABEL / bandWidth);

	const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const pointerX = ((event.clientX - rect.left) / rect.width) * width;

		setHoveredIndex(
			R.clamp(Math.floor((pointerX - plotLeft) / bandWidth), {
				min: 0,
				max: monthlyCounts.length - 1,
			}),
		);
	};

	const hovered =
		typeof hoveredIndex === "number" ? monthlyCounts[hoveredIndex] : undefined;

	return (
		<div className={styles.container}>
			<div ref={measureSize} className={styles.plot}>
				<svg
					className={styles.chart}
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="Reports per month"
					onPointerMove={handlePointerMove}
					onPointerDown={handlePointerMove}
					onPointerLeave={() => setHoveredIndex(null)}
				>
					{countTicks.map((tick) => (
						<g key={tick}>
							<line
								className={clsx(styles.gridLine, {
									[styles.gridLineDashed]: tick !== 0,
								})}
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
					{typeof hoveredIndex === "number" ? (
						<rect
							className={styles.hoverBand}
							x={plotLeft + bandWidth * hoveredIndex}
							y={plotTop}
							width={bandWidth}
							height={plotBottom - plotTop}
						/>
					) : null}
					{monthlyCounts.map(({ month, count }, index) =>
						count > 0 ? (
							<path
								key={month}
								className={styles.bar}
								d={roundedTopBarPath({
									x: bandCenterX(index) - barWidth / 2,
									y: yAt(count),
									width: barWidth,
									height: yAt(0) - yAt(count),
								})}
							/>
						) : null,
					)}
					{monthlyCounts.map(({ month }, index) =>
						index % monthLabelEvery === 0 ? (
							<text
								key={month}
								className={styles.label}
								x={bandCenterX(index)}
								y={height - 6}
								textAnchor="middle"
							>
								{monthLabel(month)}
							</text>
						) : null,
					)}
				</svg>
				{hovered && typeof hoveredIndex === "number" ? (
					<div
						className={styles.tooltip}
						style={{
							left: R.clamp(bandCenterX(hoveredIndex), {
								min: TOOLTIP_CLAMP,
								max: width - TOOLTIP_CLAMP,
							}),
							top: yAt(hovered.count),
						}}
					>
						<div className={styles.tooltipMonth}>
							{monthLabel(hovered.month)}
						</div>
						<div className={styles.tooltipCount}>{hovered.count}</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

function monthLabel(month: number) {
	return format(new Date(month), "MMM yy");
}

/** Integer ticks from zero with a round step, the last one at or above `maxCount`. */
function countTickValues({
	maxCount,
	maxTickCount,
}: {
	maxCount: number;
	maxTickCount: number;
}) {
	const roughStep = Math.max(maxCount, 1) / (maxTickCount - 1);
	const magnitude = Math.max(1, 10 ** Math.floor(Math.log10(roughStep)));
	const step =
		(COUNT_TICK_STEP_MULTIPLIERS.find(
			(multiplier) => multiplier * magnitude >= roughStep,
		) ?? 10) * magnitude;
	const tickCount = Math.max(1, Math.ceil(maxCount / step));

	return R.range(0, tickCount + 1).map((multiple) => multiple * step);
}

function roundedTopBarPath({
	x,
	y,
	width,
	height,
}: {
	x: number;
	y: number;
	width: number;
	height: number;
}) {
	const radius = Math.min(BAR_RADIUS_PX, width / 2, height);

	return [
		`M${x} ${y + height}`,
		`V${y + radius}`,
		`Q${x} ${y} ${x + radius} ${y}`,
		`H${x + width - radius}`,
		`Q${x + width} ${y} ${x + width} ${y + radius}`,
		`V${y + height}`,
		"Z",
	].join(" ");
}
