import { describe, expect, test } from "vitest";
import type { SlotEvidence } from "../../core/detectors/objective/player-status";
import * as StatusDecode from "../../core/status-decode";

const ALIVE: SlotEvidence = [0.9, 0.05, 0.05];
const READY: SlotEvidence = [0.05, 0.9, 0.05];
const DEAD: SlotEvidence = [0.05, 0.05, 0.9];
/** a wash in its dim pulse: barely more alive than ready */
const TROUGH: SlotEvidence = [0.55, 0.4, 0.05];

const LETTER: Record<string, SlotEvidence | null> = {
	a: ALIVE,
	r: READY,
	d: DEAD,
	t: TROUGH,
	"?": null,
};

/** One read per second from t=100 with the clock well under way, a letter per read (a/r/d, t = trough, ? = nothing read). */
function reads(letters: string, { step = 1, elapsed = 60 } = {}) {
	return [...letters].map((letter, i) => ({
		t: 100 + i * step,
		elapsed: elapsed + i * step,
		evidence: LETTER[letter]!,
	}));
}

function decoded(input: ReturnType<typeof reads>): string {
	return StatusDecode.decode(input)
		.map((state) => state[0])
		.join("");
}

describe("StatusDecode.decode", () => {
	test.each([
		{
			why: "clean reads stand",
			input: "aaarrraaaddddddaa",
			output: "aaarrraaaddddddaa",
		},
		{
			why: "a splat shorter than a respawn is a misread",
			input: "aaadaaa",
			output: "aaaaaaa",
		},
		{
			why: "a respawn shorter than the alive floor is a misread",
			input: "ddddddadddd",
			output: "ddddddddddd",
		},
		{
			why: "a dim pulse inside a wash is bridged",
			input: "rrrttrrraaa",
			output: "rrrrrrrraaa",
		},
		{
			why: "a ready read too soon after a spent special is a misread",
			input: "rraaaaraaa",
			output: "rraaaaaaaa",
		},
		{
			why: "a special regained after long enough stands",
			input: "rraaaaaaaaarr",
			output: "rraaaaaaaaarr",
		},
		{
			why: "a special lost to a splat can come back after the respawn",
			input: "rrddddddaaarr",
			output: "rrddddddaaarr",
		},
		{
			why: "a splat between two specials lifts the regain wait",
			input: "rrddddaar",
			output: "rrddddaar",
		},
		{
			why: "the same gap without a splat is too short to regain",
			input: "rraaaaar",
			output: "rraaaaaa",
		},
		{
			why: "a read with no evidence takes the states around it",
			input: "dddd?dddaa",
			output: "ddddddddaa",
		},
		{
			why: "runs at either end have no minimum",
			input: "daaaaad",
			output: "daaaaad",
		},
	])("$why", ({ input, output }) => {
		expect(decoded(reads(input))).toBe(output);
	});

	test("a respawn and a recharge fit between sparse reads", () => {
		expect(decoded(reads("dr", { step: 30 }))).toBe("dr");
	});

	test("a lone splat between reads far apart stands", () => {
		expect(decoded(reads("ada", { step: 20 }))).toBe("ada");
	});

	test("no special is held in the clock's first seconds", () => {
		expect(decoded(reads("rrrrrrrrrr", { elapsed: 0 }))).toBe("aaaaaaarrr");
	});

	test("a clock not yet started holds no special", () => {
		expect(decoded(reads("rr", { elapsed: -5 }))).toBe("aa");
	});

	test("a read of unknown clock may be ready", () => {
		expect(
			StatusDecode.decode([{ t: 0, elapsed: null, evidence: READY }]),
		).toEqual(["ready"]);
	});

	test("reads at the same time share a state, their evidence summed", () => {
		expect(
			StatusDecode.decode([
				{ t: 0, elapsed: 60, evidence: ALIVE },
				{ t: 0, elapsed: 60, evidence: [0.3, 0.05, 0.65] },
				{ t: 0.1, elapsed: 60, evidence: DEAD },
			]),
		).toEqual(["dead", "dead", "dead"]);
	});

	test("no reads decode to nothing", () => {
		expect(StatusDecode.decode([])).toEqual([]);
	});
});
