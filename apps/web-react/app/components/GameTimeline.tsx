/**
 * A game's two scanned-timeline charts stacked on one shared time axis and
 * plot width: per-player status bands above the objective-counter chart.
 * Hovering scrubs over both — a dotted cursor line spans the charts and a
 * readout next to the cursor shows the moment's elapsed time, match clock,
 * scores, penalties, who was in control, who was splatted and who had their
 * special ready. The chart's own tooltip is turned off in favor of the
 * readout.
 */
import clsx from "clsx";
import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clamp } from "remeda";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import styles from "./GameTimeline.module.css";
import { Image, WeaponImage } from "./Image";
import {
	ObjectiveTimeline,
	type ObjectiveTimelineEvent,
} from "./ObjectiveTimeline";
import {
	formatElapsed,
	smoothPenalties,
	TIMELINE_PLOT_GUTTER_PX,
} from "./objective-timeline-utils";
import {
	PLAYER_STATUS_TAIL_SECONDS,
	PlayerStatusTimeline,
	type PlayerStatusTimelineSample,
	type PlayerStatusTimelineTeam,
	statusSpans,
} from "./PlayerStatusTimeline";

/** Cursor position past this fraction of the plot flips the readout to its left side. */
const READOUT_FLIP_RATIO = 0.55;
const READOUT_CURSOR_GAP_PX = 12;

interface GameTimelineProps {
	objectiveEvents?: readonly ObjectiveTimelineEvent[];
	playerStatusSamples?: readonly PlayerStatusTimelineSample[];
	teams: readonly [PlayerStatusTimelineTeam, PlayerStatusTimelineTeam];
}

interface ScrubPosition {
	/** px from the plot area's left edge */
	x: number;
	/** px from the plot area's top edge */
	y: number;
	width: number;
	/** touch scrubs pin the readout to the top so the finger doesn't hide it */
	pinned: boolean;
}

export function GameTimeline({
	objectiveEvents,
	playerStatusSamples,
	teams,
}: GameTimelineProps) {
	const [scrub, setScrub] = useState<ScrubPosition | null>(null);
	const plotRef = useRef<HTMLDivElement>(null);

	const objective = (objectiveEvents ?? []).toSorted((a, b) => a.t - b.t);
	const samples = (playerStatusSamples ?? []).toSorted((a, b) => a.t - b.t);
	const domain = timelineDomain(objective, samples);
	if (!domain) return null;

	const handlePointer = (event: React.PointerEvent) => {
		const rect = plotRef.current?.getBoundingClientRect();
		if (!rect || rect.width <= 0) return;
		setScrub({
			x: clamp(event.clientX - rect.left, { min: 0, max: rect.width }),
			y: clamp(event.clientY - rect.top, { min: 0, max: rect.height }),
			width: rect.width,
			pinned: event.pointerType === "touch",
		});
	};

	return (
		<div
			className={styles.root}
			style={
				{
					"--plot-gutter": `${TIMELINE_PLOT_GUTTER_PX}px`,
				} as React.CSSProperties
			}
			onPointerDown={handlePointer}
			onPointerMove={handlePointer}
			onPointerLeave={(event) => {
				// touch fires a leave as the finger lifts; keep the readout up instead
				if (event.pointerType !== "touch") setScrub(null);
			}}
		>
			<TimelineCharts
				objectiveEvents={objectiveEvents}
				playerStatusSamples={playerStatusSamples}
				teams={teams}
			/>
			<div className={styles.plotOverlay} ref={plotRef}>
				{scrub ? (
					<ScrubReadout
						scrub={scrub}
						domain={domain}
						objective={objective}
						samples={samples}
						teams={teams}
					/>
				) : null}
			</div>
		</div>
	);
}

/** Memoized so scrubbing re-renders only the overlay, not the chart canvas. */
const TimelineCharts = memo(function TimelineCharts({
	objectiveEvents,
	playerStatusSamples,
	teams,
}: GameTimelineProps) {
	const objective = (objectiveEvents ?? []).toSorted((a, b) => a.t - b.t);
	const samples = (playerStatusSamples ?? []).toSorted((a, b) => a.t - b.t);
	const domain = timelineDomain(objective, samples);
	if (!domain) return null;

	return (
		<>
			{samples.length > 0 ? (
				<PlayerStatusTimeline samples={samples} teams={teams} domain={domain} />
			) : null}
			{objective.length > 0 ? (
				<ObjectiveTimeline
					events={objective}
					teamLabels={[teams[0].label, teams[1].label]}
					domain={domain}
					showTooltip={false}
				/>
			) : null}
		</>
	);
});

function ScrubReadout({
	scrub,
	domain,
	objective,
	samples,
	teams,
}: {
	scrub: ScrubPosition;
	domain: [number, number];
	objective: readonly ObjectiveTimelineEvent[];
	samples: readonly PlayerStatusTimelineSample[];
	teams: GameTimelineProps["teams"];
}) {
	const { t } = useTranslation(["common"]);
	const [min, max] = domain;
	const time = min + (scrub.x / scrub.width) * (max - min);
	const objectiveNow = objectiveStateAt(objective, time);
	const statusNow = playerStatusAt(samples, time);
	const flipped = scrub.x > scrub.width * READOUT_FLIP_RATIO;

	return (
		<>
			<div className={styles.scrubLine} style={{ left: scrub.x }} />
			<div
				className={clsx(styles.readout, {
					[styles.readoutPinned]: scrub.pinned,
				})}
				style={
					scrub.pinned
						? undefined
						: {
								top: scrub.y,
								left: flipped ? undefined : scrub.x + READOUT_CURSOR_GAP_PX,
								right: flipped
									? scrub.width - scrub.x + READOUT_CURSOR_GAP_PX
									: undefined,
							}
				}
			>
				<div className={styles.readoutTitle}>
					{formatElapsed(time)}
					{objectiveNow?.clock != null
						? ` · ${t("common:objectiveTimeline.timeLeft", {
								time: formatElapsed(objectiveNow.clock),
							})}`
						: null}
				</div>
				{([0, 1] as const).map((side) => (
					<div key={side} className={styles.readoutTeam}>
						<div className={styles.readoutTeamHeader}>
							<span
								className={clsx(
									styles.swatch,
									side === 0 ? styles.swatchAlpha : styles.swatchBravo,
								)}
							/>
							<span className={styles.readoutTeamName}>
								{teams[side].label}
							</span>
							{objectiveNow ? (
								<span className={styles.readoutScore}>
									{objectiveNow.scores[side] ?? "?"}
								</span>
							) : null}
							{objectiveNow?.penalties[side] != null ? (
								<span className={styles.readoutPenalty}>
									{t("common:objectiveTimeline.penalty", {
										value: objectiveNow.penalties[side],
									})}
								</span>
							) : null}
							{objectiveNow?.control[side] ? (
								<span className={styles.readoutControl}>
									{t("common:objectiveTimeline.inControl")}
								</span>
							) : null}
						</div>
						{statusNow ? (
							<>
								<StatusWeaponsRow
									label={t("common:playerStatusTimeline.splatted")}
									kind="dead"
									slots={statusNow.dead[side]}
									weapons={teams[side].weapons}
								/>
								<StatusWeaponsRow
									label={t("common:playerStatusTimeline.specialReady")}
									kind="special"
									slots={statusNow.special[side]}
									weapons={teams[side].weapons}
								/>
							</>
						) : null}
					</div>
				))}
			</div>
		</>
	);
}

function StatusWeaponsRow({
	label,
	kind,
	slots,
	weapons,
}: {
	label: string;
	kind: "dead" | "special";
	slots: number[];
	weapons: (MainWeaponId | null)[];
}) {
	if (slots.length === 0) return null;

	return (
		<div className={styles.readoutStatusRow}>
			<span
				className={clsx(
					styles.readoutStatusLabel,
					kind === "dead" ? styles.statusLabelDead : styles.statusLabelSpecial,
				)}
			>
				{label}
			</span>
			<span className={styles.readoutWeapons}>
				{slots.map((slot) =>
					weapons[slot] != null ? (
						<WeaponImage
							key={slot}
							weaponSplId={weapons[slot]}
							variant="badge"
							size={20}
						/>
					) : (
						<Image
							key={slot}
							path={abilityImageUrl("UNKNOWN")}
							alt="?"
							size={20}
							className={styles.unknownWeapon}
						/>
					),
				)}
			</span>
		</div>
	);
}

function timelineDomain(
	objective: readonly ObjectiveTimelineEvent[],
	samples: readonly PlayerStatusTimelineSample[],
): [number, number] | null {
	const start = Math.min(
		objective[0]?.t ?? Number.POSITIVE_INFINITY,
		samples[0]?.t ?? Number.POSITIVE_INFINITY,
	);
	const end = Math.max(
		objective[objective.length - 1]?.t ?? Number.NEGATIVE_INFINITY,
		samples.length > 0
			? samples[samples.length - 1]!.t + PLAYER_STATUS_TAIL_SECONDS
			: Number.NEGATIVE_INFINITY,
	);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	return [start, Math.max(end, start + 1)];
}

interface ObjectiveStateAtTime {
	/** seconds shown on the match timer at the latest read; null = unreadable */
	clock: number | null;
	/** last readable count per team at the scrubbed moment */
	scores: [number | null, number | null];
	penalties: [number | null, number | null];
	control: [boolean, boolean];
}

/** State implied by the last objective read at or before `time`, scores carried across unreadable reads. */
function objectiveStateAt(
	sorted: readonly ObjectiveTimelineEvent[],
	time: number,
): ObjectiveStateAtTime | null {
	let index = -1;
	for (let i = 0; i < sorted.length; i++) {
		if (sorted[i]!.t > time) break;
		index = i;
	}
	if (index === -1) return null;

	const scores: [number | null, number | null] = [null, null];
	for (let i = 0; i <= index; i++) {
		scores[0] = sorted[i]!.data.score[0] ?? scores[0];
		scores[1] = sorted[i]!.data.score[1] ?? scores[1];
	}
	const penalties = ([0, 1] as const).map(
		(side) =>
			smoothPenalties(
				sorted.map((event) => ({
					t: event.t,
					penalty: event.data.penalty[side],
				})),
			)[index] ?? null,
	) as [number | null, number | null];
	const latest = sorted[index]!;

	return {
		clock: latest.data.time,
		scores,
		penalties,
		control: [latest.data.control[0], latest.data.control[1]],
	};
}

interface PlayerStatusAtTime {
	/** slot indexes inside a splatted band at the scrubbed moment, per side */
	dead: [number[], number[]];
	/** slot indexes inside a special-ready band at the scrubbed moment, per side */
	special: [number[], number[]];
}

/** Matches the rendered bands: a player counts only while inside a drawn span. */
function playerStatusAt(
	sorted: readonly PlayerStatusTimelineSample[],
	time: number,
): PlayerStatusAtTime | null {
	if (sorted.length === 0) return null;

	const activeSlots = (side: 0 | 1, kind: "dead" | "special") =>
		[0, 1, 2, 3].filter((slot) =>
			statusSpans(sorted, (sample) => sample[kind][side][slot]!).some(
				(span) => span.start <= time && time <= span.end,
			),
		);

	return {
		dead: [activeSlots(0, "dead"), activeSlots(1, "dead")],
		special: [activeSlots(0, "special"), activeSlots(1, "special")],
	};
}
