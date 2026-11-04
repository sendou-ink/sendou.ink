/**
 * Trim controls in the style of macOS Preview: a filmstrip of the clip with
 * a yellow frame whose handles set the start and end, a playhead, and
 * playback that stays inside the frame. Drives the dialog's video element.
 */
import { Download, Pause, Play } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { toastQueue } from "~/components/elements/Toast";
import { logger } from "~/utils/logger";
import { clipFilmstrip } from "../capture/clip-trim";
import styles from "./ClipTrimBar.module.css";

const FILMSTRIP_FRAMES = 16;
const FILMSTRIP_FRAME_HEIGHT = 96;
const MIN_TRIM_SECONDS = 0.5;
const KEYBOARD_STEP_SECONDS = 0.1;
const KEYBOARD_BIG_STEP_SECONDS = 1;
/** playback this close to the end counts as at the end, so play restarts from the start */
const END_EPSILON_SECONDS = 0.05;

type TrimRange = { start: number; end: number };
type DragTarget = "start" | "end" | "playhead";

export function ClipTrimBar({
	videoRef,
	blob,
	duration,
	onCancel,
	onDownload,
	isDownloadDisabled = false,
	children,
}: {
	videoRef: RefObject<HTMLVideoElement | null>;
	blob: Blob;
	/** the video's duration in seconds */
	duration: number;
	onCancel: () => void;
	onDownload: (range: TrimRange) => Promise<void>;
	isDownloadDisabled?: boolean;
	/** more controls on the actions row, before Cancel */
	children?: ReactNode;
}) {
	const [range, setRange] = useState<TrimRange>({ start: 0, end: duration });
	const [currentTime, setCurrentTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [dragging, setDragging] = useState<DragTarget | null>(null);
	const [downloading, setDownloading] = useState(false);
	const trackRef = useRef<HTMLDivElement>(null);
	const frames = useFilmstrip(blob);
	usePlaybackWithin(videoRef, range.end, setCurrentTime, setPlaying);

	const percent = (t: number) => `${(t / duration) * 100}%`;

	const seek = (t: number) => {
		const video = videoRef.current;
		if (!video) return;
		video.currentTime = t;
		setCurrentTime(t);
	};

	const moveHandle = (handle: "start" | "end", t: number) => {
		const next =
			handle === "start"
				? {
						...range,
						start: R.clamp(t, { min: 0, max: range.end - MIN_TRIM_SECONDS }),
					}
				: {
						...range,
						end: R.clamp(t, {
							min: range.start + MIN_TRIM_SECONDS,
							max: duration,
						}),
					};
		setRange(next);
		seek(next[handle]);
	};

	const moveTo = (target: DragTarget, clientX: number) => {
		const track = trackRef.current;
		if (!track) return;
		const rect = track.getBoundingClientRect();
		const t = ((clientX - rect.left) / rect.width) * duration;
		if (target === "playhead")
			seek(R.clamp(t, { min: range.start, max: range.end }));
		else moveHandle(target, t);
	};

	const startDrag =
		(target: DragTarget) => (event: React.PointerEvent<HTMLElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			event.currentTarget.setPointerCapture(event.pointerId);
			videoRef.current?.pause();
			setDragging(target);
			if (target === "playhead") moveTo(target, event.clientX);
		};

	// a captured handle's pointer events bubble up to the track
	const drag = (event: React.PointerEvent<HTMLElement>) => {
		if (dragging) moveTo(dragging, event.clientX);
	};

	const endDrag = () => setDragging(null);

	const handleKeyDown =
		(handle: "start" | "end") => (event: React.KeyboardEvent) => {
			if (event.key === " ") {
				event.preventDefault();
				togglePlay();
				return;
			}
			const direction =
				event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
			if (direction === 0) return;
			event.preventDefault();
			videoRef.current?.pause();
			const step = event.shiftKey
				? KEYBOARD_BIG_STEP_SECONDS
				: KEYBOARD_STEP_SECONDS;
			moveHandle(handle, range[handle] + direction * step);
		};

	const togglePlay = () => {
		const video = videoRef.current;
		if (!video) return;
		if (!video.paused) {
			video.pause();
			return;
		}
		if (
			video.currentTime < range.start ||
			video.currentTime >= range.end - END_EPSILON_SECONDS
		) {
			seek(range.start);
		}
		void video.play();
	};

	const download = async () => {
		setDownloading(true);
		try {
			await onDownload(range);
		} catch (error) {
			logger.error("Trimming the clip failed", error);
			toastQueue.add({
				message: `Couldn't trim the clip: ${error instanceof Error ? error.message : error}`,
				variant: "error",
			});
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div className={styles.bar}>
			<div className={styles.row}>
				<SendouButton
					variant="minimal"
					shape="circle"
					icon={playing ? <Pause /> : <Play />}
					aria-label={playing ? "Pause" : "Play"}
					onClick={togglePlay}
				/>
				<div className={styles.frame}>
					<div
						ref={trackRef}
						className={styles.track}
						onPointerDown={startDrag("playhead")}
						onPointerMove={drag}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
					>
						<div className={styles.filmstrip}>
							{Array.from({ length: FILMSTRIP_FRAMES }, (_, i) => (
								<span
									key={i}
									className={styles.filmFrame}
									style={
										frames[i]
											? { backgroundImage: `url(${frames[i]})` }
											: undefined
									}
								/>
							))}
						</div>
						<span
							className={styles.dim}
							data-side="start"
							style={{ width: percent(range.start) }}
						/>
						<span
							className={styles.dim}
							data-side="end"
							style={{ width: percent(duration - range.end) }}
						/>
						<div
							className={styles.selection}
							style={{
								left: percent(range.start),
								width: percent(range.end - range.start),
							}}
						>
							<TrimHandle
								side="start"
								time={range.start}
								duration={duration}
								isDragging={dragging === "start"}
								onPointerDown={startDrag("start")}
								onKeyDown={handleKeyDown("start")}
							/>
							<TrimHandle
								side="end"
								time={range.end}
								duration={duration}
								isDragging={dragging === "end"}
								onPointerDown={startDrag("end")}
								onKeyDown={handleKeyDown("end")}
							/>
						</div>
						<span
							className={styles.playhead}
							style={{
								left: percent(R.clamp(currentTime, { min: 0, max: duration })),
							}}
							aria-hidden
						/>
					</div>
				</div>
			</div>
			<div className={styles.actions}>
				<span className={styles.length}>
					{formatPreciseTime(range.end - range.start)}
				</span>
				{children}
				<SendouButton variant="outlined" size="small" onClick={onCancel}>
					Cancel
				</SendouButton>
				<SendouButton
					size="small"
					icon={<Download />}
					isPending={downloading}
					isDisabled={isDownloadDisabled}
					onClick={() => void download()}
				>
					Download
				</SendouButton>
			</div>
		</div>
	);
}

function TrimHandle({
	side,
	time,
	duration,
	isDragging,
	onPointerDown,
	onKeyDown,
}: {
	side: "start" | "end";
	time: number;
	duration: number;
	isDragging: boolean;
	onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
	onKeyDown: (event: React.KeyboardEvent) => void;
}) {
	return (
		<span
			role="slider"
			tabIndex={0}
			aria-label={side === "start" ? "Trim start" : "Trim end"}
			aria-valuemin={0}
			aria-valuemax={duration}
			aria-valuenow={time}
			aria-valuetext={formatPreciseTime(time)}
			aria-orientation="horizontal"
			className={styles.handle}
			data-side={side}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
		>
			{isDragging ? (
				<span className={styles.handleTime}>{formatPreciseTime(time)}</span>
			) : null}
		</span>
	);
}

/** Filmstrip frames of the clip, empty until decoded. */
function useFilmstrip(blob: Blob): string[] {
	const [frames, setFrames] = useState<string[]>([]);
	useEffect(() => {
		let stale = false;
		void clipFilmstrip(blob, {
			count: FILMSTRIP_FRAMES,
			height: FILMSTRIP_FRAME_HEIGHT,
		}).then((next) => {
			if (!stale) setFrames(next);
		});
		return () => {
			stale = true;
		};
	}, [blob]);
	return frames;
}

/**
 * Pauses the video when trimming starts, follows its position every frame
 * while it plays and stops it at `end`.
 */
function usePlaybackWithin(
	videoRef: RefObject<HTMLVideoElement | null>,
	end: number,
	onTime: (t: number) => void,
	onPlaying: (playing: boolean) => void,
) {
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		let frame: number | null = null;
		const follow = () => {
			frame = null;
			if (video.paused) return;
			if (video.currentTime >= end) {
				video.pause();
				video.currentTime = end;
				onTime(end);
				return;
			}
			onTime(video.currentTime);
			frame = requestAnimationFrame(follow);
		};
		const onPlay = () => {
			onPlaying(true);
			if (frame === null) follow();
		};
		const onPause = () => {
			onPlaying(false);
			onTime(video.currentTime);
		};
		const onSeeked = () => onTime(video.currentTime);

		video.addEventListener("play", onPlay);
		video.addEventListener("pause", onPause);
		// a new source (the clip without music) starts over paused
		video.addEventListener("emptied", onPause);
		video.addEventListener("seeked", onSeeked);
		if (!video.paused) follow();
		return () => {
			video.removeEventListener("play", onPlay);
			video.removeEventListener("pause", onPause);
			video.removeEventListener("emptied", onPause);
			video.removeEventListener("seeked", onSeeked);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [videoRef, end, onTime, onPlaying]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		video.pause();
		onTime(video.currentTime);
	}, [videoRef, onTime]);
}

/** m:ss.s ("0:05.4", "1:02.0") */
function formatPreciseTime(t: number): string {
	const tenths = Math.max(0, Math.round(t * 10));
	const m = Math.floor(tenths / 600);
	const s = (tenths % 600) / 10;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
