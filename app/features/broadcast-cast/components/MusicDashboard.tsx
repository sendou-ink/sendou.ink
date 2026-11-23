import clsx from "clsx";
import {
	ChevronDown,
	ChevronUp,
	Music,
	Pause,
	Play,
	Shuffle,
	SkipBack,
	SkipForward,
	Square,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Dropzone, DropzoneAction } from "~/components/Dropzone";
import { SendouButton } from "~/components/elements/Button";
import { Input } from "~/components/Input";
import { BROADCAST_MUSIC_TITLE_MAX_LENGTH } from "~/features/broadcast/broadcast-constants";
import type {
	MusicFileProblem,
	useMusicLibrary,
} from "~/features/broadcast/broadcast-music-hooks";
import type {
	BroadcastMusic,
	BroadcastMusicTrack,
} from "~/features/broadcast/broadcast-types";
import { formatClock } from "~/features/broadcast/broadcast-utils";
import * as MusicPlayback from "~/features/broadcast/core/MusicPlayback";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useVolumeFader } from "../broadcast-cast-hooks";
import { broadcastActionSchema } from "../broadcast-cast-schemas";
import styles from "./MusicDashboard.module.css";

type MusicLibrary = ReturnType<typeof useMusicLibrary>;

/**
 * What the music on air is playing and its controls, applying right away: play/pause, skip, stop and its volume.
 * Playing plays this browser's library, or resumes the music another dashboard's library was playing.
 */
export function MusicControls({
	music,
	library,
	now,
	onShowLibrary,
}: {
	music: BroadcastMusic | null;
	library: MusicLibrary;
	/** The server's clock, `null` until hydrated. */
	now: number | null;
	onShowLibrary: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const libraryTracks = library.tracks ?? [];
	const playing = now === null ? null : MusicPlayback.current(music, now);
	const isOtherLibrary = Boolean(
		music && library.tracks && !isPlayingLibrary(music, library.tracks),
	);
	const tracksToPlay = music && isOtherLibrary ? music.tracks : libraryTracks;
	const isPlaying = Boolean(playing && !playing.isPaused);
	const isShuffled = music ? MusicPlayback.playsShuffled(music) : false;

	if (!music && libraryTracks.length === 0) {
		return (
			<section className="stack xs items-start">
				<span className="text-sm font-semi-bold">
					{t("broadcast:dashboard.music.header")}
				</span>
				<SendouButton
					size="small"
					variant="outlined"
					icon={<Music />}
					onClick={onShowLibrary}
				>
					{t("broadcast:dashboard.music.addMusic")}
				</SendouButton>
			</section>
		);
	}

	return (
		<section
			className="stack sm"
			aria-label={t("broadcast:dashboard.music.header")}
		>
			<span className="text-sm font-semi-bold">
				{t("broadcast:dashboard.music.header")}
			</span>
			<div className={styles.player}>
				<div className={styles.playing}>
					{playing ? (
						<>
							<span className="text-sm font-semi-bold truncate">
								{playing.track.title}
							</span>
							<span className="text-xs text-lighter truncate">
								{[
									playing.track.artist,
									`${formatClock(playing.positionMs)} / ${formatClock(playing.track.durationMs)}`,
								]
									.filter(Boolean)
									.join(" · ")}
							</span>
						</>
					) : (
						<span className="text-sm text-lighter">
							{t("broadcast:dashboard.music.stopped")}
						</span>
					)}
				</div>
				<div className="stack horizontal xs items-center">
					<SendouButton
						size="small"
						variant="minimal"
						shape="square"
						icon={<SkipBack />}
						isDisabled={!playing}
						onClick={() =>
							playing &&
							submit("SKIP_MUSIC", {
								direction: "previous",
								trackId: playing.track.id,
							})
						}
						aria-label={t("broadcast:dashboard.music.previous")}
					/>
					{isPlaying ? (
						<SendouButton
							size="small"
							shape="square"
							icon={<Pause />}
							onClick={() => submit("PAUSE_MUSIC")}
							aria-label={t("broadcast:dashboard.music.pause")}
							testId="broadcast-music-pause"
						/>
					) : (
						<SendouButton
							size="small"
							shape="square"
							icon={<Play />}
							isDisabled={tracksToPlay.length === 0}
							onClick={() => submit("PLAY_MUSIC", { tracks: tracksToPlay })}
							aria-label={t("broadcast:dashboard.music.play")}
							testId="broadcast-music-play"
						/>
					)}
					<SendouButton
						size="small"
						variant="minimal"
						shape="square"
						icon={<SkipForward />}
						isDisabled={!playing}
						onClick={() =>
							playing &&
							submit("SKIP_MUSIC", {
								direction: "next",
								trackId: playing.track.id,
							})
						}
						aria-label={t("broadcast:dashboard.music.next")}
					/>
					<SendouButton
						size="small"
						variant="minimal"
						shape="square"
						icon={<Square />}
						isDisabled={!music}
						onClick={() => submit("STOP_MUSIC")}
						aria-label={t("broadcast:dashboard.music.stop")}
					/>
					<SendouButton
						size="small"
						variant={isShuffled ? undefined : "minimal"}
						shape="square"
						icon={<Shuffle />}
						isDisabled={!music}
						onClick={() =>
							submit("SET_MUSIC_SHUFFLE", { isShuffled: !isShuffled })
						}
						aria-label={t("broadcast:dashboard.music.shuffle")}
						aria-pressed={isShuffled}
						title={t("broadcast:dashboard.music.shuffle")}
						testId="broadcast-music-shuffle"
					/>
				</div>
				{music ? <VolumeSlider volume={music.volume} /> : null}
			</div>
			<span className="text-xs text-lighter">
				{isOtherLibrary
					? t("broadcast:dashboard.music.otherLibrary")
					: t("broadcast:dashboard.music.heardOn")}
			</span>
		</section>
	);
}

/**
 * This browser's music library: files dropped in are kept here and sent straight to the OBS sources, never uploaded.
 * Their title and artist come from the files' tags, editable, and their order is the playlist's.
 * Changes to the library playing change the music on air too.
 */
export function MusicLibraryPanel({
	music,
	library,
}: {
	music: BroadcastMusic | null;
	library: MusicLibrary;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const [isAdding, setIsAdding] = React.useState(false);
	const [problems, setProblems] = React.useState<
		Array<{ name: string; problem: MusicFileProblem }>
	>([]);
	const tracks = library.tracks ?? [];

	/** The music on air following the library's change, when it plays this library. */
	const changeLibrary = async (
		change: () => Promise<BroadcastMusicTrack[]>,
	) => {
		const wasPlaying = Boolean(music && isPlayingLibrary(music, tracks));
		const changed = await change();
		if (!wasPlaying) return;

		if (changed.length === 0) submit("STOP_MUSIC");
		else submit("SET_MUSIC_TRACKS", { tracks: changed });
	};

	const add = async (files: File[]) => {
		setIsAdding(true);
		try {
			await changeLibrary(async () => {
				const added = await library.add(files);
				setProblems(added.problems);
				return added.tracks;
			});
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<div className="stack lg">
			<p className="text-sm text-lighter">
				{t("broadcast:dashboard.music.explanation")}
			</p>
			<Dropzone
				accept="audio/*"
				multiple
				onFiles={(files) => void add(files)}
				disabled={isAdding}
			>
				{isAdding ? (
					t("broadcast:dashboard.music.adding")
				) : (
					<>
						{t("broadcast:dashboard.music.drop")}{" "}
						<DropzoneAction>
							{t("broadcast:dashboard.music.choose")}
						</DropzoneAction>
					</>
				)}
			</Dropzone>
			{problems.length > 0 ? (
				<ul className="text-sm text-warning">
					{problems.map(({ name, problem }) => (
						<li key={name}>
							{t(`broadcast:dashboard.music.problem.${problem}`, { name })}
						</li>
					))}
				</ul>
			) : null}
			{tracks.length > 0 ? (
				<ol className={styles.tracks}>
					{tracks.map((track, i) => (
						<TrackRow
							key={track.id}
							track={track}
							isFirst={i === 0}
							isLast={i === tracks.length - 1}
							onChange={(changed) =>
								changeLibrary(() => library.update(changed))
							}
							onMove={(by) =>
								changeLibrary(() => library.move(track.id, i + by))
							}
							onRemove={() => changeLibrary(() => library.remove(track.id))}
						/>
					))}
				</ol>
			) : library.tracks ? (
				<p className="text-sm text-lighter">
					{t("broadcast:dashboard.music.empty")}
				</p>
			) : null}
		</div>
	);
}

function TrackRow({
	track,
	isFirst,
	isLast,
	onChange,
	onMove,
	onRemove,
}: {
	track: BroadcastMusicTrack;
	isFirst: boolean;
	isLast: boolean;
	onChange: (track: BroadcastMusicTrack) => void;
	onMove: (by: -1 | 1) => void;
	onRemove: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);

	const changeText = (field: "title" | "artist", input: HTMLInputElement) => {
		const text = input.value.trim() || null;
		if (field === "title" && !text) {
			// a track can't go without a title, the one it keeps shows again
			input.value = track.title;
			return;
		}
		if (text === track[field]) return;

		onChange({ ...track, [field]: text });
	};

	return (
		<li className={styles.track}>
			<div className={styles.fields}>
				<Input
					aria-label={t("broadcast:dashboard.music.title")}
					defaultValue={track.title}
					placeholder={t("broadcast:dashboard.music.title")}
					maxLength={BROADCAST_MUSIC_TITLE_MAX_LENGTH}
					onBlur={(event) => changeText("title", event.target)}
				/>
				<Input
					aria-label={t("broadcast:dashboard.music.artist")}
					defaultValue={track.artist ?? ""}
					placeholder={t("broadcast:dashboard.music.artist")}
					maxLength={BROADCAST_MUSIC_TITLE_MAX_LENGTH}
					onBlur={(event) => changeText("artist", event.target)}
				/>
			</div>
			<span className={clsx(styles.duration, "text-xs text-lighter")}>
				{formatClock(track.durationMs)}
			</span>
			<div className={styles.actions}>
				<SendouButton
					size="miniscule"
					variant="minimal"
					shape="square"
					icon={<ChevronUp />}
					isDisabled={isFirst}
					onClick={() => onMove(-1)}
					aria-label={t("broadcast:dashboard.music.moveUp")}
				/>
				<SendouButton
					size="miniscule"
					variant="minimal"
					shape="square"
					icon={<ChevronDown />}
					isDisabled={isLast}
					onClick={() => onMove(1)}
					aria-label={t("broadcast:dashboard.music.moveDown")}
				/>
				<SendouButton
					size="miniscule"
					variant="minimal-destructive"
					shape="square"
					icon={<Trash2 />}
					onClick={onRemove}
					aria-label={t("broadcast:dashboard.music.remove")}
				/>
			</div>
		</li>
	);
}

function VolumeSlider({ volume: savedVolume }: { volume: number }) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const { volume, change, release } = useVolumeFader({
		saved: savedVolume,
		save: (newVolume) => submit("SET_MUSIC_VOLUME", { volume: newVolume }),
	});

	return (
		<label className={styles.volume}>
			<span className="text-xs text-lighter">
				{t("broadcast:dashboard.music.volume")}
			</span>
			<input
				type="range"
				min={0}
				max={100}
				value={volume}
				onChange={(event) => change(Number(event.target.value))}
				onPointerUp={release}
				onKeyUp={release}
				onBlur={release}
			/>
			<span className="text-xs">{volume}%</span>
		</label>
	);
}

/** Whether the music plays tracks of this library only, so changing the library changes it. */
function isPlayingLibrary(
	music: BroadcastMusic,
	libraryTracks: BroadcastMusicTrack[],
) {
	return music.tracks.every((track) =>
		libraryTracks.some((libraryTrack) => libraryTrack.id === track.id),
	);
}
