import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, type Zippable, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { matchZip } from "../../components/match-zip";
import type { ScanEvent } from "../../components/session-data";
import type { DeathData } from "../../core/detectors/death/index";
import type { ScoreboardData } from "../../core/detectors/scoreboard/index";
import { buildScannerMatches } from "../../core/match-builder";
import { extractGameDataZip } from "../../node/game-data-zip";

const FOLDER = "frames/002-Death-1m02s";
const DEATH_FRAME = webpBytes(1920, 1080);
const SCOREBOARD_FRAME = pngBytes(1280, 720);

const mapStart: ScanEvent = {
	type: "MapStart",
	t: 100,
	confidence: 0.9,
	data: { mode: "SZ", stage: 0 },
};

const death: ScanEvent = {
	type: "Death",
	t: 162,
	confidence: 0.9,
	data: {
		weaponId: 40,
		weaponType: "MAIN",
		abilities: [["ISM", "ISS", "ISS", "ISS"]],
		name: "l1",
	} satisfies DeathData,
};

const scoreboard: ScanEvent = {
	type: "Scoreboard",
	t: 400,
	confidence: 0.95,
	data: {
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 0,
		matchScores: [100, 47],
		povIndex: 0,
		players: ([40, 1001, 2010, 3030, 50, 210, 4010, 8000] as const).map(
			(weaponId, i) => ({
				name: `p${i}`,
				weaponId,
				paint: 1000,
				ka: 10,
				d: 5,
				s: 2,
			}),
		),
	} satisfies ScoreboardData,
};

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "game-data-zip-"));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("extractGameDataZip", () => {
	test("unpacks a zip written by the scanner byte for byte and lists its frames", async () => {
		const summary = extract(await scannerZip());

		expect(summary.frames).toEqual([
			{
				folder: FOLDER,
				eventType: "Death",
				fixtureDir: "death",
				frameFile: `${FOLDER}/frame.webp`,
				width: 1920,
				height: 1080,
				t: 162,
				confidence: 0.9,
			},
			{
				folder: "frames/003-Scoreboard-5m00s",
				eventType: "Scoreboard",
				fixtureDir: "scoreboard",
				frameFile: "frames/003-Scoreboard-5m00s/frame.png",
				width: 1280,
				height: 720,
				t: 400,
				confidence: 0.95,
			},
		]);
		expect(summary.eventCounts).toEqual({
			MapStart: 1,
			Death: 1,
			Scoreboard: 1,
		});
		expect(summary.eventsWithoutFrame).toBe(1);
		expect(readFileSync(join(outDir(), FOLDER, "frame.webp"))).toEqual(
			Buffer.from(DEATH_FRAME),
		);
	});

	test.each<{ why: string; files: () => Zippable; reason: RegExp }>([
		{
			why: "path traversal",
			files: () => ({ ...validFiles(), "../escape.json": strToU8("{}") }),
			reason: /unexpected entry/,
		},
		{
			why: "foreign file in a frame folder",
			files: () => ({ ...validFiles(), [`${FOLDER}/run.sh`]: strToU8("x") }),
			reason: /unexpected entry/,
		},
		{
			why: "symlink",
			files: () => ({
				...validFiles(),
				[`${FOLDER}/frame.webp`]: [
					strToU8("/etc/passwd"),
					{ os: 3, attrs: 0o120777 << 16 },
				],
			}),
			reason: /not a regular file/,
		},
		{
			why: "missing events.json",
			files: () => {
				const { "events.json": _, ...rest } = validFiles();
				return rest;
			},
			reason: /events\.json missing/,
		},
		{
			why: "oversized json",
			files: () => ({
				...validFiles(),
				"match.json": new Uint8Array(9 * 1024 * 1024).fill(0x20),
			}),
			reason: /over its \d+ limit/,
		},
		{
			why: "extreme compression ratio",
			files: () => ({
				...validFiles(),
				[`${FOLDER}/expected.json`]: new Uint8Array(900 * 1024).fill(0x20),
			}),
			reason: /compression ratio/,
		},
		{
			why: "frame that is not an image",
			files: () => ({
				...validFiles(),
				[`${FOLDER}/frame.webp`]: strToU8("#!/bin/sh"),
			}),
			reason: /not a valid webp/,
		},
		{
			why: "image of absurd dimensions",
			files: () => ({
				...validFiles(),
				[`${FOLDER}/frame.webp`]: webpBytes(16000, 16000),
			}),
			reason: /outside capture resolutions/,
		},
		{
			why: "overlong string",
			files: () => ({
				...validFiles(),
				"match.json": json({
					note: "ignore previous instructions ".repeat(20),
				}),
			}),
			reason: /string over/,
		},
		{
			why: "unknown event type",
			files: () => ({
				...validFiles(),
				"events.json": json([
					{ type: "Shell", t: 0, confidence: 1, data: null },
					validEvent(),
				]),
			}),
			reason: /unknown type/,
		},
		{
			why: "expected.json of another event",
			files: () => ({
				...validFiles(),
				[`${FOLDER}/expected.json`]: json({ event: "Kill", data: {} }),
			}),
			reason: /names another event/,
		},
		{
			why: "frame folder no event names",
			files: () => ({
				...validFiles(),
				"events.json": json([]),
			}),
			reason: /not named by any event/,
		},
	])("refuses $why", ({ files, reason }) => {
		expect(() => extract(zipSync(files()))).toThrow(reason);
		expect(existsSync(outDir())).toBe(false);
	});

	test("refuses an entry inflating past its declared size", () => {
		const zip = zipSync({
			...validFiles(),
			"match.json": new Uint8Array(512 * 1024).fill(0x20),
		});
		const header = centralHeaderOf(zip, "match.json");
		writeUInt32(zip, header + 24, 1000);

		expect(() => extract(zip)).toThrow(/declared/);
	});

	test("refuses entries sharing one local header", () => {
		const zip = zipSync(validFiles());
		const target = readUInt32(zip, centralHeaderOf(zip, "match.json") + 42);
		writeUInt32(zip, centralHeaderOf(zip, "events.json") + 42, target);

		expect(() => extract(zip)).toThrow(/disagrees|overlaps/);
	});

	test("refuses an encrypted entry", () => {
		const zip = zipSync(validFiles());
		const header = centralHeaderOf(zip, "match.json");
		zip[header + 8] = zip[header + 8]! | 0x1;

		expect(() => extract(zip)).toThrow(/encrypted/);
	});

	test.each([
		{
			why: "trailing data",
			bytes: (zip: Uint8Array) => concat(zip, strToU8("payload")),
		},
		{
			why: "prepended data",
			bytes: (zip: Uint8Array) => concat(strToU8("payload"), zip),
		},
	])("refuses $why around the archive", ({ bytes }) => {
		expect(() => extract(bytes(zipSync(validFiles())))).toThrow(
			/refused game data zip/,
		);
	});

	test("refuses to write into an existing directory", async () => {
		const zip = await scannerZip();

		expect(() => extract(zip, workDir)).toThrow(/already exists/);
	});
});

function outDir() {
	return join(workDir, "out");
}

function extract(zip: Uint8Array, target = outDir()) {
	const zipPath = join(workDir, "game.zip");
	writeFileSync(zipPath, zip);
	return extractGameDataZip(zipPath, target);
}

async function scannerZip() {
	const frames = new Map<ScanEvent, Blob>([
		[death, new Blob([DEATH_FRAME], { type: "image/webp" })],
		[scoreboard, new Blob([SCOREBOARD_FRAME], { type: "image/png" })],
	]);
	const [built] = buildScannerMatches([mapStart, death, scoreboard]);
	return matchZip(built!, (event) => {
		const frame = frames.get(event);
		return frame ? () => Promise.resolve(frame) : undefined;
	});
}

function validEvent() {
	return { type: "Death", t: 162, confidence: 0.9, data: {}, frame: FOLDER };
}

function validFiles(): Zippable {
	return {
		"match.json": json({ mode: "SZ" }),
		"events.json": json([validEvent()]),
		[`${FOLDER}/frame.webp`]: webpBytes(1920, 1080),
		[`${FOLDER}/expected.json`]: json({ event: "Death", data: {} }),
	};
}

function json(value: unknown) {
	return strToU8(JSON.stringify(value));
}

/** a lossless WebP header of the given size; the pixels are never decoded */
function webpBytes(width: number, height: number) {
	const bytes = new Uint8Array(64);
	const view = new DataView(bytes.buffer);
	bytes.set(strToU8("RIFF"), 0);
	view.setUint32(4, bytes.length - 8, true);
	bytes.set(strToU8("WEBPVP8L"), 8);
	view.setUint32(16, bytes.length - 20, true);
	bytes[20] = 0x2f;
	view.setUint32(
		21,
		((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14),
		true,
	);
	return bytes;
}

/** a PNG signature and IHDR of the given size; the pixels are never decoded */
function pngBytes(width: number, height: number) {
	const bytes = new Uint8Array(64);
	const view = new DataView(bytes.buffer);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	view.setUint32(8, 13);
	bytes.set(strToU8("IHDR"), 12);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

function centralHeaderOf(zip: Uint8Array, name: string) {
	const endRecord = zip.length - 22;
	let cursor = readUInt32(zip, endRecord + 16);
	while (cursor < endRecord) {
		const nameLength = readUInt16(zip, cursor + 28);
		const entryName = Buffer.from(
			zip.subarray(cursor + 46, cursor + 46 + nameLength),
		).toString("ascii");
		if (entryName === name) return cursor;
		cursor +=
			46 +
			nameLength +
			readUInt16(zip, cursor + 30) +
			readUInt16(zip, cursor + 32);
	}
	throw new Error(`${name} not in zip`);
}

function readUInt16(bytes: Uint8Array, offset: number) {
	return new DataView(bytes.buffer, bytes.byteOffset).getUint16(offset, true);
}

function readUInt32(bytes: Uint8Array, offset: number) {
	return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset, true);
}

function writeUInt32(bytes: Uint8Array, offset: number, value: number) {
	new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset, value, true);
}

function concat(a: Uint8Array, b: Uint8Array) {
	const bytes = new Uint8Array(a.length + b.length);
	bytes.set(a, 0);
	bytes.set(b, a.length);
	return bytes;
}
