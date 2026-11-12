/**
 * A scan's log: per lane, every frame the scan analyzed, with what each due
 * detector's gate said, whether its parse ran and what the parse read.
 *
 * Which frames a scan looks at, and in what state it reads them, follows from
 * how the scan ran rather than from the footage alone. A VoD is split into one
 * lane per worker, each starting with a scheduler, a timeline and detectors
 * of its own (their memos, sticky fits and sampling counters); calm stretches
 * are skimmed; frames come at the file's own timestamps. Scanning the file
 * again some other way (`scan-vod`: one lane on ffmpeg's frame grid) need not
 * give the same reads. The log pins the run down, and replaying it
 * (`detectors/replay-pass.ts`, `pnpm scanner:scan-vod --replay`) runs the same
 * detectors on the same frames in the same order per lane.
 *
 * A log is its own JSON form: per frame, three masks over the `detectors`
 * table, so a two-hour VoD's log stays around a megabyte. This file has no
 * runtime imports: the Game data zip validator loads it in plain Node.
 */

const VERSION = 1;
/** a frame's masks are 32-bit */
const MAX_DETECTORS = 31;
const MAX_EVENT_TYPES = 64;
const MAX_LANES = 64;
/** detector ids and gate variants */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_TYPE_PATTERN = /^[A-Za-z]+$/;
const MAX_NAME_LENGTH = 64;

/**
 * What a parse read, as far as the log keeps it: enough to tell whether a
 * replay read the same, and the confidence the scan's timeline decided on.
 */
export interface ScanLogRead {
	type: string;
	confidence: number;
}

/** One due detector on one analyzed frame. */
export interface ScanLogCheck {
	detector: string;
	pass: boolean;
	/** the screen variant a passing gate recognized */
	variant?: string;
	/** the gate passed and the scheduler let the parse run */
	parsed: boolean;
	/** empty unless parsed */
	reads: readonly ScanLogRead[];
}

export interface ScanLogFrame {
	/** seconds into the video, as the scan's decoder stamped the frame */
	t: number;
	checks: ScanLogCheck[];
}

/**
 * `[t, due, pass, parsed, ...details]`: each mask holds a detector at its
 * index in `ScanLog.detectors`. A passing gate that named a variant or whose
 * parse read something adds a detail,
 * `[detector index, variant, ...(event type index, confidence) per read]`.
 */
type PackedFrame = [number, number, number, number, ...PackedDetail[]];
type PackedDetail = [number, string | null, ...number[]];

interface ScanLogLane {
	/** seconds; the lane scanned `[tStart, tEnd)` with a scheduler, a timeline and detectors of its own */
	tStart: number;
	tEnd: number;
	/** the analyzed frames in scan order */
	frames: PackedFrame[];
}

export interface ScanLog {
	v: number;
	/** detector ids, in the order the scan first checked them */
	detectors: string[];
	/** the event types the reads name */
	types: string[];
	lanes: ScanLogLane[];
}

/** An empty log of a scan split into `lanes`. */
export function create(
	lanes: readonly { tStart: number; tEnd: number }[],
): ScanLog {
	return {
		v: VERSION,
		detectors: [],
		types: [],
		lanes: lanes.map(({ tStart, tEnd }) => ({ tStart, tEnd, frames: [] })),
	};
}

/**
 * Adds one due detector's outcome on the frame at `t` to the lane at
 * `laneIndex`. The checks of a frame come in a row, each detector once.
 */
export function record(
	log: ScanLog,
	laneIndex: number,
	t: number,
	check: ScanLogCheck,
): void {
	const lane = log.lanes[laneIndex];
	if (!lane) throw new Error(`scan log has no lane ${laneIndex}`);
	const detector = indexIn(log.detectors, check.detector);
	if (detector >= MAX_DETECTORS) {
		throw new Error(`scan log holds at most ${MAX_DETECTORS} detectors`);
	}
	const bit = 1 << detector;
	let frame = lane.frames.at(-1);
	if (!frame || frame[0] !== t || frame[1] & bit) {
		frame = [t, 0, 0, 0];
		lane.frames.push(frame);
	}
	frame[1] |= bit;
	if (!check.pass) return;
	frame[2] |= bit;
	if (check.parsed) frame[3] |= bit;
	const reads = check.parsed ? check.reads : [];
	if (check.variant === undefined && reads.length === 0) return;
	frame.push([
		detector,
		check.variant ?? null,
		...reads.flatMap(({ type, confidence }) => [
			indexIn(log.types, type),
			confidence,
		]),
	]);
}

/** The frames a lane analyzed, in scan order. */
export function frames(log: ScanLog, lane: ScanLogLane): ScanLogFrame[] {
	return lane.frames.map(([t, due, pass, parsed, ...details]) => {
		const detailOf = new Map(details.map((detail) => [detail[0], detail]));
		const checks: ScanLogCheck[] = [];
		for (const [index, detector] of log.detectors.entries()) {
			const bit = 1 << index;
			if (!(due & bit)) continue;
			const [, variant, ...reads] = detailOf.get(index) ?? [index, null];
			checks.push({
				detector,
				pass: (pass & bit) !== 0,
				...(variant === null ? null : { variant }),
				parsed: (parsed & bit) !== 0,
				reads: readPairs(log, reads),
			});
		}
		return { t, checks };
	});
}

/** A parse's events as the log keeps them. */
export function readsOf(
	events: readonly { type: string; confidence: number }[],
): ScanLogRead[] {
	return events.map(({ type, confidence }) => ({ type, confidence }));
}

/** How many frames the log holds. */
export function frameCount(log: ScanLog): number {
	return log.lanes.reduce((sum, lane) => sum + lane.frames.length, 0);
}

/** A parsed JSON value as a scan log; throws with the reason on anything `record` does not write. */
export function parse(value: unknown): ScanLog {
	if (!isRecord(value)) fail("not an object");
	const { v, detectors, types, lanes, ...rest } = value;
	if (Object.keys(rest).length > 0) {
		fail(`unexpected key ${Object.keys(rest)[0]}`);
	}
	if (v !== VERSION) fail(`version ${String(v)}, this build reads ${VERSION}`);
	const detectorIds = names(detectors, "detectors", MAX_DETECTORS, ID_PATTERN);
	const typeNames = names(types, "types", MAX_EVENT_TYPES, EVENT_TYPE_PATTERN);
	if (!Array.isArray(lanes) || lanes.length > MAX_LANES) {
		fail("lanes is not a list of lanes");
	}
	return {
		v: VERSION,
		detectors: detectorIds,
		types: typeNames,
		lanes: lanes.map((lane, index) =>
			parseLane(lane, `lane ${index}`, detectorIds.length, typeNames.length),
		),
	};
}

function parseLane(
	value: unknown,
	where: string,
	detectorCount: number,
	typeCount: number,
): ScanLogLane {
	if (!isRecord(value)) fail(`${where} is not an object`);
	const { tStart, tEnd, frames: packed, ...rest } = value;
	if (Object.keys(rest).length > 0) {
		fail(`${where} has an unexpected key ${Object.keys(rest)[0]}`);
	}
	if (!isTime(tStart) || !isTime(tEnd) || tEnd < tStart) {
		fail(`${where} has no valid tStart/tEnd`);
	}
	if (!Array.isArray(packed)) fail(`${where} has no frames`);
	let previousT = Number.NEGATIVE_INFINITY;
	const parsedFrames = packed.map((frame, index) => {
		const parsedFrame = parseFrame(
			frame,
			`${where} frame ${index}`,
			detectorCount,
			typeCount,
		);
		if (parsedFrame[0] < previousT) {
			fail(`${where} frame ${index} goes back in time`);
		}
		previousT = parsedFrame[0];
		return parsedFrame;
	});
	return { tStart, tEnd, frames: parsedFrames };
}

function parseFrame(
	value: unknown,
	where: string,
	detectorCount: number,
	typeCount: number,
): PackedFrame {
	if (!Array.isArray(value) || value.length < 4) fail(`${where} is malformed`);
	const [t, due, pass, parsed, ...details] = value as unknown[];
	if (!isTime(t)) fail(`${where} has no valid t`);
	const isMask = (mask: unknown): mask is number =>
		isIndex(mask, 2 ** detectorCount);
	if (!isMask(due) || !isMask(pass) || !isMask(parsed) || due === 0) {
		fail(`${where} has a malformed mask`);
	}
	if ((pass & ~due) !== 0 || (parsed & ~pass) !== 0) {
		fail(`${where} parses a detector whose gate did not pass`);
	}
	let detailed = 0;
	const parsedDetails = details.map((detail): PackedDetail => {
		if (!Array.isArray(detail) || detail.length < 2 || detail.length % 2) {
			fail(`${where} has a malformed detail`);
		}
		const [detector, variant, ...reads] = detail as unknown[];
		if (!isIndex(detector, detectorCount) || !(pass & (1 << detector))) {
			fail(`${where} details a detector whose gate did not pass`);
		}
		if (detailed & (1 << detector)) fail(`${where} details a detector twice`);
		detailed |= 1 << detector;
		if (variant !== null && !isName(variant, ID_PATTERN)) {
			fail(`${where} has a malformed variant`);
		}
		if (reads.length > 0 && !(parsed & (1 << detector))) {
			fail(`${where} has reads of a parse that did not run`);
		}
		for (const [index, read] of reads.entries()) {
			const valid =
				index % 2 === 0
					? isIndex(read, typeCount)
					: typeof read === "number" && Number.isFinite(read);
			if (!valid) fail(`${where} has a malformed read`);
		}
		return [detector, variant, ...(reads as number[])];
	});
	return [t, due, pass, parsed, ...parsedDetails];
}

function names(
	value: unknown,
	where: string,
	max: number,
	pattern: RegExp,
): string[] {
	if (
		!Array.isArray(value) ||
		value.length > max ||
		!value.every((name): name is string => isName(name, pattern)) ||
		new Set(value).size !== value.length
	) {
		fail(`${where} is not a list of at most ${max} distinct names`);
	}
	return value;
}

function isName(value: unknown, pattern: RegExp): value is string {
	return (
		typeof value === "string" &&
		value.length <= MAX_NAME_LENGTH &&
		pattern.test(value)
	);
}

function isTime(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIndex(value: unknown, count: number): value is number {
	return (
		typeof value === "number" &&
		Number.isSafeInteger(value) &&
		value >= 0 &&
		value < count
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: string): never {
	throw new Error(`not a scan log: ${reason}`);
}

function readPairs(log: ScanLog, pairs: readonly number[]): ScanLogRead[] {
	const reads: ScanLogRead[] = [];
	for (let i = 0; i + 1 < pairs.length; i += 2) {
		reads.push({ type: log.types[pairs[i]!]!, confidence: pairs[i + 1]! });
	}
	return reads;
}

function indexIn(table: string[], name: string): number {
	const index = table.indexOf(name);
	return index === -1 ? table.push(name) - 1 : index;
}
