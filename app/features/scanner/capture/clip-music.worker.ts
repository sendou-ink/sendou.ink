/**
 * Runs clip-music.ts's music removal off the main thread: decodes the
 * clip's sound, fetches the music set from the static assets CDN, takes the
 * music out (core/music/music-removal.ts) and writes the clip again with the
 * new sound, its video copied as is.
 */
import {
	ALL_FORMATS,
	AudioSample,
	BlobSource,
	BufferTarget,
	Conversion,
	getFirstEncodableAudioCodec,
	Input,
	Mp4OutputFormat,
	Output,
	Quality,
} from "mediabunny";
import { removeMusic } from "../core/music/music-removal";
import type {
	ClipMusicRequest,
	ClipMusicResponse,
} from "./clip-music-protocol";
import {
	audioEncoderDelay,
	decodeAudio,
	fetchMusicIndex,
	loadMusicTrack,
	musicBaseUrl,
} from "./music-tracks";

const AUDIO_BITRATE = 192_000;

self.onmessage = async (event: MessageEvent<ClipMusicRequest>) => {
	const { clip, assetsBaseUrl } = event.data;
	try {
		const result = await removeClipMusic(clip, musicBaseUrl(assetsBaseUrl));
		self.postMessage(result satisfies ClipMusicResponse);
	} catch (error) {
		self.postMessage({
			kind: "error",
			message: error instanceof Error ? error.message : String(error),
		} satisfies ClipMusicResponse);
	}
};

async function removeClipMusic(
	clip: Blob,
	musicBase: string,
): Promise<ClipMusicResponse> {
	const audio = await decodeAudio(clip);
	if (!audio) return { kind: "no-music" };

	const index = await fetchMusicIndex(musicBase);
	const removal = await removeMusic(audio, {
		index,
		loadTrack: (id) => loadMusicTrack(index, id, musicBase, audio.sampleRate),
	});
	if (!removal) return { kind: "no-music" };

	return {
		kind: "removed",
		blob: await withAudio(clip, removal.channels, audio),
		titles: removal.trackIds.map(
			(id) => index.tracks.find((track) => track.id === id)!.title,
		),
	};
}

/** The clip again, video copied, with `channels` as its sound. */
async function withAudio(
	clip: Blob,
	channels: Float32Array[],
	audio: { sampleRate: number; start: number },
): Promise<Blob> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(clip),
	});
	try {
		const format = new Mp4OutputFormat({ fastStart: "in-memory" });
		const target = new BufferTarget();
		const codec = await getFirstEncodableAudioCodec(["aac", "opus"], {
			numberOfChannels: channels.length,
			sampleRate: audio.sampleRate,
		});
		if (!codec) throw new Error("this browser can't encode audio");
		// the encoder's own silence plays first: the sound is read that far ahead to stay in sync
		const delay = await audioEncoderDelay({
			codec,
			bitrate: AUDIO_BITRATE,
			numberOfChannels: channels.length,
			sampleRate: audio.sampleRate,
		});
		const conversion = await Conversion.init({
			input,
			output: new Output({ format, target }),
			showWarnings: false,
			audio: {
				codec,
				quality: new Quality({ bitrate: AUDIO_BITRATE }),
				process: (sample) => {
					const from = Math.round(
						(sample.timestamp - audio.start) * audio.sampleRate,
					);
					const frames = sample.numberOfFrames;
					const data = new Float32Array(frames * channels.length);
					for (const [c, channel] of channels.entries()) {
						for (let i = 0; i < frames; i++) {
							data[c * frames + i] = channel[from + delay + i] ?? 0;
						}
					}
					return new AudioSample({
						data,
						format: "f32-planar",
						numberOfChannels: channels.length,
						sampleRate: audio.sampleRate,
						timestamp: sample.timestamp,
					});
				},
			},
		});
		if (!conversion.isValid) throw new Error("the clip can't be rewritten");
		await conversion.execute();
		return new Blob([target.buffer!], { type: format.mimeType });
	} finally {
		input.dispose();
	}
}
