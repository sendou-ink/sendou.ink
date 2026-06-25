import {
	CategoryScale,
	Chart as ChartJS,
	type Chart as ChartType,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js";
import clsx from "clsx";
import * as React from "react";
import { useRef } from "react";
import { Line } from "react-chartjs-2";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./Chart.module.css";

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Tooltip,
);

export default function Chart({
	options,
	containerClassName,
	headerSuffix,
	valueSuffix,
	xAxis,
	xTicksLimit,
	yTicksLimit,
	xAbilityLimit,
	highlight,
	crosshair = false,
}: {
	options: [
		{
			label: React.ReactNode;
			data: Array<{ primary: Date | number; secondary: number }>;
		},
	];
	containerClassName?: string;
	headerSuffix?: string;
	valueSuffix?: string;
	xAxis: "linear" | "localTime";
	xTicksLimit?: number;
	yTicksLimit?: number;
	xAbilityLimit?: number;
	/** Marks current positions on the curve, each at ability point `x` and stat value `y` (e.g. one per build being compared). */
	highlight?: Array<{ x: number; y: number }>;
	/** When true, draws dashed guide lines from the hovered point to the x- and y-axes. */
	crosshair?: boolean;
}) {
	const isHydrated = useHydrated();

	// Ref to the Chart.js instance, allows proper cleanup between renders to prevent "Canvas is already in use" errors
	const chartRef = useRef<ChartType<"line"> | null>(null);
	const chartId = React.useId();
	// Chart.js re-fires the external tooltip on every redraw; track the last value to skip redundant state updates
	const lastTooltipSignature = useRef<string | null>(null);
	const [tooltipData, setTooltipData] = React.useState<{
		x: number;
		y: number;
		flipX: boolean;
		flipY: boolean;
		items: Array<{
			label: React.ReactNode;
			value: number | null;
			color: string;
		}>;
		header: string;
	} | null>(null);

	// Format dates in the tooltip header using the user's locale
	const { formatter: headerFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
		month: "numeric",
	});

	// Format dates on the xAxis
	const { formatter: scaleFormatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
	});

	// Get the chart colors from CSS variables
	const [colors, setColors] = React.useState({
		accentHigh: "",
		infoHigh: "",
		secondHigh: "",
		accentLow: "",
		secondLow: "",
		border: "",
		borderHigh: "",
		text: "",
	});

	React.useEffect(() => {
		const resolve = () => {
			const get = (v: string) =>
				getComputedStyle(document.documentElement).getPropertyValue(v).trim();
			setColors({
				// bright "high" variants for the curve lines so they stay legible on the dark chart
				accentHigh: get("--color-text-accent"),
				infoHigh: get("--color-info-high"),
				secondHigh: get("--color-second-high"),
				// low variants for the highlight marker fills (paired with a light border)
				accentLow: get("--color-accent-low"),
				secondLow: get("--color-second-low"),
				border: get("--color-border"),
				borderHigh: get("--color-border-high"),
				text: get("--color-text-high"),
			});
		};

		resolve();

		const root = document.documentElement;
		const observer = new MutationObserver(resolve);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	const scaleDefaults = React.useMemo(
		() => ({
			grid: { color: colors.border },
			border: { color: colors.borderHigh },
			ticks: { color: colors.text },
		}),
		[colors.border, colors.borderHigh, colors.text],
	);

	// Make a color list to use inside ChartData for the borderColor and the external tooltip
	const colorList = React.useMemo(
		() => [colors.accentHigh, colors.infoHigh, colors.secondHigh],
		[colors.accentHigh, colors.infoHigh, colors.secondHigh],
	);

	// Distinct accent/secondary pair so the highlight markers (e.g. build 1 vs build 2) stay tellable apart in both themes
	const markerColors = React.useMemo(
		() => [colors.accentLow, colors.secondLow],
		[colors.accentLow, colors.secondLow],
	);

	const datasetColors = React.useCallback(
		(i: number) => {
			const color = colorList[i % colorList.length];
			return {
				borderColor: color,
				pointBackgroundColor: color,
				pointBorderColor: color,
				pointHoverBackgroundColor: color,
				pointHoverBorderColor: color,
			};
		},
		[colorList],
	);

	const chartData = React.useMemo(
		() => ({
			labels: options[0].data.map((_, i) => i),
			datasets: [
				...options.map((series, i) => ({
					label: String(i),
					data: series.data.map((d) => d.secondary),
					...datasetColors(i),
					pointRadius: 0,
					pointHoverRadius: 5,
					hitRadius: 50,
					backgroundColor: "transparent",
				})),
				...(highlight ?? []).map((point, i) => ({
					label: "highlight",
					data: options[0].data.map((_, j) => (j === point.x ? point.y : null)),
					borderColor: "transparent",
					backgroundColor: "transparent",
					pointBackgroundColor: markerColors[i % markerColors.length],
					pointBorderColor: colors.text,
					pointBorderWidth: 2,
					pointRadius: 5,
					pointHoverRadius: 5,
					pointHitRadius: 0,
					showLine: false,
					// lower order draws on top, so the marker sits above the curves
					order: -1,
				})),
			],
		}),
		[options, datasetColors, highlight, markerColors, colors.text],
	);

	// Draws dashed guide lines from the hovered point to the y-axis (left) and x-axis (bottom)
	const crosshairPlugin = React.useMemo(
		() => ({
			id: "crosshair",
			afterDatasetsDraw: (chart: ChartType<"line">) => {
				const active = chart.tooltip?.getActiveElements() ?? [];
				if (active.length === 0) return;

				const { ctx, chartArea } = chart;
				const { x, y } = active[0].element as { x: number; y: number };

				ctx.save();
				ctx.beginPath();
				ctx.setLineDash([4, 4]);
				ctx.lineWidth = 1;
				ctx.strokeStyle = colors.borderHigh || "#888";
				ctx.moveTo(chartArea.left, y);
				ctx.lineTo(x, y);
				ctx.lineTo(x, chartArea.bottom);
				ctx.stroke();
				ctx.restore();
			},
		}),
		[colors.borderHigh],
	);

	const plugins = React.useMemo(
		() => (crosshair ? [crosshairPlugin] : []),
		[crosshair, crosshairPlugin],
	);

	if (!isHydrated) {
		return <div className={clsx(styles.container, containerClassName)} />;
	}

	return (
		<div
			className={clsx(styles.container, containerClassName)}
			style={{ position: "relative" }}
		>
			<Line
				ref={chartRef}
				id={chartId}
				data={chartData}
				plugins={plugins}
				options={{
					animation: false,
					maintainAspectRatio: false,
					scales: {
						x: {
							...scaleDefaults,
							max: xAbilityLimit,
							type: "linear",
							ticks: {
								...scaleDefaults.ticks,
								maxRotation: 0,
								maxTicksLimit: xTicksLimit,
								callback: (value) => {
									if (xAxis === "localTime") {
										const date = options[0].data[value as number]?.primary;
										if (date instanceof Date) {
											return scaleFormatter.format(date);
										}
									}
									return value;
								},
							},
						},
						y: {
							...scaleDefaults,
							ticks: {
								...scaleDefaults.ticks,
								maxTicksLimit: yTicksLimit,
							},
						},
					},
					plugins: {
						tooltip: {
							enabled: false,
							external: ({ chart, tooltip }) => {
								if (tooltip.opacity === 0) {
									lastTooltipSignature.current = null;
									setTooltipData(null);
									return;
								}
								// the highlight marker has no entry in `options` and is non-interactive
								const dataPoints = tooltip.dataPoints.filter(
									(dp) => dp.datasetIndex < options.length,
								);
								if (dataPoints.length === 0) {
									lastTooltipSignature.current = null;
									setTooltipData(null);
									return;
								}
								const x = tooltip.caretX;
								const y = tooltip.caretY;
								const items = dataPoints.map((dp) => ({
									label: options[dp.datasetIndex].label,
									value: dp.parsed.y,
									color: colorList[dp.datasetIndex % colorList.length],
								}));
								const rawPrimary =
									options[0].data[dataPoints[0].dataIndex]?.primary;
								const header =
									rawPrimary instanceof Date
										? headerFormatter.format(rawPrimary) + (headerSuffix ?? "")
										: `${dataPoints[0].parsed.x}${headerSuffix ?? ""}`;

								// skip redundant updates from repeated redraws to avoid an infinite render loop
								const signature = `${x}|${y}|${header}|${items
									.map((i) => `${i.value}:${i.color}`)
									.join(",")}`;
								if (signature === lastTooltipSignature.current) return;
								lastTooltipSignature.current = signature;

								setTooltipData({
									x,
									y,
									flipX: x > chart.width / 2,
									flipY: y > chart.height / 2,
									header,
									items,
								});
							},
						},
					},
				}}
			/>
			{tooltipData && (
				<div
					className={styles.tooltip}
					style={{
						position: "absolute",
						left: tooltipData.x,
						top: tooltipData.y,
						transform: `translate(${
							tooltipData.flipX ? "calc(-100% - 8px)" : "8px"
						}, ${tooltipData.flipY ? "-100%" : "0"})`,
						pointerEvents: "none",
					}}
				>
					<h3 className="text-center text-md">{tooltipData.header}</h3>
					{tooltipData.items.map((item, i) => (
						<div key={i} className="stack horizontal items-center sm">
							<div
								className={styles.dot}
								style={{ "--dot-color": item.color } as React.CSSProperties}
							/>
							<div>{item.label}</div>
							<div className={styles.tooltipValue}>
								{item.value}
								{valueSuffix}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
