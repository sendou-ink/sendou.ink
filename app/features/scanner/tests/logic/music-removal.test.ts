import { describe, expect, test } from "vitest";
import { fft } from "../../core/music/fft";
import {
	decodeMusicIndex,
	encodeMusicIndex,
	FINGERPRINT_SAMPLE_RATE,
	trackHashes,
} from "../../core/music/fingerprint";
import {
	removeMusic,
	renderReference,
	subtractReference,
} from "../../core/music/music-removal";
import {
	createMusicFinder,
	createMusicSubtractor,
} from "../../core/music/music-stream";
import { resample } from "../../core/music/resample";

const SAMPLE_RATE = 24_000;
// real DSP over many seconds of audio, several times slower on CI than locally
const AUDIO_TEST_TIMEOUT_MS = 60_000;

describe("fft", () => {
	test("matches a direct DFT and round-trips through the inverse", () => {
		const n = 64;
		const input = Float64Array.from(
			{ length: n },
			(_, i) => Math.sin(i * 1.3) + (i % 5),
		);
		const re = input.slice();
		const im = new Float64Array(n);
		fft(re, im);

		for (const k of [0, 1, 7, 31]) {
			let expectedRe = 0;
			let expectedIm = 0;
			for (let t = 0; t < n; t++) {
				expectedRe += input[t]! * Math.cos((2 * Math.PI * k * t) / n);
				expectedIm -= input[t]! * Math.sin((2 * Math.PI * k * t) / n);
			}
			expect(re[k]).toBeCloseTo(expectedRe, 9);
			expect(im[k]).toBeCloseTo(expectedIm, 9);
		}

		fft(re, im, true);
		for (let t = 0; t < n; t++) expect(re[t]).toBeCloseTo(input[t]!, 9);
	});
});

describe("resample", () => {
	test("keeps a tone below the new Nyquist", () => {
		const tone = (rate: number, length: number) =>
			Float32Array.from({ length }, (_, i) =>
				Math.sin((2 * Math.PI * 1000 * i) / rate),
			);
		const out = resample(tone(48_000, 48_000), 48_000, 12_000);

		expect(out.length).toBe(12_000);
		const expected = tone(12_000, 12_000);
		for (let i = 1000; i < 11_000; i += 997) {
			expect(out[i]).toBeCloseTo(expected[i]!, 2);
		}
	});
});

describe("encodeMusicIndex", () => {
	test("round-trips through decodeMusicIndex with hashes sorted", () => {
		const tracks = [
			{ id: "a", title: "A", file: "a.opus" },
			{ id: "b", title: "B (ver.)", file: "b.opus" },
		];
		const bytes = encodeMusicIndex(tracks, [
			[
				{ hash: 30, frame: 5 },
				{ hash: 10, frame: 1 },
			],
			[{ hash: 20, frame: 70_000 }],
		]);
		const index = decodeMusicIndex(bytes.slice().buffer);

		expect(index.tracks).toEqual(tracks);
		expect([...index.hashes]).toEqual([10, 20, 30]);
		expect([...index.values]).toEqual([1, (1 << 20) | 70_000, 5]);
	});
});

describe("removeMusic", { timeout: AUDIO_TEST_TIMEOUT_MS }, () => {
	test("takes the music out and keeps the other sounds", async () => {
		const music = melody(40);
		const index = indexOf(music);
		// the clip hears the track from 6.5 s in, quieter and a few ms late, over noise bursts
		const offset = 6.5;
		const seconds = 20;
		const sounds = gameSounds(seconds);
		const musicPart = Float32Array.from(
			{ length: seconds * SAMPLE_RATE },
			(_, i) =>
				0.5 * (music[i + Math.round((offset - 0.0031) * SAMPLE_RATE)] ?? 0),
		);
		const clip = Float32Array.from(musicPart, (value, i) => value + sounds[i]!);

		const result = await removeMusic(
			{ channels: [clip], sampleRate: SAMPLE_RATE },
			{ index, loadTrack: async () => [music] },
		);

		expect(result?.trackIds).toEqual(["melody"]);
		const out = result!.channels[0]!;
		const leftover = Float32Array.from(out, (value, i) => value - sounds[i]!);
		// ignoring the edges, where the gain has less to go on
		const middle = (x: Float32Array) =>
			x.subarray(2 * SAMPLE_RATE, -2 * SAMPLE_RATE);
		expect(
			decibels(energy(middle(leftover)) / energy(middle(musicPart))),
		).toBeLessThan(-15);
		expect(
			decibels(energy(middle(leftover)) / energy(middle(sounds))),
		).toBeLessThan(-10);
	});

	test("picks the exact copy of a passage the track repeats with changes", async () => {
		// the second half replays the first with another voice on top: both
		// halves share most fingerprints, only the first cancels the clip
		const verse = melody(20);
		const variation = melody(20, 99);
		const music = new Float32Array(40 * SAMPLE_RATE);
		music.set(verse);
		music.set(
			Float32Array.from(verse, (value, i) => value + 0.5 * variation[i]!),
			20 * SAMPLE_RATE,
		);
		const index = indexOf(music);
		const sounds = gameSounds(15);
		const musicPart = Float32Array.from(
			{ length: 15 * SAMPLE_RATE },
			(_, i) => 0.5 * music[i + 2 * SAMPLE_RATE]!,
		);
		const clip = Float32Array.from(musicPart, (value, i) => value + sounds[i]!);

		const result = await removeMusic(
			{ channels: [clip], sampleRate: SAMPLE_RATE },
			{ index, loadTrack: async () => [music] },
		);

		const out = result!.channels[0]!;
		const leftover = Float32Array.from(out, (value, i) => value - sounds[i]!);
		const middle = (x: Float32Array) =>
			x.subarray(2 * SAMPLE_RATE, -2 * SAMPLE_RATE);
		expect(
			decibels(energy(middle(leftover)) / energy(middle(musicPart))),
		).toBeLessThan(-15);
	});

	test("finds music whose fingerprint votes all land on one offset", async () => {
		// found by search: here not one vote spills to the neighboring offsets
		const music = melody(40);
		const index = indexOf(music);
		const musicPart = new Float32Array(20 * SAMPLE_RATE);
		for (let i = 8 * SAMPLE_RATE; i < musicPart.length; i++) {
			musicPart[i] = 0.5 * music[i + 11 * SAMPLE_RATE]!;
		}
		const sounds = gameSounds(20);
		const clip = Float32Array.from(musicPart, (value, i) => value + sounds[i]!);

		const result = await removeMusic(
			{ channels: [clip], sampleRate: SAMPLE_RATE },
			{ index, loadTrack: async () => [music] },
		);

		const leftover = Float32Array.from(
			result!.channels[0]!,
			(value, i) => value - sounds[i]!,
		);
		const playing = (x: Float32Array) =>
			x.subarray(10 * SAMPLE_RATE, 18 * SAMPLE_RATE);
		expect(
			decibels(energy(playing(leftover)) / energy(playing(musicPart))),
		).toBeLessThan(-15);
	});

	test("is null when no indexed music plays", async () => {
		const index = indexOf(melody(20));
		const result = await removeMusic(
			{ channels: [gameSounds(10)], sampleRate: SAMPLE_RATE },
			{ index, loadTrack: async () => [] },
		);

		expect(result).toBeNull();
	});
});

describe("createMusicFinder", { timeout: AUDIO_TEST_TIMEOUT_MS }, () => {
	test("finds music across windows and the subtractor takes it out", async () => {
		// the track playing from 20 s to 110 s, across the finder's two windows (0–90 s and 30–120 s)
		const music = melody(100);
		const index = indexOf(music);
		const seconds = 120;
		const sounds = gameSounds(seconds);
		const musicPart = new Float32Array(seconds * SAMPLE_RATE);
		for (let i = 20 * SAMPLE_RATE; i < 110 * SAMPLE_RATE; i++) {
			musicPart[i] = 0.5 * music[i - 15 * SAMPLE_RATE]!;
		}
		const sound = Float32Array.from(
			musicPart,
			(value, i) => value + sounds[i]!,
		);

		const finder = createMusicFinder({
			sampleRate: SAMPLE_RATE,
			index,
			loadLowTrack: async () =>
				resample(music, SAMPLE_RATE, FINGERPRINT_SAMPLE_RATE),
		});
		for (const block of blocks(sound, 77_777)) await finder.push(block);
		const segments = await finder.finish();
		const subtractor = createMusicSubtractor({
			segments,
			sampleRate: SAMPLE_RATE,
			numberOfChannels: 1,
			loadTrack: async () => [music],
		});
		const parts: Float32Array[] = [];
		for (const block of blocks(sound, 50_000)) {
			parts.push((await subtractor.push([block]))[0]!);
		}
		parts.push((await subtractor.flush())[0]!);
		const out = join(parts);

		expect(out.length).toBe(sound.length);
		const leftover = Float32Array.from(out, (value, i) => value - sounds[i]!);
		const playing = (x: Float32Array) =>
			x.subarray(22 * SAMPLE_RATE, 108 * SAMPLE_RATE);
		expect(
			decibels(energy(playing(leftover)) / energy(playing(musicPart))),
		).toBeLessThan(-15);
		const before = (x: Float32Array) => x.subarray(0, 18 * SAMPLE_RATE);
		const changed = Float32Array.from(
			before(out),
			(value, i) => value - sound[i]!,
		);
		expect(decibels(energy(changed) / energy(before(sound)))).toBeLessThan(
			-100,
		);
	});
});

describe("createMusicSubtractor", { timeout: AUDIO_TEST_TIMEOUT_MS }, () => {
	test("comes out as if the whole sound was subtracted at once", async () => {
		const music = melody(100);
		const sounds = gameSounds(90);
		const sound = Float32Array.from(
			sounds,
			(value, i) => value + 0.5 * music[i + 3 * SAMPLE_RATE]!,
		);
		const segments = [
			{ track: 0, start: 5, end: 40, offset: 3, drift: 0 },
			{ track: 0, start: 40, end: 85, offset: 3, drift: 0 },
		];
		const whole = subtractReference(
			sound,
			renderReference(segments, {
				trackChannel: () => music,
				from: 0,
				length: sound.length,
				sampleRate: SAMPLE_RATE,
			}),
			SAMPLE_RATE,
		);

		const subtractor = createMusicSubtractor({
			segments,
			sampleRate: SAMPLE_RATE,
			numberOfChannels: 1,
			loadTrack: async () => [music],
		});
		const parts: Float32Array[] = [];
		for (const block of blocks(sound, 33_333)) {
			parts.push((await subtractor.push([block]))[0]!);
		}
		parts.push((await subtractor.flush())[0]!);
		const chunked = join(parts);

		const difference = Float32Array.from(
			chunked,
			(value, i) => value - whole[i]!,
		);
		expect(decibels(energy(difference) / energy(whole))).toBeLessThan(-50);
	});
});

function indexOf(music: Float32Array) {
	const bytes = encodeMusicIndex(
		[{ id: "melody", title: "Melody", file: "melody.opus" }],
		[trackHashes(music, SAMPLE_RATE)],
	);
	return decodeMusicIndex(bytes.slice().buffer);
}

/** Two voices of notes with a few harmonics, new pitches every 100 ms, from a fixed seed. */
function melody(seconds: number, seed = 7): Float32Array {
	const random = seeded(seed);
	const out = new Float32Array(seconds * SAMPLE_RATE);
	const noteLength = Math.round(0.1 * SAMPLE_RATE);
	for (let start = 0; start < out.length; start += noteLength) {
		for (let voice = 0; voice < 2; voice++) {
			const frequency = 220 * 2 ** (Math.floor(random() * 36) / 12);
			for (let i = 0; i < noteLength && start + i < out.length; i++) {
				const t = i / SAMPLE_RATE;
				const envelope = Math.min(1, i / 100, (noteLength - i) / 100);
				let value = 0;
				for (let harmonic = 1; harmonic <= 3; harmonic++) {
					value += Math.sin(2 * Math.PI * frequency * harmonic * t) / harmonic;
				}
				out[start + i]! += 0.1 * envelope * value;
			}
		}
	}
	return out;
}

/** Bursts of noise, like shots and splats. */
function gameSounds(seconds: number): Float32Array {
	const random = seeded(3);
	const out = new Float32Array(seconds * SAMPLE_RATE);
	for (let burst = 0; burst < seconds * 3; burst++) {
		const start = Math.floor(random() * (out.length - SAMPLE_RATE));
		const length = Math.floor(
			0.05 * SAMPLE_RATE + random() * 0.2 * SAMPLE_RATE,
		);
		for (let i = 0; i < length; i++) {
			out[start + i]! +=
				0.15 * (random() * 2 - 1) * Math.exp(-i / (length / 3));
		}
	}
	return out;
}

function blocks(x: Float32Array, size: number): Float32Array[] {
	const out: Float32Array[] = [];
	for (let at = 0; at < x.length; at += size) out.push(x.slice(at, at + size));
	return out;
}

function join(parts: Float32Array[]): Float32Array {
	const out = new Float32Array(
		parts.reduce((sum, part) => sum + part.length, 0),
	);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

function seeded(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
		return state / 2 ** 31;
	};
}

function energy(x: Float32Array): number {
	let sum = 0;
	for (const value of x) sum += value * value;
	return sum;
}

function decibels(ratio: number): number {
	return 10 * Math.log10(ratio);
}
