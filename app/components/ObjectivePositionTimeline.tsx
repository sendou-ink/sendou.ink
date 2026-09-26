/**
 * Tug-of-war chart of a Tower Control / Rainmaker objective along its track: the middle line is
 * the start, up is toward the end alpha pushes to and fills in alpha's color, down toward bravo's
 * goal in bravo's. Shares the objective chart's x-axis and y-label gutter so both line up.
 */

import {
	Chart as ChartJS,
	Filler,
	LinearScale,
	LineElement,
	PointElement,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useThemeColors } from "~/hooks/useThemeColors";
import styles from "./ObjectivePositionTimeline.module.css";
import type { ObjectiveTimelineEvent } from "./ObjectiveTimeline";
import { TIMELINE_PLOT_GUTTER_PX, withAlpha } from "./objective-timeline-utils";

ChartJS.register(LinearScale, PointElement, LineElement, Filler);

const TRACK_END = 100;

export function ObjectivePositionTimeline({
	events,
	domain,
}: {
	/** sorted by `t`; events without a position read are skipped */
	events: readonly ObjectiveTimelineEvent[];
	domain: [number, number];
}) {
	const colors = useThemeColors({
		alpha: "--color-chart-alpha",
		bravo: "--color-chart-bravo",
		border: "--color-border",
		borderHigh: "--color-border-high",
		text: "--color-text-high",
	});
	const points = events.flatMap((event) =>
		event.data.position != null ? [{ x: event.t, y: event.data.position }] : [],
	);
	if (points.length === 0) return null;

	return (
		<div className={styles.container}>
			<Line
				data={{
					datasets: [
						{
							data: points,
							borderColor: colors.text,
							borderWidth: 1.5,
							pointRadius: 0,
							pointHoverRadius: 0,
							fill: {
								target: { value: 0 },
								above: withAlpha(colors.alpha, 0.45),
								below: withAlpha(colors.bravo, 0.45),
							},
						},
					],
				}}
				options={{
					animation: false,
					maintainAspectRatio: false,
					events: [],
					layout: { autoPadding: false },
					scales: {
						x: {
							type: "linear",
							min: domain[0],
							max: domain[1],
							grid: { color: colors.border },
							border: { color: colors.borderHigh },
							// same tick limit as the objective chart so the gridlines line up
							ticks: { display: false, maxTicksLimit: 8 },
						},
						y: {
							min: -TRACK_END,
							max: TRACK_END,
							grid: {
								color: (ctx) =>
									ctx.tick?.value === 0 ? colors.borderHigh : colors.border,
							},
							border: { color: colors.borderHigh },
							afterBuildTicks: (axis) => {
								axis.ticks = [
									{ value: -TRACK_END },
									{ value: 0 },
									{ value: TRACK_END },
								];
							},
							afterFit: (axis) => {
								axis.width = TIMELINE_PLOT_GUTTER_PX;
							},
							ticks: {
								color: colors.text,
								autoSkip: false,
								callback: (value) => Math.abs(Number(value)),
							},
						},
					},
					plugins: {
						legend: { display: false },
						tooltip: { enabled: false },
					},
				}}
			/>
		</div>
	);
}
