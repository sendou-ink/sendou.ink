/**
 * Event tapes: real event streams as a `TimelineBuilder` emitted them, recorded
 * off a scan (`pnpm scanner:scan-vod --tape`) or a Game data zip
 * (`pnpm scanner:tape`). They hold no images, so everything downstream of the
 * detectors can be tested against real footage in the unit project.
 *
 * A tape is a JSON Lines file under `tests/tapes/`: a header line (`events` is
 * the `core/event-version.ts` version its events were recorded at; they are
 * upgraded as the tape is read), then one event per line in the order the
 * timeline held them. Fractions are rounded to
 * four decimals and only the fields the builders read are kept.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as EventVersion from "../core/event-version";
import type { DetectedEvent } from "../core/events";

const TAPE_VERSION = 1;
const TAPE_EXTENSION = ".tape.jsonl";
const TAPE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRACTION_DIGITS = 4;
const TAPES_DIR = join(import.meta.dirname, "tapes");

export type TapeEvent = DetectedEvent & {
	/** wall-clock ms of detection; live captures only */
	detectedAt?: number;
};

export interface Tape {
	/** file name without the extension */
	name: string;
	/** which builder situations the footage holds, the reason the tape is in the suite */
	description: string;
	/** where the events were recorded from, for recording it again */
	source: string;
	events: readonly TapeEvent[];
}

/** The tape as the text of its file. */
export function serialize({
	description,
	source,
	events,
}: Omit<Tape, "name">): string {
	const lines = [
		JSON.stringify({
			tape: TAPE_VERSION,
			events: EventVersion.CURRENT,
			description,
			source,
		}),
		...events.map(({ type, t, detectedAt, scores, data }) =>
			JSON.stringify({ type, t, detectedAt, scores, data }, roundFraction),
		),
	];
	return `${lines.join("\n")}\n`;
}

/** Reads the text of a tape file; throws on anything `serialize` does not write. */
export function parse(name: string, text: string): Tape {
	const [headerLine, ...eventLines] = text.split("\n").filter(Boolean);
	if (headerLine === undefined) throw new Error(`tape ${name} is empty`);
	const header: unknown = JSON.parse(headerLine);
	if (!isHeader(header)) {
		throw new Error(`tape ${name} has no version ${TAPE_VERSION} header`);
	}
	const events = eventLines.flatMap((line, index) => {
		const lineEvent: unknown = JSON.parse(line);
		const event = isStoredEvent(lineEvent)
			? EventVersion.upgradedFrom(header.events, lineEvent)
			: lineEvent;
		if (event === null) return [];
		if (!isEvent(event)) {
			throw new Error(`tape ${name} line ${index + 2} is not an event`);
		}
		return [event];
	});
	return {
		name,
		description: header.description,
		source: header.source,
		events,
	};
}

/** Every tape under `tests/tapes/`, by name. */
export function loadAll(): Tape[] {
	return readdirSync(TAPES_DIR)
		.filter((file) => file.endsWith(TAPE_EXTENSION))
		.toSorted()
		.map((file) =>
			parse(
				file.slice(0, -TAPE_EXTENSION.length),
				readFileSync(join(TAPES_DIR, file), "utf8"),
			),
		);
}

/** Writes a tape under `tests/tapes/`, returning its path. */
export function save(tape: Tape): string {
	if (!TAPE_NAME_PATTERN.test(tape.name)) {
		throw new Error(`tape name ${tape.name} is not kebab-case`);
	}
	const path = join(TAPES_DIR, `${tape.name}${TAPE_EXTENSION}`);
	writeFileSync(path, serialize(tape));
	return path;
}

/** Where a tape's golden output lives, next to the tape. */
export function goldenPath(name: string, suffix: string): string {
	return join(TAPES_DIR, `${name}.${suffix}`);
}

function roundFraction(_key: string, value: unknown): unknown {
	if (typeof value !== "number" || Number.isInteger(value)) return value;
	const scale = 10 ** FRACTION_DIGITS;
	return Math.round(value * scale) / scale;
}

function isHeader(
	value: unknown,
): value is { events?: number; description: string; source: string } {
	return (
		isRecord(value) &&
		value.tape === TAPE_VERSION &&
		(value.events === undefined || Number.isSafeInteger(value.events)) &&
		typeof value.description === "string" &&
		typeof value.source === "string"
	);
}

/** An event of any version, as far as the upgrade steps need it. */
function isStoredEvent(
	value: unknown,
): value is { type: string; data: unknown } {
	return isRecord(value) && typeof value.type === "string" && "data" in value;
}

function isEvent(value: unknown): value is TapeEvent {
	return (
		isRecord(value) &&
		typeof value.type === "string" &&
		typeof value.t === "number" &&
		isRecord(value.scores) &&
		Object.values(value.scores).every((score) => typeof score === "number") &&
		(value.detectedAt === undefined || typeof value.detectedAt === "number") &&
		isRecord(value.data)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
