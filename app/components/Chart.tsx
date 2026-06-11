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

export default function Chart({
	options,
	containerClassName,
	headerSuffix,
	valueSuffix,
	xAxis,
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
}) {
	const isHydrated = useHydrated();

	// Ref to the Chart.js instance, allows proper cleanup between renders to prevent "Canvas is already in use" errors
	const chartRef = useRef<ChartType<"line"> | null>(null);

	// Give each chart a unique id
	const chartId = React.useId();

	// Get the tooltip data
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
		if (typeof document === "undefined") return ["", "", ""];
		return ["--color-text-accent", "--color-accent", "--color-info"].map((v) =>
			getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
		);
	}, []);

	// Get the grid color based on the current theme
	const gridColor = React.useMemo(() => {
		if (typeof document === "undefined") return "rgba(255,255,255,0.1)";
		const isDark = document.documentElement.classList.contains("dark");
		return isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)";
	}, []);

	const chartData = React.useMemo(
		() => ({
			labels: options[0].data.map((d) => d.primary),
			datasets: options.map((series, i) => ({
				label: String(i),
				data: series.data.map((d) => d.secondary),
				borderColor: colors[i % colors.length],
				pointRadius: 0,
				pointHoverRadius: 6,
				hitRadius: 40,
				backgroundColor: "transparent",
				tension: 0.3,
			})),
		}),
		[options, colors],
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
					maintainAspectRatio: true,
					scales: {
						x: {
							grid: { color: gridColor },
							type: xAxis === "localTime" ? "time" : "linear",
							ticks: {
								callback: (value) => {
									const date = new Date(value as number);
									return scaleFormatter.format(date);
								},
							},
						},
						y: {
							grid: { color: gridColor },
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
									color: colors[dp.datasetIndex % colors.length],
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
