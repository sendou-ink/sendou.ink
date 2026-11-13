/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Takes the battle music out of a video's or clip's sound with the music
 * set from `pnpm scanner:build-music-index`.
 *
 * By default the way the clip dialog's "Mute music" does
 * (core/music/music-removal.ts), writing the result and the untouched sound
 * beside it as WAVs for comparing:
 *
 *   pnpm scanner:remove-music <video> [--start S] [--duration S] [--out file.wav]
 *
 * With --video, a whole VoD the way the VoD view's download does
 * (core/music/music-stream.ts): the video again, its picture copied, the
 * music-free sound as the first audio track and the original tracks after
 * it. Same container as the input unless --out says otherwise.
 *
 *   pnpm scanner:remove-music <video> --video [--out file.mkv]
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import * as R from "remeda";
import {
	decodeMusicIndex,
	FINGERPRINT_SAMPLE_RATE,
	type MusicIndex,
} from "../../app/features/scanner/core/music/fingerprint";
import { removeMusic } from "../../app/features/scanner/core/music/music-removal";
import {
	createMusicFinder,
	createMusicSubtractor,
} from "../../app/features/scanner/core/music/music-stream";
import { MUSIC_DIR as DEFAULT_MUSIC_DIR } from "../../app/features/scanner/node/assets-dir";
import {
	decodeAudioFile,
	interleave,
	streamAudioFile,
	writeWav,
} from "../../app/features/scanner/node/audio-io";

const SAMPLE_RATE = 48_000;
const MIN_AUDIO_BITRATE = 192_000;
const MUSIC_DIR = process.env.SCANNER_MUSIC_DIR ?? DEFAULT_MUSIC_DIR;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		start: { type: "string" },
		duration: { type: "string" },
		out: { type: "string" },
		video: { type: "boolean" },
	},
});
const input = positionals[0];
if (!input) {
	throw new Error(
		"usage: pnpm scanner:remove-music <video> [--start S] [--duration S] [--out file.wav] | <video> --video [--out file]",
	);
}

const indexBytes = readFileSync(join(MUSIC_DIR, "index.bin"));
const index = decodeMusicIndex(
	indexBytes.buffer.slice(
		indexBytes.byteOffset,
		indexBytes.byteOffset + indexBytes.byteLength,
	),
);

if (values.video) {
	await removeFromVideo(input, index);
} else {
	await removeFromClip(input, index);
}

async function removeFromClip(videoPath: string, musicIndex: MusicIndex) {
	const channels = decodeAudioFile(videoPath, {
		sampleRate: SAMPLE_RATE,
		start: values.start ? Number(values.start) : undefined,
		duration: values.duration ? Number(values.duration) : undefined,
	});

	const startedAt = performance.now();
	const result = await removeMusic(
		{ channels, sampleRate: SAMPLE_RATE },
		{
			index: musicIndex,
			loadTrack: async (id) =>
				decodeAudioFile(trackPath(musicIndex, id), { sampleRate: SAMPLE_RATE }),
		},
	);
	const elapsed = Math.round(performance.now() - startedAt);
	if (!result) {
		console.log(`no known music found (${elapsed} ms)`);
		process.exit(1);
	}

	const out =
		values.out ?? `${basename(videoPath).replace(/\.[^.]+$/, "")}-no-music.wav`;
	writeWav(out, result.channels, SAMPLE_RATE);
	writeWav(out.replace(/\.wav$/, "-original.wav"), channels, SAMPLE_RATE);
	const titles = result.trackIds.map(
		(id) => musicIndex.tracks.find((track) => track.id === id)!.title,
	);
	console.log(
		`took out ${titles.join(", ")} over ${result.seconds.toFixed(0)} s in ${elapsed} ms → ${out}`,
	);
}

async function removeFromVideo(videoPath: string, musicIndex: MusicIndex) {
	const audio = probeAudio(videoPath);
	const out =
		values.out ??
		`${basename(videoPath, extname(videoPath))}-no-music${extname(videoPath)}`;
	const startedAt = performance.now();
	const elapsed = () =>
		`${((performance.now() - startedAt) / 1000).toFixed(0)} s`;

	const finder = createMusicFinder({
		sampleRate: FINGERPRINT_SAMPLE_RATE,
		index: musicIndex,
		loadLowTrack: async (track) =>
			decodeAudioFile(join(MUSIC_DIR, musicIndex.tracks[track]!.file), {
				sampleRate: FINGERPRINT_SAMPLE_RATE,
				channels: 1,
			})[0]!,
		onWindow: (seconds) =>
			process.stdout.write(
				`\rfinding music ${progress(seconds, audio.duration)} (${elapsed()})`,
			),
	});
	for await (const [mono] of streamAudioFile(videoPath, {
		sampleRate: FINGERPRINT_SAMPLE_RATE,
		channels: 1,
	})) {
		await finder.push(mono!);
	}
	const segments = await finder.finish();
	const musicSeconds = segments.reduce(
		(sum, segment) => sum + segment.end - segment.start,
		0,
	);
	const titles = R.unique(segments.map((segment) => segment.track)).map(
		(track) => musicIndex.tracks[track]!.title,
	);
	console.log(
		`\nfound ${musicSeconds.toFixed(0)} s of music in ${segments.length} segments (${titles.join(", ")}) in ${elapsed()}`,
	);
	if (segments.length === 0) {
		console.log("no known music found, nothing written");
		process.exit(1);
	}
	const findSeconds = (performance.now() - startedAt) / 1000;

	const subtractor = createMusicSubtractor({
		segments,
		sampleRate: audio.sampleRate,
		numberOfChannels: audio.channels,
		loadTrack: async (track) =>
			decodeAudioFile(join(MUSIC_DIR, musicIndex.tracks[track]!.file), {
				sampleRate: audio.sampleRate,
				channels: audio.channels,
			}),
	});
	const encoder = spawn(
		"ffmpeg",
		[
			"-v",
			"error",
			"-y",
			"-i",
			videoPath,
			"-itsoffset",
			String(audio.startOffset),
			"-f",
			"f32le",
			"-ar",
			String(audio.sampleRate),
			"-ac",
			String(audio.channels),
			"-i",
			"pipe:0",
			"-map",
			"0:v",
			"-map",
			"1:a",
			"-map",
			"0:a",
			"-c",
			"copy",
			"-c:a:0",
			"aac",
			"-b:a:0",
			String(Math.max(MIN_AUDIO_BITRATE, audio.bitrate)),
			"-metadata:s:a:0",
			"title=No music",
			"-disposition:a:0",
			"default",
			"-disposition:a:1",
			"0",
			out,
		],
		{ stdio: ["pipe", "inherit", "inherit"] },
	);
	const encoded = new Promise<number | null>((resolve) =>
		encoder.on("close", resolve),
	);
	const write = async (channels: Float32Array[]) => {
		if ((channels[0]?.length ?? 0) === 0) return;
		if (!encoder.stdin.write(interleave(channels))) {
			await new Promise((resolve) => encoder.stdin.once("drain", resolve));
		}
	};
	let decoded = 0;
	for await (const channels of streamAudioFile(videoPath, {
		sampleRate: audio.sampleRate,
		channels: audio.channels,
	})) {
		await write(await subtractor.push(channels));
		const before = Math.floor(decoded / audio.sampleRate / 60);
		decoded += channels[0]!.length;
		if (Math.floor(decoded / audio.sampleRate / 60) !== before) {
			process.stdout.write(
				`\rwriting ${progress(decoded / audio.sampleRate, audio.duration)} (${elapsed()})`,
			);
		}
	}
	await write(await subtractor.flush());
	encoder.stdin.end();
	if ((await encoded) !== 0) throw new Error("ffmpeg failed writing the video");
	const totalSeconds = (performance.now() - startedAt) / 1000;
	console.log(
		`\nwrote ${out} in ${totalSeconds.toFixed(0)} s (finding ${findSeconds.toFixed(0)} s, writing ${(totalSeconds - findSeconds).toFixed(0)} s), peak RSS ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`,
	);
}

function trackPath(musicIndex: MusicIndex, id: string) {
	return join(
		MUSIC_DIR,
		musicIndex.tracks.find((track) => track.id === id)!.file,
	);
}

function probeAudio(path: string) {
	const result = spawnSync("ffprobe", [
		"-v",
		"error",
		"-select_streams",
		"a:0",
		"-show_entries",
		"stream=sample_rate,channels,bit_rate,start_time:format=start_time,duration",
		"-of",
		"json",
		path,
	]);
	if (result.status !== 0) {
		throw new Error(`ffprobe failed on ${path}: ${result.stderr.toString()}`);
	}
	const probed = JSON.parse(result.stdout.toString()) as {
		streams: {
			sample_rate?: string;
			channels?: number;
			bit_rate?: string;
			start_time?: string;
		}[];
		format: { start_time?: string; duration?: string };
	};
	const stream = probed.streams[0];
	if (!stream) throw new Error(`${path} has no audio`);
	return {
		sampleRate: Number(stream.sample_rate),
		channels: stream.channels ?? 2,
		bitrate: Number(stream.bit_rate) || 0,
		startOffset:
			(Number(stream.start_time) || 0) -
			(Number(probed.format.start_time) || 0),
		duration: Number(probed.format.duration) || 0,
	};
}

function progress(seconds: number, duration: number) {
	return duration > 0
		? `${Math.min(100, (100 * seconds) / duration).toFixed(0)}%`
		: `${seconds.toFixed(0)} s`;
}
