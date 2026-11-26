/**
 * Plays a capture's audio track on the page. A capture card on Windows has
 * one owner at a time, so once the scanner opens it OBS's audio monitoring
 * goes quiet; this gives the player their game sound back. The track itself
 * is shared, so the clip ring buffer keeps reading it as before.
 */

/** smooths a dragged volume slider so it doesn't click */
const VOLUME_RAMP_S = 0.02;

export interface AudioPassthrough {
	setVolume: (volume: number) => void;
	stop: () => void;
}

/**
 * Starts playing `track` at `volume` (0–1). Started outside a user
 * activation, the browser may hold the sound back until the next click on
 * the page.
 */
export function startAudioPassthrough(
	track: MediaStreamTrack,
	volume: number,
): AudioPassthrough {
	const context = new AudioContext({ latencyHint: "interactive" });
	const source = context.createMediaStreamSource(new MediaStream([track]));
	const gain = context.createGain();
	gain.gain.value = volume;
	source.connect(gain).connect(context.destination);
	if (context.state === "suspended") void context.resume().catch(() => {});

	return {
		setVolume: (next) => {
			gain.gain.setTargetAtTime(next, context.currentTime, VOLUME_RAMP_S);
		},
		stop: () => {
			source.disconnect();
			gain.disconnect();
			void context.close().catch(() => {});
		},
	};
}
