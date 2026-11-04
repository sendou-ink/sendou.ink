/**
 * Plays a clip off its stored blob, with a mute music switch, download, trim
 * (pick a range, then download) and delete beside it and back/forward
 * buttons stepping through the list it was opened from.
 */
import {
	ChevronLeft,
	ChevronRight,
	Download,
	Scissors,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { Spinner } from "~/components/elements/Spinner";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { downloadBlob } from "~/utils/download";
import { muteClipMusic } from "../capture/clip-music";
import { trimClip } from "../capture/clip-trim";
import { formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import { deleteClip, loadClipBlob, type ScannerClip } from "../store/clips";
import styles from "./ClipDialog.module.css";
import { ClipTrimBar } from "./ClipTrimBar";
import { ClipVideo } from "./ClipVideo";
import { refreshClips } from "./clips-feed";

export function ClipDialog({
	clip,
	clips,
	onPlay,
	onClose,
	startTrimming = false,
}: {
	clip: ScannerClip;
	/** the list back/forward step through, in the order it is shown */
	clips: readonly ScannerClip[];
	onPlay: (clip: ScannerClip) => void;
	onClose: () => void;
	/** opens with the trim bar shown */
	startTrimming?: boolean;
}) {
	const loaded = useClipBlob(clip.id);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [media, setMedia] = useState<{
		clipId: number;
		duration: number;
	} | null>(null);
	const duration = media?.clipId === clip.id ? media.duration : null;
	const [trimmingClipId, setTrimmingClipId] = useState<number | null>(
		startTrimming ? clip.id : null,
	);
	const trimming = trimmingClipId === clip.id;
	const [musicState, setMusicState] = useState<MusicState | null>(null);
	const music = musicState?.clipId === clip.id ? musicState : null;
	const musicFreeUrl = useObjectUrl(
		music?.status === "removed" ? music.blob : null,
	);
	const playMusicFree = Boolean(music?.isMuted && musicFreeUrl);
	const url = (playMusicFree ? musicFreeUrl : loaded?.url) ?? null;
	const [resume, setResume] = useState<{ clipId: number; at: number } | null>(
		null,
	);
	const [shownClipId, setShownClipId] = useState(clip.id);
	if (shownClipId !== clip.id) {
		setShownClipId(clip.id);
		setResume(null);
	}
	const rememberPosition = (clipId: number) =>
		setResume({ clipId, at: videoRef.current?.currentTime ?? 0 });

	const setMusicMuted = (isMuted: boolean) => {
		rememberPosition(clip.id);
		if (!isMuted || music?.status === "removed") {
			setMusicState(music ? { ...music, isMuted } : null);
			return;
		}
		if (!loaded) return;
		const clipId = clip.id;
		setMusicState({ clipId, isMuted: true, status: "removing" });
		const settle = (outcome: MusicState) => {
			rememberPosition(clipId);
			setMusicState((current) =>
				current?.clipId === clipId
					? { ...outcome, isMuted: current.isMuted && outcome.isMuted }
					: current,
			);
		};
		muteClipMusic(loaded.blob).then(
			(result) =>
				settle(
					result.kind === "removed"
						? { clipId, isMuted: true, status: "removed", ...result }
						: { clipId, isMuted: false, status: "no-music" },
				),
			() => settle({ clipId, isMuted: false, status: "failed" }),
		);
	};
	const index = clips.findIndex((other) => other.id === clip.id);
	const previous = index > 0 ? clips[index - 1] : undefined;
	const next = index !== -1 ? clips[index + 1] : undefined;
	const musicToggle = (
		<span className={styles.music}>
			<SendouSwitch
				size="small"
				isSelected={Boolean(music?.isMuted)}
				isDisabled={!clip.hasAudio}
				onChange={setMusicMuted}
			>
				Mute music
			</SendouSwitch>
			<MusicStatus music={music} />
		</span>
	);
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
					<ClipVideo
						ref={videoRef}
						className={styles.video}
						src={url}
						controls={!trimming}
						autoPlay={!trimming}
						startAt={resume?.clipId === clip.id ? resume.at : undefined}
						onDurationChange={(loadedDuration) =>
							setMedia({ clipId: clip.id, duration: loadedDuration })
						}
					/>
				) : (
					<div className={styles.video} />
				)}
				{trimming ? (
					loaded && duration !== null ? (
						<ClipTrimBar
							videoRef={videoRef}
							blob={loaded.blob}
							duration={duration}
							isDownloadDisabled={Boolean(
								music?.isMuted && music.status === "removing",
							)}
							onCancel={() => setTrimmingClipId(null)}
							onDownload={async (range) => {
								const source =
									playMusicFree && music?.status === "removed"
										? music.blob
										: loaded.blob;
								const trimmed = await trimClip(source, range);
								downloadBlob(
									clipFileName(clip).replace(
										/\.mp4$/,
										playMusicFree ? "-trimmed-no-music.mp4" : "-trimmed.mp4",
									),
									trimmed,
								);
							}}
						>
							{musicToggle}
						</ClipTrimBar>
					) : null
				) : (
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
						{musicToggle}
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
									a.download = playMusicFree
										? clipFileName(clip).replace(/\.mp4$/, "-no-music.mp4")
										: clipFileName(clip);
									a.click();
								}}
							>
								Download
							</LinkButton>
						) : null}
						{url && duration !== null ? (
							<SendouButton
								variant="outlined"
								size="small"
								icon={<Scissors />}
								onClick={() => setTrimmingClipId(clip.id)}
							>
								Trim
							</SendouButton>
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
							<SendouButton
								variant="destructive"
								size="small"
								icon={<Trash2 />}
							>
								Delete
							</SendouButton>
						</FormWithConfirm>
					</div>
				)}
			</div>
		</SendouDialog>
	);
}

type MusicState = { clipId: number; isMuted: boolean } & (
	| { status: "removing" }
	| { status: "removed"; blob: Blob; titles: string[] }
	| { status: "no-music" }
	| { status: "failed" }
);

function MusicStatus({ music }: { music: MusicState | null }) {
	if (!music) return null;
	switch (music.status) {
		case "removing":
			return (
				<span className={styles.musicNote}>
					<Spinner className={styles.musicSpinner} />
					Removing music…
				</span>
			);
		case "removed":
			return music.isMuted ? (
				<span className={styles.musicNote} title={music.titles.join(", ")}>
					{music.titles.join(", ")}
				</span>
			) : null;
		case "no-music":
			return (
				<span className={styles.musicNote}>No known music in this clip</span>
			);
		case "failed":
			return <span className={styles.musicNote}>Couldn't mute the music</span>;
	}
}

/** An object URL of `blob`, released when it changes or the component goes away. */
function useObjectUrl(blob: Blob | null): string | null {
	const [url, setUrl] = useState<{ blob: Blob; url: string } | null>(null);
	useEffect(() => {
		if (!blob) return;
		const objectUrl = URL.createObjectURL(blob);
		setUrl({ blob, url: objectUrl });
		return () => URL.revokeObjectURL(objectUrl);
	}, [blob]);
	return url && url.blob === blob ? url.url : null;
}

/** The clip's blob and an object URL of it, released when the dialog goes away. */
function useClipBlob(id: number): { blob: Blob; url: string } | null {
	const [loaded, setLoaded] = useState<{ blob: Blob; url: string } | null>(
		null,
	);
	useEffect(() => {
		let objectUrl: string | null = null;
		let stale = false;
		void loadClipBlob(id).then((blob) => {
			if (stale || !blob) return;
			objectUrl = URL.createObjectURL(blob);
			setLoaded({ blob, url: objectUrl });
		});
		return () => {
			stale = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			setLoaded(null);
		};
	}, [id]);
	return loaded;
}

function clipFileName(clip: ScannerClip): string {
	const source =
		clip.source.kind === "vod"
			? clip.source.name.replace(/\.[^.]+$/, "")
			: new Date(clip.createdAt).toISOString().slice(0, 10);
	const at = formatPosition(clip.t).replaceAll(":", "-");
	return `${source}-${at}-${clip.kills}-splats.mp4`;
}
