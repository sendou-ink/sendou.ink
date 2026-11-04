/**
 * Takes the battle music out of a whole VoD file (vod-music.ts) in the two
 * passes of core/music/music-stream.ts, off the main thread:
 *
 * - `find`: the file's sound decoded, mixed to mono and searched for the
 *   music; answers with how much was found.
 * - `write`: the file again, its video packets copied as they are, the
 *   sound decoded once more with the music subtracted and encoded as the
 *   first audio track, the original audio tracks' packets copied after it.
 *   Every track is fed up to where the music-free sound has got, so the
 *   muxer never holds more than a few seconds and a file of hours streams
 *   to a file the user picked or to the origin private file system.
 */

import {
	ALL_FORMATS,
	AudioSample,
	AudioSampleSink,
	AudioSampleSource,
	BlobSource,
	EncodedAudioPacketSource,
	type EncodedPacket,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	getFirstEncodableAudioCodec,
	Input,
	MATROSKA,
	MkvOutputFormat,
	Mp4OutputFormat,
	Output,
	Quality,
	StreamTarget,
	type StreamTargetChunk,
	WEBM,
} from "mediabunny";
import * as R from "remeda";
import {
	FINGERPRINT_SAMPLE_RATE,
	type MusicIndex,
} from "../core/music/fingerprint";
import { type AlignedSegment, mixDown } from "../core/music/music-removal";
import {
	createMusicFinder,
	createMusicSubtractor,
} from "../core/music/music-stream";
import {
	audioEncoderDelay,
	audioPlanes,
	fetchMusicIndex,
	loadMusicTrack,
	musicBaseUrl,
} from "./music-tracks";
import type { VodMusicRequest, VodMusicResponse } from "./vod-music-protocol";

const AUDIO_BITRATE = 192_000;
const PROGRESS_EVERY_SECONDS = 5;

/** worker-only OPFS API, missing from TypeScript's DOM lib */
interface SyncAccessFileHandle extends FileSystemFileHandle {
	createSyncAccessHandle(): Promise<{
		write(data: Uint8Array, options: { at: number }): number;
		truncate(size: number): void;
		flush(): void;
		close(): void;
	}>;
}

let found: {
	file: File;
	index: MusicIndex;
	musicBase: string;
	segments: AlignedSegment[];
} | null = null;

self.onmessage = async (event: MessageEvent<VodMusicRequest>) => {
	try {
		const request = event.data;
		if (request.kind === "find") {
			post(await find(request.file, musicBaseUrl(request.assetsBaseUrl)));
		} else {
			if (!found) throw new Error("nothing found to remove");
			await write(found, await openTarget(request));
			post({ kind: "written" });
		}
	} catch (error) {
		post({
			kind: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};

function post(response: VodMusicResponse) {
	self.postMessage(response);
}

async function find(file: File, musicBase: string): Promise<VodMusicResponse> {
	const index = await fetchMusicIndex(musicBase);
	const input = openInput(file);
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error("the file has no sound");
		if (!(await track.canDecode())) {
			throw new Error("this browser can't decode the file's sound");
		}
		const duration = await input.computeDuration();
		const finder = createMusicFinder({
			sampleRate: track.sampleRate,
			index,
			loadLowTrack: async (id) =>
				mixDown(
					await loadMusicTrack(
						index,
						index.tracks[id]!.id,
						musicBase,
						FINGERPRINT_SAMPLE_RATE,
					),
				),
			onWindow: (seconds) =>
				post({ kind: "progress", fraction: seconds / duration }),
		});
		for await (const sample of new AudioSampleSink(track).samples()) {
			const channels = audioPlanes(sample);
			sample.close();
			await finder.push(mixDown(channels));
		}
		const segments = await finder.finish();
		if (segments.length === 0) return { kind: "no-music" };
		found = { file, index, musicBase, segments };
		return {
			kind: "found",
			seconds: segments.reduce(
				(sum, segment) => sum + segment.end - segment.start,
				0,
			),
			titles: R.unique(segments.map((segment) => segment.track)).map(
				(id) => index.tracks[id]!.title,
			),
		};
	} finally {
		input.dispose();
	}
}

async function openTarget(
	request: Extract<VodMusicRequest, { kind: "write" }>,
): Promise<WritableStream<StreamTargetChunk>> {
	if (request.handle) return request.handle.createWritable();
	const root = await navigator.storage.getDirectory();
	const handle = await root.getFileHandle(request.opfsName, { create: true });
	const access = await (
		handle as SyncAccessFileHandle
	).createSyncAccessHandle();
	access.truncate(0);
	return new WritableStream<StreamTargetChunk>({
		write(chunk) {
			access.write(chunk.data, { at: chunk.position });
		},
		close() {
			access.flush();
			access.close();
		},
		abort() {
			access.close();
		},
	});
}

async function write(
	{ file, index, musicBase, segments }: NonNullable<typeof found>,
	writable: WritableStream<StreamTargetChunk>,
) {
	const input = openInput(file);
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		const audioTrack = await input.getPrimaryAudioTrack();
		if (!videoTrack?.codec || !audioTrack) {
			throw new Error("the file needs a video and a sound track");
		}
		const isMatroska = [MATROSKA, WEBM].includes(
			(await input.getFormat()) as typeof MATROSKA,
		);
		const format = isMatroska
			? new MkvOutputFormat()
			: new Mp4OutputFormat({ fastStart: false });
		if (!format.getSupportedVideoCodecs().includes(videoTrack.codec)) {
			throw new Error(`${videoTrack.codec} video can't be written back`);
		}
		const numberOfChannels = audioTrack.numberOfChannels;
		const sampleRate = audioTrack.sampleRate;
		const codec = await getFirstEncodableAudioCodec(
			format
				.getSupportedAudioCodecs()
				.filter((candidate) => candidate === "aac" || candidate === "opus"),
			{ numberOfChannels, sampleRate, bitrate: AUDIO_BITRATE },
		);
		if (!codec) throw new Error("this browser can't encode audio");
		const originals = (await input.getAudioTracks()).filter(
			(track) =>
				track.codec !== null &&
				format.getSupportedAudioCodecs().includes(track.codec),
		);

		const output = new Output({
			format,
			target: new StreamTarget(writable, { chunked: true }),
		});
		const videoSource = new EncodedVideoPacketSource(videoTrack.codec);
		output.addVideoTrack(videoSource, { rotation: videoTrack.rotation });
		const musicFree = new AudioSampleSource({
			codec,
			quality: new Quality({ bitrate: AUDIO_BITRATE }),
		});
		output.addAudioTrack(musicFree, {
			name: "No music",
			disposition: { default: true },
		});
		const originalSources = originals.map((track, i) => {
			const source = new EncodedAudioPacketSource(track.codec!);
			output.addAudioTrack(source, {
				name: i === 0 ? "Original" : (track.name ?? `Original ${i + 1}`),
				languageCode: track.languageCode,
				disposition: { default: false },
			});
			return source;
		});
		await output.start();

		try {
			const videoMeta = {
				decoderConfig: (await videoTrack.getDecoderConfig()) ?? undefined,
			};
			const copies = [
				packetCopy(new EncodedPacketSink(videoTrack), (packet) =>
					videoSource.add(packet, videoMeta),
				),
			];
			for (const [i, track] of originals.entries()) {
				const meta = {
					decoderConfig: (await track.getDecoderConfig()) ?? undefined,
				};
				copies.push(
					packetCopy(new EncodedPacketSink(track), (packet) =>
						originalSources[i]!.add(packet, meta),
					),
				);
			}
			const duration = await input.computeDuration();
			const subtractor = createMusicSubtractor({
				segments,
				sampleRate,
				numberOfChannels,
				loadTrack: (track) =>
					loadMusicTrack(index, index.tracks[track]!.id, musicBase, sampleRate),
			});
			// the encoder's own silence plays first: the sound starts that far in to stay in sync
			let skip = await audioEncoderDelay({
				codec,
				bitrate: AUDIO_BITRATE,
				numberOfChannels,
				sampleRate,
			});
			const lead = skip;
			let start: number | null = null;
			let emitted = 0;
			let reported = 0;
			// a second at a time, the other tracks following it
			const addMusicFree = async (all: Float32Array[]) => {
				const skipped = Math.min(skip, all[0]?.length ?? 0);
				skip -= skipped;
				const channels = all.map((channel) => channel.subarray(skipped));
				const length = channels[0]?.length ?? 0;
				for (let at = 0; at < length && start !== null; at += sampleRate) {
					const frames = Math.min(sampleRate, length - at);
					const data = new Float32Array(frames * numberOfChannels);
					for (const [c, channel] of channels.entries()) {
						data.set(channel.subarray(at, at + frames), c * frames);
					}
					const sample = new AudioSample({
						data,
						format: "f32-planar",
						numberOfChannels,
						sampleRate,
						timestamp: start + emitted / sampleRate,
					});
					await musicFree.add(sample);
					sample.close();
					emitted += frames;
					const upTo = start + (lead + emitted) / sampleRate;
					for (const copy of copies) await copy.addUntil(upTo);
					if (upTo - reported >= PROGRESS_EVERY_SECONDS) {
						reported = upTo;
						post({ kind: "progress", fraction: upTo / duration });
					}
				}
			};
			for await (const sample of new AudioSampleSink(audioTrack).samples()) {
				start ??= sample.timestamp;
				const channels = audioPlanes(sample);
				sample.close();
				await addMusicFree(await subtractor.push(channels));
			}
			await addMusicFree(await subtractor.flush());
			musicFree.close();
			for (const copy of copies) await copy.finish();
			for (const source of [videoSource, ...originalSources]) source.close();
			await output.finalize();
		} catch (error) {
			await output.cancel();
			throw error;
		}
	} finally {
		input.dispose();
	}
}

/** Copies a track's packets as they are, in order, up to a time asked for. */
function packetCopy(
	sink: EncodedPacketSink,
	add: (packet: EncodedPacket) => Promise<void>,
) {
	const packets = sink.packets();
	let next: IteratorResult<EncodedPacket> | null = null;
	const addUntil = async (time: number) => {
		next ??= await packets.next();
		while (!next.done && next.value.timestamp < time) {
			await add(next.value);
			next = await packets.next();
		}
	};
	return { addUntil, finish: () => addUntil(Number.POSITIVE_INFINITY) };
}

function openInput(file: File) {
	return new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
}
