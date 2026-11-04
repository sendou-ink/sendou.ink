/**
 * The VoD view's "Remove music": the whole file searched for battle music,
 * then saved again without it (capture/vod-music.ts). A scan from an
 * earlier visit asks for its file first. Closing the dialog stops the work.
 */
import { Download, FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { startVodMusicRemoval, type VodMusicState } from "../capture/vod-music";
import { formatTime } from "../core/format";
import styles from "./VodMusicDialog.module.css";
import {
	rememberVisitVodFile,
	VOD_FILE_ACCEPT,
	visitVodFile,
} from "./vod-scan";

export function VodMusicDialog({
	name,
	onClose,
}: {
	name: string;
	onClose: () => void;
}) {
	const [file, setFile] = useState(() => visitVodFile(name));
	const [state, setState] = useState<VodMusicState | null>(null);
	const removal = useRef<ReturnType<typeof startVodMusicRemoval> | null>(null);

	useEffect(() => {
		if (!file) return;
		const started = startVodMusicRemoval(file, setState);
		removal.current = started;
		return () => started.cancel();
	}, [file]);

	return (
		<SendouDialog isDismissable onClose={onClose} heading="Remove battle music">
			<div className={styles.body}>
				{!file ? (
					<>
						<p>
							Open <b>{name}</b> again: only its scan was saved.
						</p>
						<label className={styles.fileButton}>
							<FolderOpen size={16} />
							Open file
							<input
								type="file"
								accept={VOD_FILE_ACCEPT}
								onChange={(e) => {
									const picked = e.target.files?.[0];
									e.target.value = "";
									if (!picked) return;
									rememberVisitVodFile(picked);
									setFile(picked);
								}}
							/>
						</label>
					</>
				) : state?.status === "finding" ? (
					<Progress
						label="Looking for battle music…"
						fraction={state.fraction}
					/>
				) : state?.status === "found" ? (
					<>
						<p>
							Found {formatTime(state.seconds)} of battle music (
							{state.titles.join(", ")}).
						</p>
						<p className={styles.note}>
							The video is copied as it is. The sound without the music becomes
							the first audio track and the original sound is kept as a second
							one. Music that isn't a battle track, like the lobby's or your
							own, stays in.
						</p>
						<SendouButton
							icon={<Download />}
							onClick={() => void removal.current?.save()}
						>
							Save video
						</SendouButton>
					</>
				) : state?.status === "writing" ? (
					<>
						<Progress label="Writing the video…" fraction={state.fraction} />
						<p className={styles.note}>
							Keep this open until it's done. Closing it stops the work.
						</p>
					</>
				) : state?.status === "saved" ? (
					<p>Done! The video without the battle music was saved.</p>
				) : state?.status === "no-music" ? (
					<p>No battle music was found in this file.</p>
				) : state?.status === "error" ? (
					<p className={styles.error}>
						Couldn't remove the music: {state.message}
					</p>
				) : null}
			</div>
		</SendouDialog>
	);
}

function Progress({ label, fraction }: { label: string; fraction: number }) {
	return (
		<div className={styles.progressRow}>
			<span>
				{label} {Math.round(fraction * 100)}%
			</span>
			<progress className={styles.progress} value={fraction} max={1} />
		</div>
	);
}
