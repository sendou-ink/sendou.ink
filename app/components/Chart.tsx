import clsx from "clsx";
import * as React from "react";
import { Line } from "react-chartjs-2";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./Chart.module.css";
import { useRef } from "react";

import {
	type Chart as ChartType,
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	TimeScale,
	PointElement,
	LineElement,
	Tooltip,
} from "chart.js";
import "chartjs-adapter-date-fns";

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
		{ label: string; data: Array<{ primary: Date; secondary: number }> },
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

	if (!isHydrated) {
		return <div className={clsx(styles.container, containerClassName)} />;
	}

	// Get the line colors to be different
	const colors = ["--color-text-accent", "--color-accent", "--color-info"].map(
		(v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()
	);

	const chartData = React.useMemo(() => ({
		labels: options[0].data.map((d) => d.primary),
		datasets: options.map((series, i) => ({
			label: series.label,
			data: series.data.map((d) => d.secondary),
			borderColor: colors[i % colors.length],
			pointRadius: 0,
			pointHoverRadius: 4,
			hitRadius: 10,
			backgroundColor: "transparent",
			tension: 0.3,
		})),
	}), [options]);

	return (
		<div className={clsx(styles.container, containerClassName)}>
			<Line
				ref={chartRef}
				id={chartId}
				data={chartData}
				options={{
					maintainAspectRatio: true,
					scales: {
						x: {
							grid: { color: "rgba(255,255,255,0.1)" },
							type: xAxis === "localTime" ? "time" : "linear",
							time: {
								tooltipFormat: "EEE d/M",
								displayFormats: { day: "d/M" },
							},
						},
						y: {
							grid: { color: "rgba(255,255,255,0.1)" },
						},
					},
					plugins: {
						tooltip: {
							callbacks: {
								title: (items) => {
									const x = items[0].parsed.x;
									if (x == null) return "";
									return `${x}${headerSuffix ?? ""}`;
								},
								label: (item) => {
									return `${item.dataset.label}: ${item.parsed.y}${valueSuffix ?? ""}`;
								},
							},
						},
					},
				}}
			/>
		</div>
	);
}
