/**
 * A running VoD scan: the overall progress, then one tile per worker showing
 * the frames of its slice of the file, whether it is reading gameplay or
 * skimming past dead air, and how many games it has found.
 */
import clsx from "clsx";
import { Check } from "lucide-react";
import { formatPosition } from "../core/format";
import { buildScannerMatches } from "../core/match-builder";
import styles from "./ScanWorkers.module.css";
import { StatusPill } from "./SessionHeader";
import type { ScanEvent } from "./session-data";
import {
	setVodLaneCanvas,
	useVodScanProgress,
	type VodScanLane,
} from "./vod-scan";

export function ScanWorkers({
	events,
	headerEnd,
	children,
}: {
	events: ScanEvent[];
	headerEnd: React.ReactNode;
	children?: React.ReactNode;
}) {
	const gameStarts = buildScannerMatches(events).flatMap(({ match }) =>
		match.startsAt === null ? [] : [match.startsAt],
	);

	return (
		<div className={styles.scanWorkers}>
			<div className={styles.headerRow}>
				<StatusPill>Scanning</StatusPill>
				<ProgressText />
				<div className={styles.headerEnd}>{headerEnd}</div>
			</div>
			<Lanes gameStarts={gameStarts} />
			{children}
		</div>
	);
}

function ProgressText() {
	const { progress } = useVodScanProgress();
	return (
		<span className={styles.progressText}>
			{progress
				? `${Math.round((progress.t / Math.max(1, progress.duration)) * 100)}% · ${formatPosition(progress.t)} / ${formatPosition(progress.duration)}${progress.rate > 0 ? ` · ${progress.rate.toFixed(1)}× realtime` : ""}`
				: "opening the file…"}
		</span>
	);
}

function Lanes({ gameStarts }: { gameStarts: number[] }) {
	const { progress } = useVodScanProgress();

	return (
		<>
			<progress
				className={styles.progress}
				value={progress?.t ?? 0}
				max={progress?.duration ?? 1}
			/>
			<div className={styles.laneGrid}>
				{progress?.lanes.map((lane, i) => (
					<LaneTile
						key={i}
						index={i}
						lane={lane}
						games={
							gameStarts.filter((t) => t >= lane.tStart && t < lane.tEnd).length
						}
					/>
				))}
			</div>
		</>
	);
}

function LaneTile({
	index,
	lane,
	games,
}: {
	index: number;
	lane: VodScanLane;
	games: number;
}) {
	const laneProgress =
		(lane.t - lane.tStart) / Math.max(1, lane.tEnd - lane.tStart);

	return (
		<div className={clsx(styles.lane, { [styles.laneDone]: lane.done })}>
			<div className={styles.laneScreen}>
				<canvas
					ref={(canvas) => setVodLaneCanvas(index, canvas)}
					className={styles.canvas}
				/>
				<span className={styles.laneChip}>Worker {index + 1}</span>
				<span
					className={clsx(styles.modeChip, {
						[styles.modeActive]: !lane.done && lane.mode === "active",
					})}
				>
					{lane.done ? (
						<>
							<Check size={12} /> Done
						</>
					) : lane.mode === "active" ? (
						"Reading"
					) : (
						"Skimming"
					)}
				</span>
				<div className={styles.laneFooter}>
					<span className={styles.laneClock}>{formatPosition(lane.t)}</span>
					<div className={styles.laneBar}>
						<div
							className={styles.laneBarFill}
							style={{ width: `${laneProgress * 100}%` }}
						/>
					</div>
				</div>
			</div>
			<div className={styles.laneMeta}>
				<span>
					{formatPosition(lane.tStart)} – {formatPosition(lane.tEnd)}
				</span>
				<span className={styles.laneGames}>
					{games} {games === 1 ? "game" : "games"}
				</span>
			</div>
		</div>
	);
}
