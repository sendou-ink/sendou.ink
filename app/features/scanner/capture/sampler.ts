/**
 * Capture layer: a video input (capture card, OBS Virtual Camera) in via
 * getUserMedia, frames out as ImageBitmaps at a low sample rate. Downstream
 * sees only (bitmap, t), with t on the wall clock in seconds so events from
 * different page loads share one timeline.
 */

export interface MediaInputs {
	video: MediaDeviceInfo[];
	audio: MediaDeviceInfo[];
}

/** Every video and audio input the browser exposes (labels need a granted permission). */
export async function listMediaInputs(): Promise<MediaInputs> {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return {
		video: devices.filter((d) => d.kind === "videoinput"),
		audio: devices.filter((d) => d.kind === "audioinput"),
	};
}

/**
 * Whether the browser has revealed the inputs: without granted camera and
 * microphone permissions it lists anonymous placeholders (empty ids and
 * labels) — a capture card's audio side is a microphone-class device, so
 * the camera permission alone leaves it unmatchable.
 */
export function inputsRevealed(inputs: MediaInputs): boolean {
	return (
		inputs.video.some((device) => device.deviceId !== "") &&
		inputs.audio.every((device) => device.deviceId !== "")
	);
}

/**
 * Asks for camera and microphone permission (opening and closing the
 * defaults) so the next enumeration carries ids and labels; a refused
 * microphone still reveals the cameras. False when the camera is declined.
 */
export async function requestInputAccess(): Promise<boolean> {
	for (const constraints of [{ video: true, audio: true }, { video: true }]) {
		try {
			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			for (const track of stream.getTracks()) track.stop();
			return true;
		} catch {
			// the next attempt asks for less
		}
	}
	return false;
}

/** Whether a video input is OBS's virtual camera, which carries no audio. */
export function isVirtualCamera(device: Pick<MediaDeviceInfo, "label">) {
	return /\bOBS\b/i.test(device.label);
}

/**
 * The audio input that belongs to a video input: the same physical device
 * (shared `groupId`), else one whose label starts the same way (a capture
 * card's audio and video interfaces). Null for a virtual camera or no match.
 */
export function audioInputFor(
	video: MediaDeviceInfo,
	audioInputs: readonly MediaDeviceInfo[],
): MediaDeviceInfo | null {
	if (isVirtualCamera(video)) return null;
	const byGroup = audioInputs.find(
		(audio) => audio.groupId && audio.groupId === video.groupId,
	);
	if (byGroup) return byGroup;
	const prefix = video.label.split(/[\s(]/)[0]?.toLowerCase();
	if (!prefix || prefix.length < 3) return null;
	return (
		audioInputs.find((audio) => audio.label.toLowerCase().startsWith(prefix)) ??
		null
	);
}

export interface OpenedCapture {
	stream: MediaStream;
	/** why the audio input could not be opened (another app holding it, say); null when audio is on or none was asked for */
	audioError: string | null;
}

/**
 * Opens the source: 1080p video from `videoDeviceId` (the default camera when
 * empty) plus raw audio from `audioDeviceId` when given. A refused or busy
 * audio input falls back to video only — clips are silent rather than absent
 * — with the failure reported so the header can say why.
 */
export async function openCapture({
	videoDeviceId,
	audioDeviceId,
}: {
	videoDeviceId: string;
	audioDeviceId: string | null;
}): Promise<OpenedCapture> {
	const video: MediaTrackConstraints = {
		deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
		width: { ideal: 1920 },
		height: { ideal: 1080 },
		// Chromium's own default is 30, which would halve a capture card's 60
		frameRate: { ideal: 60 },
	};
	let audioError: string | null = null;
	if (audioDeviceId) {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video,
				audio: {
					deviceId: { exact: audioDeviceId },
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
				},
			});
			return { stream, audioError: null };
		} catch (error) {
			audioError = audioErrorText(error);
		}
	}
	const stream = await navigator.mediaDevices.getUserMedia({
		video,
		audio: false,
	});
	return { stream, audioError };
}

interface DesktopAudioOptions extends DisplayMediaStreamOptions {
	/** Chromium's picker hints, not in TypeScript's DOM lib */
	systemAudio?: "include" | "exclude";
	selfBrowserSurface?: "include" | "exclude";
}

/**
 * The desktop's sound as one audio track, through the browser's share
 * picker: Chromium offers "Also share system audio" for a whole screen and
 * a tab's audio for a tab. The picked video surface is dropped at once.
 * Must run inside the click that starts the capture (the picker needs the
 * activation). Null with the reason when nothing usable was shared.
 */
export async function openDesktopAudio(): Promise<{
	track: MediaStreamTrack | null;
	error: string | null;
}> {
	if (!navigator.mediaDevices?.getDisplayMedia) {
		return { track: null, error: "this browser cannot share desktop audio" };
	}
	try {
		const options: DesktopAudioOptions = {
			video: true,
			audio: {
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
				// Chromium's own: keep the shared sound playing on the desktop too
				suppressLocalAudioPlayback: false,
			} as MediaTrackConstraints,
			systemAudio: "include",
			selfBrowserSurface: "exclude",
		};
		const shared = await navigator.mediaDevices.getDisplayMedia(options);
		for (const track of shared.getVideoTracks()) track.stop();
		const track = shared.getAudioTracks()[0] ?? null;
		return {
			track,
			error: track
				? null
				: 'nothing was shared with sound, pick a screen and tick "Also share system audio"',
		};
	} catch (error) {
		return {
			track: null,
			error:
				error instanceof DOMException && error.name === "NotAllowedError"
					? "desktop audio sharing was cancelled"
					: audioErrorText(error),
		};
	}
}

function audioErrorText(error: unknown): string {
	if (error instanceof DOMException) {
		switch (error.name) {
			case "NotReadableError":
				return "the audio input is in use by another app";
			case "NotAllowedError":
				return "microphone access was denied";
			case "OverconstrainedError":
			case "NotFoundError":
				return "the audio input is no longer available";
		}
	}
	return error instanceof Error ? error.message : String(error);
}

export type FrameHandler = (bitmap: ImageBitmap, t: number) => void;

/**
 * Samples frames from a playing video element at ~fps. The clock is a
 * setInterval in a dedicated worker (ticker.worker.ts): rAF and
 * requestVideoFrameCallback pause in hidden tabs, but worker timers keep
 * firing, so capture continues in another tab. Timestamps are wall-clock
 * seconds (Date.now), which the ring buffer stamps its footage with too.
 * Returns a stop function.
 */
export function startSampler(
	video: HTMLVideoElement,
	fps: number,
	onFrame: FrameHandler,
): () => void {
	const ticker = new Worker(new URL("./ticker.worker.ts", import.meta.url), {
		type: "module",
	});
	ticker.postMessage(1000 / fps);
	let stopped = false;
	let sampling = false;

	ticker.onmessage = async () => {
		if (stopped || sampling) return;
		sampling = true;
		try {
			const bitmap = await createImageBitmap(video);
			if (stopped) {
				bitmap.close();
				return;
			}
			onFrame(bitmap, Date.now() / 1000);
		} catch {
			// video not ready — skip this frame
		} finally {
			sampling = false;
		}
	};

	return () => {
		stopped = true;
		ticker.terminate();
	};
}
