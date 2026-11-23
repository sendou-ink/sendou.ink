import * as React from "react";
import { BroadcastClipsContext } from "~/features/broadcast/broadcast-clips-context";
import type { BroadcastView } from "~/features/broadcast/broadcast-types";
import * as MusicPlayback from "~/features/broadcast/core/MusicPlayback";
import { keepOnly } from "~/features/broadcast/store/clip-cache";
import { logger } from "~/utils/logger";
import {
	BROADCAST_MUSIC_FADE_MS,
	BROADCAST_MUSIC_SCENES,
} from "../broadcast-cast-constants";
import type { CastBroadcastState } from "../broadcast-cast-types";

/** How often the player checks it plays what and where the music should be, also the steps of its fades. */
const TICK_MS = 100;
/** How far the audio can drift from where the music should be before it's moved there. */
const MAX_DRIFT_MS = 2_000;

/**
 * Plays the producer's music on the page OBS takes the sound from, at the spot every overlay works out from the
 * playlist (see `MusicPlayback.current`), so loading the page again picks up where it was. Heard only while a scene
 * showing the now playing line is on air: faded out as a Take goes to another scene or the music is paused, faded in
 * as it comes back. The previews and the designer play nothing.
 */
export function MusicPlayer({
	state,
	view,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
}) {
	const { isMuted } = React.useContext(BroadcastClipsContext);

	if (isMuted) return null;

	return <MusicAudio state={state} view={view} />;
}

function MusicAudio({
	state,
	view,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
}) {
	const { files, clockOffsetMs } = React.useContext(BroadcastClipsContext);
	const audioRef = React.useRef<HTMLAudioElement>(null);
	const latest = React.useRef({
		music: state.music,
		urls: files.music,
		clockOffsetMs,
		isOnMusicScene: BROADCAST_MUSIC_SCENES.includes(state[view].scene),
	});
	React.useLayoutEffect(() => {
		latest.current = {
			music: state.music,
			urls: files.music,
			clockOffsetMs,
			isOnMusicScene: BROADCAST_MUSIC_SCENES.includes(state[view].scene),
		};
	});
	useKeptMusicOnly(state.music?.tracks.map((track) => track.id) ?? null);

	React.useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		let gain = 0;
		let loadedUrl: string | null = null;
		const fadeStep = TICK_MS / BROADCAST_MUSIC_FADE_MS;

		const tick = () => {
			const { music, urls, isOnMusicScene } = latest.current;
			const playing = MusicPlayback.current(
				music,
				Date.now() + latest.current.clockOffsetMs,
			);
			const url = playing ? urls.get(playing.track.id) : undefined;
			if (!music || !playing || !url) {
				gain = 0;
				audio.pause();
				return;
			}

			const isHeard = !playing.isPaused && isOnMusicScene;
			gain = isHeard
				? Math.min(1, gain + fadeStep)
				: Math.max(0, gain - fadeStep);
			const positionSeconds = playing.positionMs / 1000;

			if (loadedUrl !== url) {
				// a track changing cuts over to the next one
				loadedUrl = url;
				audio.src = url;
				audio.currentTime = positionSeconds;
			}
			if (gain === 0) {
				audio.pause();
				return;
			}

			audio.volume = gain * (music.volume / 100);
			if (audio.paused) {
				audio.currentTime = positionSeconds;
				audio.play().catch(() => {
					// e.g. a browser tab not allowed to autoplay, OBS always is
				});
			} else if (
				isHeard &&
				audio.readyState >= HTMLMediaElement.HAVE_METADATA &&
				Math.abs(audio.currentTime - positionSeconds) * 1000 > MAX_DRIFT_MS
			) {
				audio.currentTime = positionSeconds;
			}
		};

		tick();
		const interval = setInterval(tick, TICK_MS);

		return () => {
			clearInterval(interval);
			audio.pause();
		};
	}, []);

	// biome-ignore lint/a11y/useMediaCaption: background music, nothing is said
	return <audio ref={audioRef} preload="auto" />;
}

/** Drops the music kept over page loads of tracks no longer in the playlist, while one plays. */
function useKeptMusicOnly(trackIds: string[] | null) {
	const key = trackIds?.join(",") ?? null;

	React.useEffect(() => {
		if (!key) return;

		keepOnly(new Set(key.split(","))).catch((error) =>
			logger.error("Dropping music no longer played failed", error),
		);
	}, [key]);
}
