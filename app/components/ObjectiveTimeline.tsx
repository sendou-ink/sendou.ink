/**
 * Line chart of a game's objective-counter reads, one falling line per team. Control is a state,
 * not a count, so it gets its own lane below the zero gridline (strip in the controlling team's
 * color); penalty is a translucent band between score and score + penalty, so its thickness is
 * the extra count to burn through. Series colors are the chart tokens from vars.css: the text-tier
 * colors are too pastel to tell apart as marks.
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
import { useTranslation } from "react-i18next";
import { useThemeColors } from "~/hooks/useThemeColors";
import styles from "./ObjectiveTimeline.module.css";
import {
	formatElapsed,
	smoothPenalties,
	TIMELINE_PLOT_GUTTER_PX,
} from "./objective-timeline-utils";

ChartJS.register(
	LinearScale,
	PointElement,
	LineElement,
	Filler,
	Tooltip,
	Legend,
);

/** count-axis units of gutter kept below zero for the control lane */
const CONTROL_LANE_DEPTH = 13;
const CONTROL_LANE_Y = -6;
const CONTROL_LANE_WIDTH = 6;
const COUNT_TICK_STEP = 25;

/** One objective-counter read, values in `[alpha, bravo]` order. */
export interface ObjectiveTimelineSample {
	/** seconds shown on the match timer at the read ("3:35" = 215); null = unreadable */
	time: number | null;
	/** displayed count per team; null = unreadable */
	score: [number | null, number | null];
	/** penalty pill value per team; null = no pill (or unreadable) */
	penalty: [number | null, number | null];
	/** which team held the objective at the read */
	control: [boolean, boolean];
}

export interface ObjectiveTimelineEvent {
	/** whole seconds into the source (video, stream or game) the read was made at */
	t: number;
	data: ObjectiveTimelineSample;
}

export function ObjectiveTimeline({
	events,
	teamLabels,
	domain,
	showTooltip = true,
}: {
	events: readonly ObjectiveTimelineEvent[];
	teamLabels: readonly [string, string];
	/** x-axis range override, to share the player-status timeline's axis */
	domain?: [number, number];
	/** off when a parent renders its own scrub readout over the chart */
	showTooltip?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const colors = useThemeColors({
		alpha: "--color-chart-alpha",
		bravo: "--color-chart-bravo",
		border: "--color-border",
		borderHigh: "--color-border-high",
		text: "--color-text-high",
	});
	const sorted = events.toSorted((a, b) => a.t - b.t);
	if (sorted.length === 0) return null;

	const teamColors = [colors.alpha, colors.bravo];
	const scoreDatasets = ([0, 1] as const).map((side) => ({
		label: teamLabels[side],
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
	// strip along the lane while the team is in control; the losing edge is
	// kept in the lane too so the strip extends exactly to where control ended
	const controlDatasets = ([0, 1] as const).map((side) => ({
		label: `${teamLabels[side]} control`,
		data: sorted.map((event, i) => ({
			x: event.t,
			y:
				event.data.control[side] || sorted[i - 1]?.data.control[side]
					? CONTROL_LANE_Y
					: null,
		})),
		borderColor: teamColors[side],
		borderWidth: CONTROL_LANE_WIDTH,
		borderCapStyle: "round" as const,
		pointRadius: 0,
		pointHoverRadius: 0,
		hitRadius: 0,
		spanGaps: false,
		stepped: "after" as const,
	}));
	// band between score and score + penalty; its thickness is the penalty
	const penaltyDatasets = ([0, 1] as const).map((side) => {
		const penalties = smoothPenalties(
			sorted.map((event) => ({
				t: event.t,
				penalty: event.data.penalty[side],
			})),
		);
		let lastScore: number | null = null;
		return {
			label: `${teamLabels[side]} penalty`,
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
		<div className={styles.container}>
			<Line
				data={{ datasets }}
				options={{
					animation: false,
					maintainAspectRatio: false,
					interaction: { mode: "index", intersect: false },
					layout: { autoPadding: false },
					scales: {
						x: {
							type: "linear",
							min: domain?.[0] ?? sorted[0]!.t,
							max: domain?.[1] ?? sorted[sorted.length - 1]!.t,
							grid: { color: colors.border },
							border: { color: colors.borderHigh },
							ticks: {
								color: colors.text,
								maxRotation: 0,
								maxTicksLimit: 8,
								align: "inner",
								callback: (value) => formatElapsed(Number(value)),
							},
						},
						y: {
							min: -CONTROL_LANE_DEPTH,
							suggestedMax: 100,
							bounds: "data",
							grid: {
								color: (ctx) => gridColor(ctx.tick?.value ?? 0, colors),
								tickColor: (ctx) => gridColor(ctx.tick?.value ?? 0, colors),
							},
							border: { color: colors.borderHigh },
							afterBuildTicks: (axis) => {
								axis.ticks = countAxisTicks(axis.max);
							},
							afterFit: (axis) => {
								axis.width = TIMELINE_PLOT_GUTTER_PX;
							},
							ticks: { color: colors.text, autoSkip: false },
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
							enabled: showTooltip,
							filter: (item) => item.datasetIndex < 2,
							callbacks: {
								title: (items) => {
									if (!items[0]) return "";
									const clock = sorted[items[0].dataIndex]?.data.time;
									const elapsed = formatElapsed(items[0].parsed.x ?? 0);
									return clock != null
										? `${elapsed} · ${t("common:objectiveTimeline.timeLeft", {
												time: formatClock(clock),
											})}`
										: elapsed;
								},
								label: (item) => {
									const event = sorted[item.dataIndex];
									if (!event) return "";
									const side = item.datasetIndex as 0 | 1;
									const { score, penalty, control } = event.data;
									return [
										`${teamLabels[side]}: ${score[side] ?? "?"}`,
										penalty[side] !== null
											? t("common:objectiveTimeline.penalty", {
													value: penalty[side],
												})
											: null,
										control[side]
											? t("common:objectiveTimeline.inControl")
											: null,
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

/** One tick every 25 up to the top of the data, none below zero so the control gutter stays clean. */
function countAxisTicks(max: number) {
	const ticks = [];
	for (let value = 0; value <= max; value += COUNT_TICK_STEP) {
		ticks.push({ value });
	}
	return ticks;
}

/** zero divides counts from the lane, so it is drawn stronger; the gutter has no grid */
function gridColor(
	value: number,
	colors: { border: string; borderHigh: string },
) {
	if (value < 0) return "transparent";
	return value === 0 ? colors.borderHigh : colors.border;
}

/** the match timer's M:SS (215 → "3:35") */
function formatClock(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const rest = String(Math.floor(seconds % 60)).padStart(2, "0");
	return `${minutes}:${rest}`;
}
