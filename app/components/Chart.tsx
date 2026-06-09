import clsx from "clsx";
import * as React from "react";
import { Line } from "react-chartjs-2";

// import { type AxisOptions, Chart as ReactChart } from "react-charts";
// import type { TooltipRendererProps } from "react-charts/types/components/TooltipRenderer";
// import { useTheme } from "~/features/theme/core/provider";
// import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";

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

	const chartData = React.useMemo(() => ({
		labels: options[0].data.map((d) => d.primary),
		datasets: options.map((series) => ({
			label: series.label,
			data: series.data.map((d) => d.secondary),
			borderColor: "var(--color-text-accent)",
			backgroundColor: "transparent",
			tension: 0.3,
		})),
	}), [options]);

	if (!isHydrated) {
		return <div className={clsx(styles.container, containerClassName)} />;
	}

	return (
		<div className={clsx(styles.container, containerClassName)}>
			<Line
				ref={chartRef}
				id={chartId}
				data={chartData}
				options={{
					scales: {
						x: {
							type: xAxis === "localTime" ? "time" : "linear",
							time: {
								tooltipFormat: "EEE d/M",
								displayFormats: { day: "d/M" },
							},
						},
					},
					plugins: {
						tooltip: { enabled: true }, // replace with custom later
					},
				}}
			/>
		</div>
	);
}
