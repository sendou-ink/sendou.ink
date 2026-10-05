/**
 * Plays a clip off its stored blob, with download and delete beside it and
 * back/forward buttons stepping through the list it was opened from.
 */
import { ChevronLeft, ChevronRight, Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import { deleteClip, loadClipBlob, type ScannerClip } from "../store/clips";
import styles from "./ClipDialog.module.css";
import { ClipVideo } from "./ClipVideo";
import { refreshClips } from "./clips-feed";

export function ClipDialog({
	clip,
	clips,
	onPlay,
	onClose,
}: {
	clip: ScannerClip;
	/** the list back/forward step through, in the order it is shown */
	clips: readonly ScannerClip[];
	onPlay: (clip: ScannerClip) => void;
	onClose: () => void;
}) {
	const url = useClipUrl(clip.id);
	const index = clips.findIndex((other) => other.id === clip.id);
	const previous = index > 0 ? clips[index - 1] : undefined;
	const next = index !== -1 ? clips[index + 1] : undefined;
	const where = [modeLabel(clip.mode), stageLabel(clip.stage)]
		.filter(Boolean)
		.join(" · ");

	return (
		<SendouDialog
			isDismissable
			onClose={onClose}
			className={styles.dialog}
			heading={`${clip.kills} splats${where ? ` · ${where}` : ""}`}
		>
			<div className={styles.body}>
				{url ? (
					<ClipVideo className={styles.video} src={url} />
				) : (
					<div className={styles.video} />
				)}
				<div className={styles.actions}>
					{index !== -1 && clips.length > 1 ? (
						<span className={styles.nav}>
							<SendouButton
								variant="minimal"
								size="small"
								shape="circle"
								icon={<ChevronLeft />}
								aria-label="Previous clip"
								isDisabled={!previous}
								onClick={previous ? () => onPlay(previous) : undefined}
							/>
							<span className={styles.position}>
								{index + 1} / {clips.length}
							</span>
							<SendouButton
								variant="minimal"
								size="small"
								shape="circle"
								icon={<ChevronRight />}
								aria-label="Next clip"
								isDisabled={!next}
								onClick={next ? () => onPlay(next) : undefined}
							/>
						</span>
					) : null}
					<span className={styles.meta}>
						{formatPosition(clip.end - clip.start)}
						{clip.hasAudio ? null : " · no audio"}
					</span>
					{url ? (
						<LinkButton
							to={url}
							isExternal
							size="small"
							variant="outlined"
							icon={<Download />}
							onClick={(e) => {
								// a plain anchor with `download` saves instead of navigating
								e.preventDefault();
								const a = document.createElement("a");
								a.href = url;
								a.download = clipFileName(clip);
								a.click();
							}}
						>
							Download
						</LinkButton>
					) : null}
					<FormWithConfirm
						dialogHeading="Delete this clip?"
						onConfirm={() => {
							void deleteClip(clip.id).then(() => {
								void refreshClips();
								const neighbor = next ?? previous;
								if (neighbor) onPlay(neighbor);
								else onClose();
							});
						}}
					>
						<SendouButton variant="destructive" size="small" icon={<Trash2 />}>
							Delete
						</SendouButton>
					</FormWithConfirm>
				</div>
			</div>
		</SendouDialog>
	);
}

/** The clip's blob as an object URL, released when the dialog goes away. */
function useClipUrl(id: number): string | null {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		let objectUrl: string | null = null;
		let stale = false;
		void loadClipBlob(id).then((blob) => {
			if (stale || !blob) return;
			objectUrl = URL.createObjectURL(blob);
			setUrl(objectUrl);
		});
		return () => {
			stale = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			setUrl(null);
		};
	}, [id]);
	return url;
}

function clipFileName(clip: ScannerClip): string {
	const source =
		clip.source.kind === "vod"
			? clip.source.name.replace(/\.[^.]+$/, "")
			: new Date(clip.createdAt).toISOString().slice(0, 10);
	const at = formatPosition(clip.t).replaceAll(":", "-");
	return `${source}-${at}-${clip.kills}-splats.mp4`;
}
