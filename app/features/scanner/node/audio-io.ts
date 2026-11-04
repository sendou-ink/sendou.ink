/**
 * Audio in and out for the scanner scripts through ffmpeg (on PATH): any
 * file decoded to planar float channels at a chosen rate, whole or streamed
 * block by block, and channels written out as a WAV.
 */
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const MAX_BUFFER_BYTES = 2 ** 31 - 1;

export function decodeAudioFile(
	path: string,
	{
		sampleRate,
		channels = 2,
		start,
		duration,
	}: {
		sampleRate: number;
		channels?: number;
		start?: number;
		duration?: number;
	},
): Float32Array[] {
	const args = ["-v", "error"];
	if (start !== undefined) args.push("-ss", String(start));
	if (duration !== undefined) args.push("-t", String(duration));
	args.push(
		"-i",
		path,
		"-vn",
		"-f",
		"f32le",
		"-ac",
		String(channels),
		"-ar",
		String(sampleRate),
		"-",
	);
	const result = spawnSync("ffmpeg", args, { maxBuffer: MAX_BUFFER_BYTES });
	if (result.status !== 0) {
		throw new Error(`ffmpeg failed on ${path}: ${result.stderr.toString()}`);
	}
	const bytes = result.stdout;
	const interleaved = new Float32Array(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	);
	return deinterleave(interleaved, channels);
}

/**
 * A file's first audio track decoded block by block, planar float channels
 * at `sampleRate`, so a file of hours never sits in memory.
 */
export async function* streamAudioFile(
	path: string,
	{ sampleRate, channels }: { sampleRate: number; channels: number },
): AsyncGenerator<Float32Array[]> {
	const ffmpeg = spawn(
		"ffmpeg",
		[
			"-v",
			"error",
			"-i",
			path,
			"-map",
			"0:a:0",
			"-f",
			"f32le",
			"-ac",
			String(channels),
			"-ar",
			String(sampleRate),
			"-",
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	let stderr = "";
	ffmpeg.stderr.on("data", (data) => {
		stderr += data;
	});
	const exited = new Promise<number | null>((resolve) =>
		ffmpeg.on("close", resolve),
	);
	const frameBytes = 4 * channels;
	let rest = Buffer.alloc(0);
	for await (const data of ffmpeg.stdout as AsyncIterable<Buffer>) {
		const bytes = rest.length > 0 ? Buffer.concat([rest, data]) : data;
		const frames = Math.floor(bytes.length / frameBytes);
		rest = Buffer.from(bytes.subarray(frames * frameBytes));
		if (frames === 0) continue;
		const interleaved = new Float32Array(
			bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + frames * frameBytes,
			),
		);
		yield deinterleave(interleaved, channels);
	}
	if ((await exited) !== 0) {
		throw new Error(`ffmpeg failed on ${path}: ${stderr}`);
	}
}

/** Planar channels into one interleaved little-endian float buffer, ffmpeg's `f32le`. */
export function interleave(channels: Float32Array[]): Buffer {
	const frames = channels[0]?.length ?? 0;
	const out = new Float32Array(frames * channels.length);
	for (const [c, channel] of channels.entries()) {
		for (let i = 0; i < frames; i++) out[i * channels.length + c] = channel[i]!;
	}
	return Buffer.from(out.buffer);
}

/** 16-bit PCM WAV. */
export function writeWav(
	path: string,
	channels: Float32Array[],
	sampleRate: number,
): void {
	const frames = channels[0]?.length ?? 0;
	const dataBytes = frames * channels.length * 2;
	const buffer = Buffer.alloc(44 + dataBytes);
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataBytes, 4);
	buffer.write("WAVE", 8);
	buffer.write("fmt ", 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(channels.length, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * channels.length * 2, 28);
	buffer.writeUInt16LE(channels.length * 2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataBytes, 40);
	let at = 44;
	for (let i = 0; i < frames; i++) {
		for (const channel of channels) {
			const value = Math.max(-1, Math.min(1, channel[i]!));
			buffer.writeInt16LE(Math.round(value * 32767), at);
			at += 2;
		}
	}
	writeFileSync(path, buffer);
}

function deinterleave(
	interleaved: Float32Array,
	channels: number,
): Float32Array[] {
	const frames = Math.floor(interleaved.length / channels);
	return Array.from({ length: channels }, (_, c) => {
		const channel = new Float32Array(frames);
		for (let i = 0; i < frames; i++)
			channel[i] = interleaved[i * channels + c]!;
		return channel;
	});
}
