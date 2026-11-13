import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	type BuiltMatch,
	buildScannerMatches,
	ingestSkipReasons,
	invalidObjectiveEvents,
	isHistoryOnly,
	type MatchBuildCache,
} from "../../core/match-builder";
import * as Tape from "../tape";

/** a value that fits this many characters as JSON stays on one line of the golden file */
const GOLDEN_LINE_WIDTH = 140;
/** how many events arrive between two rebuilds of the growing timeline */
const INCREMENTAL_REBUILD_STEP = 97;

const tapes = Tape.loadAll();

// Golden files are the builder's output on real event streams. After a change
// that is meant to move them: `pnpm exec vitest run <this file> -u`, then read the diff.
describe("buildScannerMatches", () => {
	// a history screen's recording time is read as local time
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "UTC";
	});
	afterAll(() => {
		if (originalTimezone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = originalTimezone;
		}
	});

	test.each(tapes)("$name: $description", async (tape) => {
		await expect(goldenText(tape.events)).toMatchFileSnapshot(
			Tape.goldenPath(tape.name, "matches.json"),
		);
	});

	test.each(tapes)("$name: unbacked matches only add to the build", (tape) => {
		const withUnbacked = buildScannerMatches(tape.events, undefined, {
			unbacked: true,
		});

		expect(withUnbacked.filter((built) => !built.unbacked)).toEqual(
			buildScannerMatches(tape.events),
		);
	});

	test.each(tapes)(
		"$name: a cached rebuild of the growing timeline matches a fresh build",
		(tape) => {
			const cache: MatchBuildCache<Tape.TapeEvent> = new WeakMap();
			for (
				let length = INCREMENTAL_REBUILD_STEP;
				length < tape.events.length;
				length += INCREMENTAL_REBUILD_STEP
			) {
				buildScannerMatches(tape.events.slice(0, length), cache);
			}

			expect(buildScannerMatches(tape.events, cache)).toEqual(
				buildScannerMatches(tape.events),
			);
		},
	);
});

function goldenText(events: readonly Tape.TapeEvent[]): string {
	const built = buildScannerMatches(events, undefined, { unbacked: true });
	const backed = built.filter((candidate) => !candidate.unbacked);
	const skipReasons = ingestSkipReasons(backed);
	const tapeIndex = new Map(events.map((event, index) => [event, index]));
	const indexRanges = (sources: readonly Tape.TapeEvent[]) =>
		ranges(sources.map((event) => tapeIndex.get(event)!));

	return `${prettyJson({
		invalidObjectiveEvents: indexRanges(invalidObjectiveEvents(backed)),
		matches: built.map((candidate: BuiltMatch<Tape.TapeEvent>) => ({
			sources: indexRanges(candidate.sources),
			unbacked: candidate.unbacked,
			historyOnly: isHistoryOnly(candidate) || undefined,
			ingestSkipReason: skipReasons.get(candidate),
			match: candidate.match,
		})),
	})}\n`;
}

/** tape line indices (0 = first event) as `0-12 14 20-31` */
function ranges(indices: readonly number[]): string {
	const parts: string[] = [];
	const sorted = indices.toSorted((a, b) => a - b);
	let start = 0;
	for (const [position, index] of sorted.entries()) {
		if (sorted[position + 1] === index + 1) continue;
		const first = sorted[start]!;
		parts.push(first === index ? String(index) : `${first}-${index}`);
		start = position + 1;
	}
	return parts.join(" ");
}

/** JSON that keeps short values (a sample, a player row) on one line so a diff shows one read per line */
function prettyJson(value: unknown, indent = ""): string {
	const flat = JSON.stringify(value);
	if (
		typeof value !== "object" ||
		value === null ||
		indent.length + flat.length <= GOLDEN_LINE_WIDTH
	) {
		return flat;
	}
	const inner = `${indent}\t`;
	const lines = Array.isArray(value)
		? value.map((item) => `${inner}${prettyJson(item ?? null, inner)}`)
		: Object.entries(value)
				.filter(([, item]) => item !== undefined)
				.map(
					([key, item]) =>
						`${inner}${JSON.stringify(key)}: ${prettyJson(item, inner)}`,
				);
	const [open, close] = Array.isArray(value) ? "[]" : "{}";
	return `${open}\n${lines.join(",\n")}\n${indent}${close}`;
}
