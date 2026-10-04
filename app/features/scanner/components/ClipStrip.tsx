/**
 * A row of clip tiles (thumbnail, kill count, where it came from) with a
 * title and count, as shown on the landing, a session and a VoD. Tiles open
 * the clip dialog through `onPlay`.
 */
import { Play } from "lucide-react";
import { Link } from "react-router";
import { formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import type { ScannerClip } from "../store/clips";
import styles from "./ClipStrip.module.css";
import { useEventDateTimeFormatter } from "./format";

export function ClipStrip({
	title,
	count,
	clips,
	onPlay,
	seeAllHref,
	sourceLabel,
}: {
	title: string;
	/** `17 / 20` next to the title; omitted = the clip count */
	count?: string;
	/** best first */
	clips: readonly ScannerClip[];
	onPlay: (clip: ScannerClip) => void;
	seeAllHref?: string;
	/** the tile's bottom line; default: when it was made */
	sourceLabel?: (clip: ScannerClip) => string;
}) {
	if (clips.length === 0) return null;
	return (
		<section className={styles.strip}>
			<div className={styles.titleRow}>
				<span className={styles.title}>{title}</span>
				<span className={styles.count}>{count ?? clips.length}</span>
				{seeAllHref ? (
					<Link
						to={seeAllHref}
						className={styles.seeAll}
						defaultShouldRevalidate={false}
					>
						See all →
					</Link>
				) : null}
			</div>
			<div className={styles.tiles}>
				{clips.map((clip) => (
					<ClipTile
						key={clip.id}
						clip={clip}
						onPlay={onPlay}
						sourceLabel={sourceLabel}
					/>
				))}
			</div>
		</section>
	);
}

function ClipTile({
	clip,
	onPlay,
	sourceLabel,
}: {
	clip: ScannerClip;
	onPlay: (clip: ScannerClip) => void;
	sourceLabel?: (clip: ScannerClip) => string;
}) {
	const formatDate = useEventDateTimeFormatter();
	const where = [modeLabel(clip.mode), stageLabel(clip.stage)]
		.filter(Boolean)
		.join(" · ");
	return (
		<button
			type="button"
			className={styles.tile}
			onClick={() => onPlay(clip)}
			aria-label={`Play clip: ${clip.kills} splats${where ? ` on ${where}` : ""}`}
		>
			<span
				className={styles.thumb}
				style={
					clip.thumbnail
						? { backgroundImage: `url(${clip.thumbnail})` }
						: undefined
				}
			>
				<span className={styles.play}>
					<Play size={14} aria-hidden />
					{clip.kills}k
				</span>
				<span className={styles.length}>
					{formatPosition(clip.end - clip.start)}
				</span>
			</span>
			<span className={styles.where}>{where || "Unknown stage"}</span>
			<span className={styles.source}>
				{sourceLabel ? sourceLabel(clip) : formatDate(clip.createdAt)}
			</span>
		</button>
	);
}
