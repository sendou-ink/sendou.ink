/**
 * Trimming a saved clip for download, and the filmstrip its trim bar shows.
 * The cut copies the packets from the keyframe at or before `start` and an
 * MP4 edit list hides the lead-in, so it is frame accurate without decoding
 * or re-encoding anything.
 */
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	CanvasSink,
	Conversion,
	EncodedPacketSink,
	Input,
	Mp4OutputFormat,
	Output,
} from "mediabunny";

export async function trimClip(
	blob: Blob,
	{ start, end }: { start: number; end: number },
): Promise<Blob> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(blob),
	});
	try {
		const format = new Mp4OutputFormat({ fastStart: "in-memory" });
		const target = new BufferTarget();
		const conversion = await Conversion.init({
			input,
			output: new Output({ format, target }),
			trim: { start, end },
			showWarnings: false,
		});
		if (!conversion.isValid) throw new Error("this clip can't be trimmed");
		await conversion.execute();
		return new Blob([target.buffer!], { type: format.mimeType });
	} finally {
		input.dispose();
	}
}

/**
 * `count` frames spread evenly over the clip as JPEG data URLs, each snapped
 * to its nearest earlier keyframe so only keyframes get decoded. Empty when
 * the clip's video can't be decoded.
 */
export async function clipFilmstrip(
	blob: Blob,
	{ count, height }: { count: number; height: number },
): Promise<string[]> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(blob),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) return [];
		const duration = await track.computeDuration();
		const packets = new EncodedPacketSink(track);
		const timestamps: number[] = [];
		for (let i = 0; i < count; i++) {
			const key = await packets.getKeyPacket(((i + 0.5) / count) * duration, {
				verifyKeyPackets: true,
			});
			timestamps.push(key?.timestamp ?? 0);
		}

		const frames: string[] = [];
		const canvases = new CanvasSink(track, { height });
		for await (const frame of canvases.canvasesAtTimestamps(timestamps)) {
			frames.push(
				frame && frame.canvas instanceof HTMLCanvasElement
					? frame.canvas.toDataURL("image/jpeg", 0.7)
					: "",
			);
		}
		return frames;
	} catch {
		return [];
	} finally {
		input.dispose();
	}
}
