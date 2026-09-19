/** Plays a clip off its stored blob, with download and delete beside it. */
import { Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import { deleteClip, loadClipBlob, type ScannerClip } from "../store/clips";
import styles from "./ClipDialog.module.css";
import { refreshClips } from "./clips-feed";

export function ClipDialog({
	clip,
	onClose,
}: {
	clip: ScannerClip;
	onClose: () => void;
}) {
	const url = useClipUrl(clip.id);
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
					// biome-ignore lint/a11y/useMediaCaption: game footage has no captions
					<video
						className={styles.video}
						src={url}
						controls
						autoPlay
						playsInline
					/>
				) : (
					<div className={styles.video} />
				)}
				<div className={styles.actions}>
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
								onClose();
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
