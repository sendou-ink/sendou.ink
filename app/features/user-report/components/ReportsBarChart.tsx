import {
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	LinearScale,
	Tooltip,
} from "chart.js";
import { format } from "date-fns";
import { Bar } from "react-chartjs-2";
import { useHydrated } from "~/hooks/useHydrated";
import { useThemeColors } from "~/hooks/useThemeColors";
import styles from "./ReportsBarChart.module.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

/** One bar per calendar month. Theme colors come from CSS variables like `app/components/Chart.tsx`. */
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

	const colors = useThemeColors({
		bar: "--color-text-accent",
		border: "--color-border",
		borderHigh: "--color-border-high",
		text: "--color-text-high",
	});

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
