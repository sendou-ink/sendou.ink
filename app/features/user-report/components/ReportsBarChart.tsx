import {
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	LinearScale,
	Tooltip,
} from "chart.js";
import { format } from "date-fns";
import * as React from "react";
import { Bar } from "react-chartjs-2";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./ReportsBarChart.module.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

/**
 * Bar graph of reports made against a user, one bar per calendar month.
 * Theme colors are read from CSS variables like `app/components/Chart.tsx` does.
 */
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

	const [colors, setColors] = React.useState({
		bar: "",
		border: "",
		borderHigh: "",
		text: "",
	});

	React.useEffect(() => {
		const resolve = () => {
			const get = (v: string) =>
				getComputedStyle(document.documentElement).getPropertyValue(v).trim();
			setColors({
				bar: get("--color-text-accent"),
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

	if (!isHydrated) {
		return <div className={styles.container} />;
	}

	const scaleDefaults = {
		grid: { color: colors.border },
		border: { color: colors.borderHigh },
		ticks: { color: colors.text },
	};

	return (
		<div className={styles.container}>
			<Bar
				data={{
					labels: monthlyCounts.map(({ month }) =>
						format(new Date(month), "MMM yy"),
					),
					datasets: [
						{
							data: monthlyCounts.map(({ count }) => count),
							backgroundColor: colors.bar,
						},
					],
				}}
				options={{
					animation: false,
					maintainAspectRatio: false,
					scales: {
						x: {
							...scaleDefaults,
							grid: { display: false },
							ticks: { ...scaleDefaults.ticks, maxRotation: 0 },
						},
						y: {
							...scaleDefaults,
							beginAtZero: true,
							ticks: { ...scaleDefaults.ticks, precision: 0 },
						},
					},
					plugins: {
						legend: { display: false },
					},
				}}
			/>
		</div>
	);
}
