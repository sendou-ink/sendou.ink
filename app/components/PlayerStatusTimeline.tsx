/**
 * Per-player status bands over a game's scanned icon-strip reads: one row
 * per player (weapon icon as the label), a band while the player was
 * splatted and another while they held their special, both teams stacked.
 * Rendered above the ObjectiveTimeline chart on the same `t` seconds axis —
 * pass `domain` so both span the same range. Reads re-confirm an unchanged
 * state every few seconds; a longer sample gap means the HUD was not
 * observed, so bands never bridge across one (the state there is unknown,
 * not continued).
 */
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

export function PlayerStatusTimeline({
	samples,
	teams,
	domain,
}: {
	samples: readonly PlayerStatusTimelineSample[];
	teams: readonly [PlayerStatusTimelineTeam, PlayerStatusTimelineTeam];
	/** x-axis range override, to share the objective chart's axis */
	domain?: [number, number];
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
	const leftOf = (span: StatusSpan) => `${((span.start - min) / range) * 100}%`;
	const widthOf = (span: StatusSpan) =>
		`${((span.end - span.start) / range) * 100}%`;
	const titleOf = (label: string, span: StatusSpan) =>
		`${label} · ${formatElapsed(span.start)}–${formatElapsed(span.end)}`;

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
			</div>
			{([0, 1] as const).map((side) => (
				<div key={side} className={styles.team}>
					<div className={styles.teamLabel}>{teams[side].label}</div>
					{[0, 1, 2, 3].map((slot) => (
						<div key={slot} className={styles.row}>
							<div className={styles.slotLabel}>
								<SlotWeapon weaponSplId={teams[side].weapons[slot] ?? null} />
							</div>
							<div className={styles.track}>
								{statusSpans(sorted, (sample) => sample.dead[side][slot]!).map(
									(span, i) => (
										<div
											key={`d${i}`}
											className={styles.spanDead}
											style={{ left: leftOf(span), width: widthOf(span) }}
											title={titleOf(
												t("common:playerStatusTimeline.splatted"),
												span,
											)}
										/>
									),
								)}
								{statusSpans(
									sorted,
									(sample) => sample.special[side][slot]!,
								).map((span, i) => (
									<div
										key={`s${i}`}
										className={styles.spanSpecial}
										style={{ left: leftOf(span), width: widthOf(span) }}
										title={titleOf(
											t("common:playerStatusTimeline.specialReady"),
											span,
										)}
									/>
								))}
							</div>
						</div>
					))}
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

/**
 * Contiguous stretches where the flag held true: a span opens at its first
 * true read and closes at the read that shows false — or one second past
 * its last confirmation when the next read is too far away (or the series
 * ends) to know what happened in between.
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
