/**
 * Per-player splatted / special-held bands over a game's scanned icon-strip reads, rendered above
 * the ObjectiveTimeline on the same `t` axis (pass `domain` to share the range). Reads re-confirm
 * an unchanged state every few seconds; a longer gap means the HUD was not observed, so bands never
 * bridge across one. A known POV player gets a highlighted row with their kills as ticks, and the
 * splatted bands those kills opened stand out on the victims' rows.
 */
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import { Image, WeaponImage } from "./Image";
import {
	formatElapsed,
	TIMELINE_PLOT_GUTTER_PX,
} from "./objective-timeline-utils";
import styles from "./PlayerStatusTimeline.module.css";

/** Consecutive reads further apart than this leave an unknown gap. */
const MAX_BRIDGE_SECONDS = 15;

/** Trailing open band drawn this long past its last confirming read. */
export const PLAYER_STATUS_TAIL_SECONDS = 1;

/**
 * The kill-feed row and the victim's crossed-out icon show together, but either read can land a
 * beat late (an ink burst hiding the feed, the strip's ~1s cadence): the victim's splatted band
 * opening within this much of the kill is that kill's.
 */
const KILL_SPLAT_MAX_LEAD_SECONDS = 4;
const KILL_SPLAT_MAX_LAG_SECONDS = 3;

const PLAYER_SLOTS = [0, 1, 2, 3] as const;

type PlayerFlags = readonly [boolean, boolean, boolean, boolean];

/** One icon-strip read, sides in `[alpha, bravo]` order. */
export interface PlayerStatusTimelineSample {
	/** seconds into the source (video, stream or game) the read was made at */
	t: number;
	special: readonly [PlayerFlags, PlayerFlags];
	dead: readonly [PlayerFlags, PlayerFlags];
}

export interface PlayerStatusTimelineTeam {
	label: string;
	/** weapon per slot in row order; null/absent slots render a placeholder */
	weapons: (MainWeaponId | null)[];
}

/** The player whose point of view the footage is, with their kills. */
export interface PlayerStatusTimelinePov {
	side: 0 | 1;
	slot: number;
	kills: readonly PlayerStatusTimelineKill[];
}

export interface PlayerStatusTimelineKill {
	/** seconds on the same axis as the samples */
	t: number;
	/** the splatted player's name; null when unknown */
	name: string | null;
	/** the splatted player's row on the other side; null when unknown */
	victimSlot: number | null;
}

export function PlayerStatusTimeline({
	samples,
	teams,
	domain,
	pov,
}: {
	samples: readonly PlayerStatusTimelineSample[];
	teams: readonly [PlayerStatusTimelineTeam, PlayerStatusTimelineTeam];
	/** x-axis range override, to share the objective chart's axis */
	domain?: [number, number];
	pov?: PlayerStatusTimelinePov;
}) {
	const { t } = useTranslation(["common"]);
	const sorted = samples.toSorted((a, b) => a.t - b.t);
	if (sorted.length === 0) return null;

	const min = Math.min(domain?.[0] ?? Number.POSITIVE_INFINITY, sorted[0]!.t);
	const max = Math.max(
		domain?.[1] ?? 0,
		sorted[sorted.length - 1]!.t + PLAYER_STATUS_TAIL_SECONDS,
	);
	const range = Math.max(1, max - min);
	const leftOf = (at: number) => `${((at - min) / range) * 100}%`;
	const widthOf = (span: StatusSpan) =>
		`${((span.end - span.start) / range) * 100}%`;
	const titleOf = (label: string, span: StatusSpan) =>
		`${label} · ${formatElapsed(span.start)}–${formatElapsed(span.end)}`;
	const isPovRow = (side: 0 | 1, slot: number) =>
		pov?.side === side && pov.slot === slot;
	const killsOfVictim = (side: 0 | 1, slot: number) =>
		pov && pov.side !== side
			? pov.kills.filter((kill) => kill.victimSlot === slot)
			: [];

	return (
		<div
			className={styles.container}
			style={
				{
					"--plot-gutter": `${TIMELINE_PLOT_GUTTER_PX}px`,
				} as React.CSSProperties
			}
		>
			<div className={styles.legend}>
				<span className={styles.legendItem}>
					<span className={styles.legendSwatchDead} />
					{t("common:playerStatusTimeline.splatted")}
				</span>
				<span className={styles.legendItem}>
					<span className={styles.legendSwatchSpecial} />
					{t("common:playerStatusTimeline.specialReady")}
				</span>
				{pov && pov.kills.length > 0 ? (
					<span className={styles.legendItem}>
						<span className={styles.legendSwatchKill} />
						{t("common:playerStatusTimeline.kill")}
					</span>
				) : null}
				{pov?.kills.some((kill) => kill.victimSlot !== null) ? (
					<span className={styles.legendItem}>
						<span className={styles.legendSwatchSplattedByPov} />
						{t("common:playerStatusTimeline.splattedByPov")}
					</span>
				) : null}
			</div>
			{([0, 1] as const).map((side) => (
				<div key={side} className={styles.team}>
					<div className={styles.teamLabel}>{teams[side].label}</div>
					{PLAYER_SLOTS.map((slot) => {
						const deadSpans = statusSpans(
							sorted,
							(sample) => sample.dead[side][slot]!,
						);
						const splattedByPov = spansOpenedByKills(
							deadSpans,
							killsOfVictim(side, slot),
						);
						return (
							<div key={slot} className={styles.row}>
								<div className={styles.slotLabel}>
									<SlotWeapon weaponSplId={teams[side].weapons[slot] ?? null} />
								</div>
								<div className={styles.trackArea}>
									<div
										className={clsx(styles.track, {
											[styles.trackPov]: isPovRow(side, slot),
										})}
									>
										{deadSpans.map((span, i) => (
											<div
												key={`d${i}`}
												className={clsx(styles.spanDead, {
													[styles.spanSplattedByPov]: splattedByPov.has(i),
												})}
												style={{
													left: leftOf(span.start),
													width: widthOf(span),
												}}
												title={titleOf(
													splattedByPov.has(i)
														? t("common:playerStatusTimeline.splattedByPov")
														: t("common:playerStatusTimeline.splatted"),
													span,
												)}
											/>
										))}
										{statusSpans(
											sorted,
											(sample) => sample.special[side][slot]!,
										).map((span, i) => (
											<div
												key={`s${i}`}
												className={styles.spanSpecial}
												style={{
													left: leftOf(span.start),
													width: widthOf(span),
												}}
												title={titleOf(
													t("common:playerStatusTimeline.specialReady"),
													span,
												)}
											/>
										))}
									</div>
									{isPovRow(side, slot)
										? pov!.kills.map((kill, i) => (
												<div
													key={i}
													className={styles.killTick}
													style={{ left: leftOf(kill.t) }}
													title={`${t("common:playerStatusTimeline.kill")} · ${kill.name ?? "?"} · ${formatElapsed(kill.t)}`}
												/>
											))
										: null}
								</div>
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}

function SlotWeapon({ weaponSplId }: { weaponSplId: MainWeaponId | null }) {
	if (weaponSplId === null) {
		return (
			<Image
				path={abilityImageUrl("UNKNOWN")}
				alt="?"
				size={22}
				className={styles.unknownWeapon}
			/>
		);
	}
	return <WeaponImage weaponSplId={weaponSplId} variant="badge" size={22} />;
}

interface StatusSpan {
	start: number;
	end: number;
}

/** Indexes of the spans each kill opened: the latest one opening inside the kill's window. */
function spansOpenedByKills(
	spans: readonly StatusSpan[],
	kills: readonly PlayerStatusTimelineKill[],
): Set<number> {
	const opened = new Set<number>();
	for (const kill of kills) {
		const index = spans.findLastIndex(
			(span) =>
				span.start >= kill.t - KILL_SPLAT_MAX_LEAD_SECONDS &&
				span.start <= kill.t + KILL_SPLAT_MAX_LAG_SECONDS,
		);
		if (index !== -1) opened.add(index);
	}
	return opened;
}

/**
 * Contiguous stretches where the flag held true: opens at the first true read, closes at the read
 * showing false, or one second past the last confirmation when the next read is too far away.
 */
export function statusSpans(
	sorted: readonly PlayerStatusTimelineSample[],
	flagOf: (sample: PlayerStatusTimelineSample) => boolean,
): StatusSpan[] {
	const spans: StatusSpan[] = [];
	let start: number | null = null;
	let lastTrueT = 0;
	for (const sample of sorted) {
		const flag = flagOf(sample);
		if (start !== null && sample.t - lastTrueT > MAX_BRIDGE_SECONDS) {
			spans.push({ start, end: lastTrueT + PLAYER_STATUS_TAIL_SECONDS });
			start = null;
		}
		if (flag) {
			start ??= sample.t;
			lastTrueT = sample.t;
		} else if (start !== null) {
			spans.push({ start, end: sample.t });
			start = null;
		}
	}
	if (start !== null)
		spans.push({ start, end: lastTrueT + PLAYER_STATUS_TAIL_SECONDS });
	return spans;
}
