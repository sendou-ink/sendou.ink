import {
	CategoryScale,
	Chart as ChartJS,
	type Chart as ChartType,
	LinearScale,
	LineElement,
	PointElement,
	TimeScale,
	Tooltip,
} from "chart.js";
import "chartjs-adapter-date-fns";
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
	TimeScale,
	PointElement,
	LineElement,
	Tooltip,
);

const gridColor = "rgba(255, 255, 255, 0.05)";
const borderColor = "rgba(255, 255, 255, 0.3)";
const ticksColor = "rgba(255, 255, 255, 0.6)";

const scaleDefaults = {
	grid: { color: gridColor },
	border: { color: borderColor },
	ticks: { color: ticksColor },
};

export default function Chart({
	options,
	containerClassName,
	headerSuffix,
	valueSuffix,
	xAxis,
	xTicksLimit,
	yTicksLimit,
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
}) {
	const isHydrated = useHydrated();

	// Ref to the Chart.js instance, allows proper cleanup between renders to prevent "Canvas is already in use" errors
	const chartRef = useRef<ChartType<"line"> | null>(null);
	const chartId = React.useId();
	const [tooltipData, setTooltipData] = React.useState<{
		x: number;
		y: number;
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

	// Get the line colors from CSS variables
	const colors = React.useMemo(() => {
		if (typeof document === "undefined")
			return { accent: "", base: "", info: "" };
		const get = (v: string) =>
			getComputedStyle(document.documentElement).getPropertyValue(v).trim();
		return {
			accent: get("--color-text-accent"),
			base: get("--color-accent"),
			info: get("--color-info"),
		};
	}, []);

	// Make a color list to use inside ChartData for the borderColor and the external tooltip
	const colorList = React.useMemo(
		() => [colors.accent, colors.base, colors.info],
		[colors],
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
			labels: options[0].data.map((d) => d.primary),
			datasets: options.map((series, i) => ({
				label: String(i),
				data: series.data.map((d) => d.secondary),
				...datasetColors(i),
				pointRadius: 0,
				pointHoverRadius: 5,
				hitRadius: 50,
				backgroundColor: "transparent",
			})),
		}),
		[options, datasetColors],
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
				options={{
					animation: false,
					maintainAspectRatio: false,
					scales: {
						x: {
							...scaleDefaults,
							type: xAxis === "localTime" ? "time" : "linear",
							ticks: {
								...scaleDefaults.ticks,
								maxRotation: 0,
								maxTicksLimit: xTicksLimit,
								callback: (value) => {
									if (xAxis === "localTime") {
										const date = new Date(value as number);
										return scaleFormatter.format(date);
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
							external: ({ tooltip }) => {
								if (tooltip.opacity === 0) {
									setTooltipData(null);
									return;
								}
								const items = tooltip.dataPoints.map((dp) => ({
									label: options[dp.datasetIndex].label,
									value: dp.parsed.y,
									color: colorList[dp.datasetIndex % colorList.length],
								}));
								setTooltipData({
									x: tooltip.caretX,
									y: tooltip.caretY,
									header: (() => {
										const raw =
											options[0].data[tooltip.dataPoints[0].dataIndex]?.primary;
										if (raw instanceof Date) {
											return headerFormatter.format(raw) + (headerSuffix ?? "");
										}
										return `${tooltip.dataPoints[0].parsed.x}${headerSuffix ?? ""}`;
									})(),
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
