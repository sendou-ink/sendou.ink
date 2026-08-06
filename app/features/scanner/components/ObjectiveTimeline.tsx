/**
 * Line chart of a match's objective-counter reads: one line per team
 * (remaining count over match time, so lines fall toward 0). Control is a
 * thick strip along the bottom of the chart (y = 0) in the controlling
 * team's color, absent while neither team controls. Penalty is a
 * translucent band filled between score and score + penalty — its thickness
 * is the extra count the team must burn through before its score moves
 * again, so it grows when a penalty lands and shrinks as it counts down.
 * Control state and exact values stay in the shared hover tooltip. Rendered
 * inside a match card's expanded view instead of one event card per counter
 * tick.
 *
 * Series colors are scanner-local chart tokens (styles.css) — the theme's
 * text-tier colors are too pastel to tell apart as marks; these are the
 * same two hues re-stepped per theme and validated for CVD separation and
 * surface contrast.
 */

import {
	Chart as ChartJS,
	Filler,
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

ChartJS.register(
	LinearScale,
	PointElement,
	LineElement,
	Filler,
	Tooltip,
	Legend,
);

const TEAM_LABELS = ["Alpha", "Bravo"] as const;
const PENALTY_BRIDGE_SECONDS = 6;

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
	const scoreDatasets = ([0, 1] as const).map((side) => ({
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
		spanGaps: true,
		cubicInterpolationMode: "monotone" as const,
	}));
	// strip along y = 0 while the team is in control; the losing edge is kept
	// at 0 too so the strip extends exactly to where control ended
	const controlDatasets = ([0, 1] as const).map((side) => ({
		label: `${TEAM_LABELS[side]} control`,
		data: sorted.map((event, i) => ({
			x: event.t,
			y:
				event.data.control[side] || sorted[i - 1]?.data.control[side]
					? 0
					: null,
		})),
		borderColor: teamColors[side],
		borderWidth: 5,
		pointRadius: 0,
		pointHoverRadius: 0,
		hitRadius: 0,
		spanGaps: false,
		stepped: "after" as const,
	}));
	// band between score and score + penalty; its thickness is the penalty
	const penaltyDatasets = ([0, 1] as const).map((side) => {
		const penalties = smoothPenalties(sorted, side);
		let lastScore: number | null = null;
		return {
			label: `${TEAM_LABELS[side]} penalty`,
			data: sorted.map((event, i) => {
				lastScore = event.data.score[side] ?? lastScore;
				return {
					x: event.t,
					y: lastScore === null ? null : lastScore + (penalties[i] ?? 0),
				};
			}),
			borderColor: `${teamColors[side]}8c`,
			backgroundColor: `${teamColors[side]}38`,
			borderWidth: 1,
			pointRadius: 0,
			pointHoverRadius: 0,
			cubicInterpolationMode: "monotone" as const,
			fill: { target: side },
			// edge only where a penalty exists so zero-height bands stay invisible
			segment: {
				borderColor: (ctx: { p0DataIndex: number; p1DataIndex: number }) =>
					(penalties[ctx.p0DataIndex] ?? 0) > 0 ||
					(penalties[ctx.p1DataIndex] ?? 0) > 0
						? undefined
						: "transparent",
			},
		};
	});
	const datasets = [...scoreDatasets, ...penaltyDatasets, ...controlDatasets];

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
							suggestedMax: 100,
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
								filter: (item) => (item.datasetIndex ?? 0) < 2,
							},
						},
						tooltip: {
							filter: (item) => item.datasetIndex < 2,
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

/**
 * The penalty pill is misread for a frame or two at a time: it flickers
 * between a value and null, and occasionally drops a digit ("36" read as
 * "6"). Median-filters isolated outlier values, drops one-off reads with no
 * nearby confirmation and carries the previous value across short null gaps
 * so the band renders as one steady shape instead of a picket fence.
 */
function smoothPenalties(
	sorted: readonly ObjectiveTimelineEvent[],
	side: 0 | 1,
): (number | null)[] {
	const medianFiltered = medianFilterValues(
		sorted.map((event) => event.data.penalty[side]),
	);
	const kept = sorted.map((event, i) => {
		const value = medianFiltered[i]!;
		if (value === null) return null;
		const hasNearbyRead = sorted.some(
			(other, j) =>
				j !== i &&
				other.data.penalty[side] !== null &&
				Math.abs(other.t - event.t) <= PENALTY_BRIDGE_SECONDS,
		);
		return hasNearbyRead ? value : null;
	});

	const result = [...kept];
	let prev = -1;
	for (let i = 0; i < result.length; i++) {
		if (result[i] !== null) {
			prev = i;
			continue;
		}
		if (prev === -1) continue;
		const next = result.findIndex((value, j) => j > i && value !== null);
		if (next === -1) continue;
		if (sorted[next]!.t - sorted[prev]!.t <= PENALTY_BRIDGE_SECONDS) {
			result[i] = result[prev];
		}
	}
	return result;
}

function medianFilterValues(
	values: readonly (number | null)[],
): (number | null)[] {
	const nonNullIndexes = values.flatMap((value, i) =>
		value !== null ? [i] : [],
	);
	const result = [...values];
	for (let k = 1; k < nonNullIndexes.length - 1; k++) {
		const window = [
			values[nonNullIndexes[k - 1]!]!,
			values[nonNullIndexes[k]!]!,
			values[nonNullIndexes[k + 1]!]!,
		].sort((a, b) => a - b);
		result[nonNullIndexes[k]!] = window[1]!;
	}
	return result;
}
