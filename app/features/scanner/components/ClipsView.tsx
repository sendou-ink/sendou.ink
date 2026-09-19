/**
 * Clip history: the best clips across sessions, sorted by score, playable
 * in place, each downloadable and deletable. The lowest-scoring one is
 * replaced when the history is full — download anything worth keeping.
 */
import { Download, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { SCANNER_PAGE } from "~/utils/urls";
import { formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import { scannerSearchParams } from "../scanner-search-params";
import {
	deleteClip,
	loadClipBlob,
	MAX_HISTORY_CLIPS,
	type ScannerClip,
	storageUsage,
} from "../store/clips";
import styles from "./ClipsView.module.css";
import { refreshClips, useClips } from "./clips-feed";
import { downloadBlob } from "./download";
import { useEventDateTimeFormatter } from "./format";
import { SessionHeader } from "./SessionHeader";

export function ClipsView() {
	const clips = useClips();
	const history = clips.filter((clip) => clip.bucket === "history");
	const usage = useStorageUsage(clips.length);

	return (
		<div className={styles.view}>
			<SessionHeader>
				<div className={styles.title}>
					Clip history{" "}
					<span className={styles.count}>
						{history.length} / {MAX_HISTORY_CLIPS}
					</span>
				</div>
				<p className={styles.note}>
					The lowest-scoring clip is replaced when full. Download anything to
					keep it.
				</p>
			</SessionHeader>
			{history.length === 0 ? (
				<p className={styles.note}>
					No clips yet — a streak of splats while the scanner runs makes one
					(how many is in Settings).
				</p>
			) : (
				<div className={styles.grid}>
					{history.map((clip) => (
						<ClipCard key={clip.id} clip={clip} />
					))}
				</div>
			)}
			{usage !== null ? (
				<p className={styles.storage}>~{formatBytes(usage)} used</p>
			) : null}
		</div>
	);
}

function ClipCard({ clip }: { clip: ScannerClip }) {
	const [url, setUrl] = useState<string | null>(null);
	const formatDate = useEventDateTimeFormatter();
	const where = [modeLabel(clip.mode), stageLabel(clip.stage)]
		.filter(Boolean)
		.join(" · ");

	// the blob is read only once the card is played; the URL is released with the card
	useEffect(
		() => () => {
			if (url) URL.revokeObjectURL(url);
		},
		[url],
	);

	const play = async () => {
		const blob = await loadClipBlob(clip.id);
		if (blob) setUrl(URL.createObjectURL(blob));
	};

	const download = async () => {
		const blob = await loadClipBlob(clip.id);
		if (blob) downloadBlob(clipFileName(clip), blob);
	};

	const sourceHref =
		clip.source.kind === "live"
			? scannerSearchParams.href(SCANNER_PAGE, {
					view: "session",
					id: clip.source.sessionKey,
				})
			: scannerSearchParams.href(SCANNER_PAGE, {
					view: "vod",
					name: clip.source.name,
				});

	return (
		<div className={styles.card}>
			{url ? (
				// biome-ignore lint/a11y/useMediaCaption: game footage has no captions
				<video
					className={styles.video}
					src={url}
					controls
					autoPlay
					playsInline
				/>
			) : (
				<button
					type="button"
					className={styles.thumb}
					style={
						clip.thumbnail
							? { backgroundImage: `url(${clip.thumbnail})` }
							: undefined
					}
					onClick={() => void play()}
					aria-label="Play clip"
				>
					<span className={styles.playBadge}>
						<Play size={18} aria-hidden />
					</span>
				</button>
			)}
			<div className={styles.cardBody}>
				<div className={styles.cardTitle}>
					{clip.kills} splats
					{where ? ` · ${where}` : null}
				</div>
				<div className={styles.cardMeta}>
					<Link
						to={sourceHref}
						className={styles.sourceLink}
						defaultShouldRevalidate={false}
					>
						{clip.source.kind === "vod"
							? `${clip.source.name} · VoD`
							: `${formatDate(clip.createdAt)} · Live`}
					</Link>
					<span className={styles.cardActions}>
						<span className={styles.length}>
							{formatPosition(clip.end - clip.start)}
							{clip.hasAudio ? null : " · no audio"}
						</span>
						<SendouButton
							variant="minimal"
							size="small"
							shape="circle"
							icon={<Download />}
							aria-label="Download clip"
							onClick={() => void download()}
						/>
						<FormWithConfirm
							dialogHeading="Delete this clip?"
							onConfirm={() => {
								void deleteClip(clip.id).then(() => refreshClips());
							}}
						>
							<SendouButton
								variant="minimal-destructive"
								size="small"
								shape="circle"
								icon={<Trash2 />}
								aria-label="Delete clip"
							/>
						</FormWithConfirm>
					</span>
				</div>
			</div>
		</div>
	);
}

/** Bytes the origin uses, re-read when the clip count changes. */
function useStorageUsage(clipCount: number): number | null {
	const [usage, setUsage] = useState<number | null>(null);
	useEffect(() => {
		let stale = false;
		void storageUsage().then((next) => {
			if (!stale) setUsage(next);
		});
		return () => {
			stale = true;
		};
	}, [clipCount]);
	return usage;
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function clipFileName(clip: ScannerClip): string {
	const source =
		clip.source.kind === "vod"
			? clip.source.name.replace(/\.[^.]+$/, "")
			: new Date(clip.createdAt).toISOString().slice(0, 10);
	const at = formatPosition(clip.t).replaceAll(":", "-");
	return `${source}-${at}-${clip.kills}-splats.mp4`;
}
