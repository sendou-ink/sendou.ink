/**
 * Clip export off a VoD file: the packets from the keyframe at or before
 * `start` up to `end` are copied into a fresh MP4 (video + audio, no decode
 * or re-encode, so a minute of 1080p takes well under a second). A clip can
 * only start at a keyframe, so it may begin up to a GOP early. `maxSeconds`
 * caps the requested range, not the keyframe lead-in: measuring it from the
 * keyframe would trim the end — the last kill and its tail — off a long
 * streak in a long-GOP recording.
 */
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	Input,
	type InputAudioTrack,
	Mp4OutputFormat,
	Output,
	VideoSampleSink,
} from "mediabunny";

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;

export interface ExtractedClip {
	blob: Blob;
	/** seconds into the source the clip really starts at (the keyframe) */
	start: number;
	/** seconds into the source the clip really ends at */
	end: number;
	hasAudio: boolean;
}

export async function extractVodClip(
	file: File,
	{
		start,
		end,
		maxSeconds,
	}: { start: number; end: number; maxSeconds: number },
): Promise<ExtractedClip> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		const videoCodec = videoTrack?.codec;
		if (!videoTrack || !videoCodec) throw new Error("no video track");
		const format = new Mp4OutputFormat({ fastStart: "in-memory" });
		if (!format.getSupportedVideoCodecs().includes(videoCodec)) {
			throw new Error(`${videoCodec} video cannot be clipped into an MP4`);
		}
		const videoPackets = new EncodedPacketSink(videoTrack);
		const firstKey =
			(await videoPackets.getKeyPacket(start, { verifyKeyPackets: true })) ??
			(await videoPackets.getFirstPacket({ verifyKeyPackets: true }));
		if (!firstKey) throw new Error("no video packets");
		const clipStart = firstKey.timestamp;
		const clipEnd = Math.min(end, start + maxSeconds);

		const audioTrack = await input.getPrimaryAudioTrack();
		const audioCodec = audioTrack?.codec;
		const audioSource =
			audioTrack &&
			audioCodec &&
			format.getSupportedAudioCodecs().includes(audioCodec)
				? new EncodedAudioPacketSource(audioCodec)
				: null;

		const target = new BufferTarget();
		const output = new Output({ format, target });
		const videoSource = new EncodedVideoPacketSource(videoCodec);
		output.addVideoTrack(videoSource, { rotation: videoTrack.rotation });
		if (audioSource) output.addAudioTrack(audioSource);
		await output.start();
		try {
			const videoMeta = {
				decoderConfig: (await videoTrack.getDecoderConfig()) ?? undefined,
			};
			for await (const packet of videoPackets.packets(firstKey, undefined, {
				verifyKeyPackets: true,
			})) {
				if (packet.timestamp >= clipEnd) break;
				const timestamp = packet.timestamp - clipStart;
				// an open GOP's leading frames present before the keyframe they follow
				if (timestamp < 0) continue;
				await videoSource.add(packet.clone({ timestamp }), videoMeta);
			}
			videoSource.close();
			if (audioSource) {
				await copyAudio(audioTrack!, audioSource, clipStart, clipEnd);
			}
			await output.finalize();
		} catch (error) {
			await output.cancel();
			throw error;
		}
		return {
			blob: new Blob([target.buffer!], { type: format.mimeType }),
			start: clipStart,
			end: clipEnd,
			hasAudio: audioSource !== null,
		};
	} finally {
		input.dispose();
	}
}

async function copyAudio(
	track: InputAudioTrack,
	source: EncodedAudioPacketSource,
	clipStart: number,
	clipEnd: number,
): Promise<void> {
	const packets = new EncodedPacketSink(track);
	const meta = { decoderConfig: (await track.getDecoderConfig()) ?? undefined };
	const first =
		(await packets.getPacket(clipStart)) ?? (await packets.getFirstPacket());
	if (first) {
		for await (const packet of packets.packets(first)) {
			if (packet.timestamp >= clipEnd) break;
			const timestamp = packet.timestamp - clipStart;
			if (timestamp < 0) continue;
			await source.add(packet.clone({ timestamp }), meta);
		}
	}
	source.close();
}

/** A small JPEG data URL of the frame at `t` seconds, for a clip card; null when the file can't be decoded there. */
export async function vodFrameThumbnail(
	file: File,
	t: number,
): Promise<string | null> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) return null;
		const sample = await new VideoSampleSink(track).getSample(t);
		if (!sample) return null;
		try {
			const canvas = document.createElement("canvas");
			canvas.width = THUMBNAIL_WIDTH;
			canvas.height = THUMBNAIL_HEIGHT;
			sample.draw(
				canvas.getContext("2d")!,
				0,
				0,
				THUMBNAIL_WIDTH,
				THUMBNAIL_HEIGHT,
			);
			return canvas.toDataURL("image/jpeg", 0.7);
		} finally {
			sample.close();
		}
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}
