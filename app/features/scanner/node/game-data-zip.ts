/**
 * Safe unpacking of a match card's `Game data` zip (`components/match-zip.ts`)
 * received from a stranger: the archive is parsed by hand and accepted only in
 * the exact shape `matchZip` writes, with every size bounded before inflating
 * and every entry's content checked, so a crafted zip (bomb, path traversal,
 * symlink, overlapping entries, foreign files) is refused before anything
 * reaches disk outside the fresh output directory.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";

const MiB = 1024 * 1024;
const MAX_ZIP_BYTES = 1024 * MiB;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * MiB;
const MAX_ENTRIES = 4000;
const MAX_FRAME_BYTES = 40 * MiB;
const MAX_EVENTS_JSON_BYTES = 64 * MiB;
const MAX_MATCH_JSON_BYTES = 8 * MiB;
const MAX_EXPECTED_JSON_BYTES = 1 * MiB;
const MAX_COMPRESSION_RATIO = 200;
const COMPRESSION_RATIO_FLOOR_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_STRING_LENGTH = 256;
const FRAME_WIDTH_RANGE = [320, 7680] as const;
const FRAME_HEIGHT_RANGE = [180, 4320] as const;

const EVENT_TYPES = [
	"Death",
	"Kill",
	"MapStart",
	"Minimap",
	"Objective",
	"PlayerStatus",
	"QuickScoreboardBattleLog",
	"Scoreboard",
	"ScoreboardBattleLog",
	"ScoreboardBattleLogReplay",
	"ScoreboardOwn",
	"StripWeapons",
	"XRankPosition",
	"XSetCount",
	"XSetResult",
] as const;

const EVENT_KEYS = new Set([
	"type",
	"t",
	"detectedAt",
	"confidence",
	"data",
	"frame",
]);
const EXPECTED_KEYS = new Set(["event", "data", "options"]);

const FRAME_FOLDER_PATTERN =
	/^frames\/\d{3,5}-([A-Za-z]{1,40})-\d{1,4}m\d{2}s$/;
const ENTRY_NAME_PATTERN =
	/^(?:match\.json|events\.json|(frames\/\d{3,5}-[A-Za-z]{1,40}-\d{1,4}m\d{2}s)\/(frame\.(?:webp|png|jpg)|expected\.json))$/;
const JSON_KEY_PATTERN = /^[A-Za-z0-9_$-]{1,64}$/;

const SIG_LOCAL_HEADER = 0x04034b50;
const SIG_CENTRAL_HEADER = 0x02014b50;
const SIG_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const FLAG_ENCRYPTED = 0x1;
const FLAG_STRONG_ENCRYPTION = 0x40;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_REGULAR_FILE = 0o100000;

/** One analyzed frame of the game, as unpacked. */
export interface GameDataFrame {
	/** folder relative to the output directory, e.g. `frames/012-Death-1m42s` */
	folder: string;
	eventType: (typeof EVENT_TYPES)[number];
	/** the detector's directory under `tests/fixtures/` */
	fixtureDir: string;
	frameFile: string;
	width: number;
	height: number;
	/** seconds on the source timeline (wall clock live, file position on a VoD) */
	t: number;
	confidence: number;
}

export interface GameDataZipSummary {
	outDir: string;
	frames: GameDataFrame[];
	eventCounts: Record<string, number>;
	eventsWithoutFrame: number;
}

/**
 * Validates a `Game data` zip and unpacks it into `outDir`, which must not exist yet.
 * Throws with the reason on anything but the exact `matchZip` shape, leaving
 * nothing behind.
 */
export function extractGameDataZip(
	zipPath: string,
	outDir: string,
): GameDataZipSummary {
	const zip = readZipFile(zipPath);
	const entries = readCentralDirectory(zip);
	checkEntrySet(entries);

	if (existsSync(outDir)) {
		fail(`output directory ${outDir} already exists`);
	}
	mkdirSync(outDir, { recursive: true });
	const root = resolve(outDir);
	try {
		const jsonByName = new Map<string, unknown>();
		const frameFiles = new Map<string, FrameFile>();
		for (const entry of entries) {
			const content = inflateEntry(zip, entry);
			if (entry.name.endsWith(".json")) {
				jsonByName.set(entry.name, parseJson(content, entry.name));
			} else {
				frameFiles.set(dirname(entry.name), {
					file: entry.name,
					...frameDimensions(content, entry.name),
				});
			}
			writeEntry(root, entry.name, content);
		}
		return summarize(root, jsonByName, frameFiles);
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

interface FrameFile {
	file: string;
	width: number;
	height: number;
}

interface ZipEntry {
	name: string;
	method: number;
	crc: number;
	compressedSize: number;
	size: number;
	dataStart: number;
}

function fail(reason: string): never {
	throw new Error(`refused game data zip: ${reason}`);
}

function readZipFile(zipPath: string): Buffer {
	const stats = statSync(zipPath);
	if (!stats.isFile()) fail("not a regular file");
	if (stats.size > MAX_ZIP_BYTES)
		fail(`file is ${stats.size} bytes, over the ${MAX_ZIP_BYTES} limit`);
	if (stats.size < LOCAL_HEADER_SIZE + END_OF_CENTRAL_DIRECTORY_SIZE)
		fail("file too small to be a zip");

	const zip = readFileSync(zipPath);
	if (zip.readUInt32LE(0) !== SIG_LOCAL_HEADER)
		fail("does not start with a zip local file header");
	return zip;
}

function readCentralDirectory(zip: Buffer): ZipEntry[] {
	const eocd = zip.length - END_OF_CENTRAL_DIRECTORY_SIZE;
	if (zip.readUInt32LE(eocd) !== SIG_END_OF_CENTRAL_DIRECTORY) {
		fail(
			"end of central directory record not at the end of the file (archive comment or trailing data)",
		);
	}
	const diskNumber = zip.readUInt16LE(eocd + 4);
	const centralDirectoryDisk = zip.readUInt16LE(eocd + 6);
	const entriesOnDisk = zip.readUInt16LE(eocd + 8);
	const entryCount = zip.readUInt16LE(eocd + 10);
	const centralDirectorySize = zip.readUInt32LE(eocd + 12);
	const centralDirectoryOffset = zip.readUInt32LE(eocd + 16);

	if (
		diskNumber !== 0 ||
		centralDirectoryDisk !== 0 ||
		entriesOnDisk !== entryCount
	) {
		fail("multi-disk archive");
	}
	if (
		entryCount === 0xffff ||
		centralDirectoryOffset === 0xffffffff ||
		centralDirectorySize === 0xffffffff
	) {
		fail("zip64 archive");
	}
	if (entryCount > MAX_ENTRIES)
		fail(`${entryCount} entries, over the ${MAX_ENTRIES} limit`);
	if (centralDirectoryOffset + centralDirectorySize !== eocd) {
		fail("central directory does not end where the end record begins");
	}

	const entries: ZipEntry[] = [];
	const names = new Set<string>();
	let totalSize = 0;
	let cursor = centralDirectoryOffset;
	for (let i = 0; i < entryCount; i++) {
		if (
			cursor + CENTRAL_HEADER_SIZE > eocd ||
			zip.readUInt32LE(cursor) !== SIG_CENTRAL_HEADER
		) {
			fail(`central directory entry ${i} is malformed`);
		}
		const flags = zip.readUInt16LE(cursor + 8);
		const method = zip.readUInt16LE(cursor + 10);
		const crc = zip.readUInt32LE(cursor + 16);
		const compressedSize = zip.readUInt32LE(cursor + 20);
		const size = zip.readUInt32LE(cursor + 24);
		const nameLength = zip.readUInt16LE(cursor + 28);
		const extraLength = zip.readUInt16LE(cursor + 30);
		const commentLength = zip.readUInt16LE(cursor + 32);
		const diskStart = zip.readUInt16LE(cursor + 34);
		const externalAttributes = zip.readUInt32LE(cursor + 38);
		const localOffset = zip.readUInt32LE(cursor + 42);
		const nameBytes = zip.subarray(
			cursor + CENTRAL_HEADER_SIZE,
			cursor + CENTRAL_HEADER_SIZE + nameLength,
		);
		cursor += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
		if (cursor > eocd)
			fail(`central directory entry ${i} overruns the directory`);

		const name = entryName(nameBytes);
		if (names.has(name)) fail(`duplicate entry ${name}`);
		names.add(name);
		if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION))
			fail(`${name} is encrypted`);
		if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
			fail(`${name} uses compression method ${method}`);
		}
		if (method === METHOD_STORED && compressedSize !== size) {
			fail(`${name} is stored but its sizes differ`);
		}
		if (diskStart !== 0) fail(`${name} starts on another disk`);
		const unixFileType = (externalAttributes >>> 16) & UNIX_FILE_TYPE_MASK;
		if (unixFileType !== 0 && unixFileType !== UNIX_REGULAR_FILE) {
			fail(`${name} is not a regular file (symlink, directory or device)`);
		}

		const limit = sizeLimit(name);
		if (size > limit)
			fail(`${name} inflates to ${size} bytes, over its ${limit} limit`);
		if (
			size > COMPRESSION_RATIO_FLOOR_BYTES &&
			size > compressedSize * MAX_COMPRESSION_RATIO
		) {
			fail(`${name} compression ratio is over ${MAX_COMPRESSION_RATIO}x`);
		}
		totalSize += size;
		if (totalSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
			fail(`inflates to over ${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes in total`);
		}

		entries.push({
			name,
			method,
			crc,
			compressedSize,
			size,
			dataStart: localDataStart(
				zip,
				localOffset,
				nameBytes,
				method,
				centralDirectoryOffset,
			),
		});
	}
	if (cursor !== eocd) fail("central directory has trailing bytes");

	checkNoOverlap(entries, centralDirectoryOffset);
	return entries;
}

function entryName(nameBytes: Buffer): string {
	for (const byte of nameBytes) {
		if (byte < 0x21 || byte > 0x7e) fail("entry name is not printable ASCII");
	}
	const name = nameBytes.toString("ascii");
	if (!ENTRY_NAME_PATTERN.test(name))
		fail(`unexpected entry ${JSON.stringify(name)}`);
	return name;
}

function sizeLimit(name: string): number {
	if (name === "events.json") return MAX_EVENTS_JSON_BYTES;
	if (name === "match.json") return MAX_MATCH_JSON_BYTES;
	if (name.endsWith("/expected.json")) return MAX_EXPECTED_JSON_BYTES;
	return MAX_FRAME_BYTES;
}

function localDataStart(
	zip: Buffer,
	localOffset: number,
	centralName: Buffer,
	centralMethod: number,
	centralDirectoryOffset: number,
): number {
	if (
		localOffset + LOCAL_HEADER_SIZE > centralDirectoryOffset ||
		zip.readUInt32LE(localOffset) !== SIG_LOCAL_HEADER
	) {
		fail(`local header of ${centralName.toString("ascii")} is missing`);
	}
	const flags = zip.readUInt16LE(localOffset + 6);
	const method = zip.readUInt16LE(localOffset + 8);
	const nameLength = zip.readUInt16LE(localOffset + 26);
	const extraLength = zip.readUInt16LE(localOffset + 28);
	const localName = zip.subarray(
		localOffset + LOCAL_HEADER_SIZE,
		localOffset + LOCAL_HEADER_SIZE + nameLength,
	);
	if (
		!localName.equals(centralName) ||
		method !== centralMethod ||
		flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)
	) {
		fail(
			`local header of ${centralName.toString("ascii")} disagrees with the central directory`,
		);
	}
	return localOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
}

function checkNoOverlap(entries: ZipEntry[], centralDirectoryOffset: number) {
	let previousEnd = 0;
	for (const entry of entries.toSorted((a, b) => a.dataStart - b.dataStart)) {
		const dataEnd = entry.dataStart + entry.compressedSize;
		if (entry.dataStart < previousEnd || dataEnd > centralDirectoryOffset) {
			fail(`${entry.name} overlaps another entry or the central directory`);
		}
		previousEnd = dataEnd;
	}
}

function checkEntrySet(entries: ZipEntry[]) {
	const names = new Set(entries.map((entry) => entry.name));
	if (!names.has("match.json")) fail("match.json missing");
	if (!names.has("events.json")) fail("events.json missing");

	const framesPerFolder = new Map<string, number>();
	for (const name of names) {
		if (!name.startsWith("frames/")) continue;
		const folder = dirname(name);
		if (!name.endsWith("/expected.json")) {
			framesPerFolder.set(folder, (framesPerFolder.get(folder) ?? 0) + 1);
		} else if (!framesPerFolder.has(folder)) {
			framesPerFolder.set(folder, 0);
		}
	}
	for (const [folder, frameCount] of framesPerFolder) {
		if (frameCount !== 1) fail(`${folder} must hold exactly one frame image`);
		if (!names.has(`${folder}/expected.json`))
			fail(`${folder} has no expected.json`);
	}
}

function inflateEntry(zip: Buffer, entry: ZipEntry): Buffer {
	const raw = zip.subarray(
		entry.dataStart,
		entry.dataStart + entry.compressedSize,
	);
	let content: Buffer;
	if (entry.method === METHOD_STORED) {
		content = Buffer.from(raw);
	} else {
		try {
			content = inflateRawSync(raw, {
				maxOutputLength: Math.max(1, entry.size),
			});
		} catch {
			fail(
				`${entry.name} does not inflate to its declared ${entry.size} bytes`,
			);
		}
	}
	if (content.length !== entry.size)
		fail(`${entry.name} size does not match the directory`);
	if (crc32(content) !== entry.crc) fail(`${entry.name} fails its CRC check`);
	return content;
}

function writeEntry(root: string, name: string, content: Buffer) {
	const target = resolve(root, name);
	if (!target.startsWith(root + sep))
		fail(`${name} escapes the output directory`);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, { flag: "wx", mode: 0o644 });
}

function parseJson(content: Buffer, name: string): unknown {
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(content);
	} catch {
		fail(`${name} is not UTF-8`);
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		fail(`${name} is not JSON`);
	}
	checkJsonValue(value, name, 0);
	return value;
}

function checkJsonValue(value: unknown, name: string, depth: number) {
	if (depth > MAX_JSON_DEPTH)
		fail(`${name} nests deeper than ${MAX_JSON_DEPTH}`);
	if (typeof value === "string") {
		if (value.length > MAX_JSON_STRING_LENGTH) {
			fail(`${name} holds a string over ${MAX_JSON_STRING_LENGTH} characters`);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) checkJsonValue(item, name, depth + 1);
		return;
	}
	if (isRecord(value)) {
		for (const [key, item] of Object.entries(value)) {
			if (!JSON_KEY_PATTERN.test(key))
				fail(
					`${name} has an unexpected key ${JSON.stringify(key.slice(0, 64))}`,
				);
			checkJsonValue(item, name, depth + 1);
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function frameDimensions(
	content: Buffer,
	name: string,
): { width: number; height: number } {
	const extension = name.slice(name.lastIndexOf(".") + 1);
	const dimensions =
		extension === "png"
			? pngDimensions(content)
			: extension === "webp"
				? webpDimensions(content)
				: jpegDimensions(content);
	if (!dimensions) fail(`${name} is not a valid ${extension} image`);
	const { width, height } = dimensions;
	if (
		width < FRAME_WIDTH_RANGE[0] ||
		width > FRAME_WIDTH_RANGE[1] ||
		height < FRAME_HEIGHT_RANGE[0] ||
		height > FRAME_HEIGHT_RANGE[1]
	) {
		fail(`${name} is ${width}x${height}, outside capture resolutions`);
	}
	return dimensions;
}

const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngDimensions(content: Buffer) {
	if (content.length < 33 || !content.subarray(0, 8).equals(PNG_SIGNATURE))
		return null;
	if (content.toString("ascii", 12, 16) !== "IHDR") return null;
	return { width: content.readUInt32BE(16), height: content.readUInt32BE(20) };
}

function webpDimensions(content: Buffer) {
	if (content.length < 30) return null;
	if (
		content.toString("ascii", 0, 4) !== "RIFF" ||
		content.toString("ascii", 8, 12) !== "WEBP"
	)
		return null;
	if (content.readUInt32LE(4) + 8 !== content.length) return null;

	const chunk = content.toString("ascii", 12, 16);
	if (chunk === "VP8L") {
		if (content[20] !== 0x2f) return null;
		const bits = content.readUInt32LE(21);
		return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
	}
	if (chunk === "VP8 ") {
		return {
			width: content.readUInt16LE(26) & 0x3fff,
			height: content.readUInt16LE(28) & 0x3fff,
		};
	}
	if (chunk === "VP8X") {
		return {
			width: content.readUIntLE(24, 3) + 1,
			height: content.readUIntLE(27, 3) + 1,
		};
	}
	return null;
}

function jpegDimensions(content: Buffer) {
	if (content.length < 4 || content[0] !== 0xff || content[1] !== 0xd8)
		return null;
	let offset = 2;
	while (offset + 9 < content.length) {
		if (content[offset] !== 0xff) return null;
		const marker = content[offset + 1]!;
		const isStartOfFrame =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isStartOfFrame) {
			return {
				width: content.readUInt16BE(offset + 7),
				height: content.readUInt16BE(offset + 5),
			};
		}
		offset += 2 + content.readUInt16BE(offset + 2);
	}
	return null;
}

function summarize(
	root: string,
	jsonByName: Map<string, unknown>,
	frameFiles: Map<string, FrameFile>,
): GameDataZipSummary {
	if (!isRecord(jsonByName.get("match.json")))
		fail("match.json is not an object");
	const events = jsonByName.get("events.json");
	if (!Array.isArray(events)) fail("events.json is not an array");

	const frames: GameDataFrame[] = [];
	const eventCounts: Record<string, number> = {};
	const referencedFolders = new Set<string>();
	let eventsWithoutFrame = 0;
	for (const [index, event] of events.entries()) {
		if (!isRecord(event)) fail(`events.json[${index}] is not an object`);
		for (const key of Object.keys(event)) {
			if (!EVENT_KEYS.has(key))
				fail(`events.json[${index}] has an unexpected key ${key}`);
		}
		const { type, t, confidence, detectedAt, data, frame } = event;
		if (!isEventType(type)) fail(`events.json[${index}] has an unknown type`);
		if (typeof t !== "number" || typeof confidence !== "number") {
			fail(`events.json[${index}] lacks a numeric t/confidence`);
		}
		if (detectedAt !== undefined && typeof detectedAt !== "number") {
			fail(`events.json[${index}] has a non-numeric detectedAt`);
		}
		if (data !== null && !isRecord(data))
			fail(`events.json[${index}] data is not an object`);
		eventCounts[type] = (eventCounts[type] ?? 0) + 1;

		if (frame === undefined) {
			eventsWithoutFrame++;
			continue;
		}
		if (typeof frame !== "string")
			fail(`events.json[${index}] frame is not a string`);
		const folderType = FRAME_FOLDER_PATTERN.exec(frame)?.[1];
		if (folderType !== type)
			fail(`events.json[${index}] names a frame folder of another type`);
		if (referencedFolders.has(frame)) fail(`${frame} is named by two events`);
		referencedFolders.add(frame);

		const frameFile = frameFiles.get(frame);
		if (!frameFile) fail(`${frame} named by events.json is missing`);
		const expected = jsonByName.get(`${frame}/expected.json`);
		if (!isRecord(expected)) fail(`${frame}/expected.json is not an object`);
		for (const key of Object.keys(expected)) {
			if (!EXPECTED_KEYS.has(key))
				fail(`${frame}/expected.json has an unexpected key ${key}`);
		}
		if (expected.event !== type && expected.event !== "none") {
			fail(`${frame}/expected.json names another event`);
		}

		frames.push({
			folder: frame,
			eventType: type,
			fixtureDir: fixtureDirOf(type),
			frameFile: frameFile.file,
			width: frameFile.width,
			height: frameFile.height,
			t,
			confidence,
		});
	}
	for (const folder of frameFiles.keys()) {
		if (!referencedFolders.has(folder))
			fail(`${folder} is not named by any event`);
	}

	return { outDir: root, frames, eventCounts, eventsWithoutFrame };
}

function isEventType(value: unknown): value is (typeof EVENT_TYPES)[number] {
	return EVENT_TYPES.includes(value as (typeof EVENT_TYPES)[number]);
}

function fixtureDirOf(eventType: string): string {
	return eventType.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase();
}
