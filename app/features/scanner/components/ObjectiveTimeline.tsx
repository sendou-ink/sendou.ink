/**
 * Step-line chart of a match's objective-counter reads: one line per team
 * (remaining count over match time, so lines fall toward 0), solid while
 * that team is in control and dashed while it is not, with penalty and
 * control state in the shared hover tooltip. Rendered inside a match card's
 * expanded view instead of one event card per counter tick.
 *
 * Series colors are scanner-local chart tokens (styles.css) — the theme's
 * text-tier colors are too pastel to tell apart as marks; these are the
 * same two hues re-stepped per theme and validated for CVD separation and
 * surface contrast.
 */

import {
	Chart as ChartJS,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useThemeColors } from "~/hooks/useThemeColors";
import type { ObjectiveData } from "../core/detectors/objective/index";
import { formatClock, formatTime } from "./format";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

const TEAM_LABELS = ["Alpha", "Bravo"] as const;

export interface ObjectiveTimelineEvent {
	t: number;
	data: ObjectiveData;
}

export function ObjectiveTimeline({
	events,
}: {
	events: readonly ObjectiveTimelineEvent[];
}) {
	const colors = useThemeColors({
		alpha: "--scanner-chart-alpha",
		bravo: "--scanner-chart-bravo",
		border: "--color-border",
		borderHigh: "--color-border-high",
		text: "--color-text-high",
	});
	const sorted = [...events].sort((a, b) => a.t - b.t);
	if (sorted.length === 0) return null;

	const teamColors = [colors.alpha, colors.bravo];
	const datasets = ([0, 1] as const).map((side) => ({
		label: TEAM_LABELS[side],
		data: sorted.map((event) => ({
			x: event.t,
			y: event.data.score[side],
		})),
		borderColor: teamColors[side],
		backgroundColor: teamColors[side],
		pointBackgroundColor: teamColors[side],
		pointBorderColor: teamColors[side],
		borderWidth: 2,
		pointRadius: 0,
		pointHoverRadius: 4,
		hitRadius: 20,
		stepped: "after" as const,
		// dashed while the team is not in control, solid while it is
		segment: {
			borderDash: (ctx: { p0DataIndex: number }) =>
				sorted[ctx.p0DataIndex]?.data.control[side] ? undefined : [4, 4],
		},
	}));

	return (
		<div className="card objective-timeline">
			<Line
				data={{ datasets }}
				options={{
					animation: false,
					maintainAspectRatio: false,
					interaction: { mode: "index", intersect: false },
					scales: {
						x: {
							type: "linear",
							min: sorted[0]!.t,
							max: sorted[sorted.length - 1]!.t,
							grid: { color: colors.border },
							border: { color: colors.borderHigh },
							ticks: {
								color: colors.text,
								maxRotation: 0,
								maxTicksLimit: 8,
								callback: (value) => formatTime(Number(value)),
							},
						},
						y: {
							min: 0,
							max: 100,
							grid: { color: colors.border },
							border: { color: colors.borderHigh },
							ticks: { color: colors.text, stepSize: 25 },
						},
					},
					plugins: {
						legend: {
							labels: {
								color: colors.text,
								boxWidth: 10,
								boxHeight: 10,
							},
						},
						tooltip: {
							callbacks: {
								title: (items) => {
									if (!items[0]) return "";
									const clock = sorted[items[0].dataIndex]?.data.time;
									return `${formatTime(items[0].parsed.x ?? 0)}${clock != null ? ` · ${formatClock(clock)} left` : ""}`;
								},
								label: (item) => {
									const event = sorted[item.dataIndex];
									if (!event) return "";
									const side = item.datasetIndex as 0 | 1;
									const { score, penalty, control } = event.data;
									return [
										`${TEAM_LABELS[side]}: ${score[side] ?? "?"}`,
										penalty[side] !== null ? `+${penalty[side]} penalty` : null,
										control[side] ? "in control" : null,
									]
										.filter(Boolean)
										.join(" · ");
								},
							},
						},
					},
				}}
			/>
		</div>
	);
}
