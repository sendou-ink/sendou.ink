/**
 * The H.264 / HEVC unit classifiers over hand-built NAL units: which units
 * change what later units decode to (and so must be decoded) and which a
 * decoder may skip.
 */
import { describe, expect, test } from "vitest";
import {
	createAvcUnitClassifier,
	createHevcUnitClassifier,
} from "../../core/nal-refs";

const AVC_NON_IDR = 1;
const AVC_IDR = 5;
const AVC_SEI = 6;
const AVC_SPS = 7;
const AVC_PPS = 8;
const AVC_AUD = 9;
const AVC_END_OF_SEQUENCE = 10;

const HEVC_TRAIL_N = 0;
const HEVC_TRAIL_R = 1;
const HEVC_RASL_N = 8;
const HEVC_CRA = 21;
const HEVC_VPS = 32;
const HEVC_SPS = 33;
const HEVC_AUD = 35;
const HEVC_PREFIX_SEI = 39;

describe("createAvcUnitClassifier", () => {
	test.each([
		{ why: "IDR", nals: [avc(AVC_IDR, 3)], changes: true },
		{ why: "reference P/B slice", nals: [avc(AVC_NON_IDR, 2)], changes: true },
		{
			why: "non-reference slice with SEI and AUD",
			nals: [avc(AVC_AUD, 0), avc(AVC_SEI, 0), avc(AVC_NON_IDR, 0)],
			changes: false,
		},
		{
			why: "non-reference slices of a two-slice picture",
			nals: [avc(AVC_NON_IDR, 0), avc(AVC_NON_IDR, 0)],
			changes: false,
		},
		{
			why: "one reference slice among non-reference ones",
			nals: [avc(AVC_NON_IDR, 0), avc(AVC_NON_IDR, 1)],
			changes: true,
		},
		{
			why: "parameter sets before a non-reference slice",
			nals: [avc(AVC_SPS, 3), avc(AVC_PPS, 3), avc(AVC_NON_IDR, 0)],
			changes: true,
		},
		{
			why: "end of sequence after a non-reference slice",
			nals: [avc(AVC_NON_IDR, 0), avc(AVC_END_OF_SEQUENCE, 0)],
			changes: true,
		},
		{ why: "no picture", nals: [avc(AVC_SEI, 0)], changes: true },
		{
			why: "unknown NAL type",
			nals: [avc(24, 0), avc(AVC_NON_IDR, 0)],
			changes: true,
		},
	])("$why: changes state $changes", ({ nals, changes }) => {
		const classify = createAvcUnitClassifier(avcC(4));
		expect(classify(lengthPrefixed(nals, 4))).toBe(changes);
	});

	test.each([1, 2, 4])("reads %i-byte NAL lengths", (lengthSize) => {
		const classify = createAvcUnitClassifier(avcC(lengthSize));
		expect(classify(lengthPrefixed([avc(AVC_NON_IDR, 0)], lengthSize))).toBe(
			false,
		);
		expect(classify(lengthPrefixed([avc(AVC_NON_IDR, 2)], lengthSize))).toBe(
			true,
		);
	});

	test("reads Annex B units without a configuration record", () => {
		const classify = createAvcUnitClassifier();
		expect(
			classify(annexB([avc(AVC_AUD, 0), avc(AVC_NON_IDR, 0)], [4, 3])),
		).toBe(false);
		expect(
			classify(annexB([avc(AVC_SEI, 0), avc(AVC_NON_IDR, 1)], [3, 4])),
		).toBe(true);
	});
});

describe("createHevcUnitClassifier", () => {
	test.each([
		{ why: "CRA", nals: [hevc(HEVC_CRA, 0)], changes: true },
		{
			why: "reference trailing picture",
			nals: [hevc(HEVC_TRAIL_R, 0)],
			changes: true,
		},
		{
			why: "non-reference trailing picture with SEI and AUD",
			nals: [
				hevc(HEVC_AUD, 0),
				hevc(HEVC_PREFIX_SEI, 0),
				hevc(HEVC_TRAIL_N, 0),
			],
			changes: false,
		},
		{ why: "non-reference RASL", nals: [hevc(HEVC_RASL_N, 0)], changes: false },
		{
			why: "parameter set before a non-reference picture",
			nals: [hevc(HEVC_VPS, 0), hevc(HEVC_TRAIL_N, 0)],
			changes: true,
		},
		{
			why: "picture of another layer",
			nals: [hevc(HEVC_TRAIL_N, 0), hevc(HEVC_TRAIL_N, 0, 1)],
			changes: true,
		},
		{ why: "no picture", nals: [hevc(HEVC_PREFIX_SEI, 0)], changes: true },
	])("$why: changes state $changes", ({ nals, changes }) => {
		const classify = createHevcUnitClassifier(hvcC(0));
		expect(classify(lengthPrefixed(nals, 4))).toBe(changes);
	});

	test("skips only non-reference pictures of the highest sub-layer", () => {
		const classify = createHevcUnitClassifier(hvcC(2));
		expect(classify(lengthPrefixed([hevc(HEVC_TRAIL_N, 2)], 4))).toBe(false);
		// a picture of sub-layer 2 may reference it
		expect(classify(lengthPrefixed([hevc(HEVC_TRAIL_N, 1)], 4))).toBe(true);
	});

	test("an SPS in the stream sets the highest sub-layer", () => {
		const classify = createHevcUnitClassifier();
		expect(classify(annexB([hevc(HEVC_TRAIL_N, 0)], [4]))).toBe(true);
		expect(classify(annexB([sps(1), hevc(HEVC_CRA, 0)], [4, 4]))).toBe(true);
		expect(classify(annexB([hevc(HEVC_TRAIL_N, 0)], [4]))).toBe(true);
		expect(classify(annexB([hevc(HEVC_TRAIL_N, 1)], [4]))).toBe(false);
	});
});

/** An H.264 NAL unit: its header and a few payload bytes. */
function avc(type: number, refIdc: number): Uint8Array {
	return Uint8Array.from([(refIdc << 5) | type, 0x88, 0x84, 0x21]);
}

/** An HEVC NAL unit: its two header bytes and a few payload bytes. */
function hevc(type: number, temporalId: number, layerId = 0): Uint8Array {
	return Uint8Array.from([
		(type << 1) | (layerId >> 5),
		((layerId & 0x1f) << 3) | (temporalId + 1),
		0xaf,
		0x09,
	]);
}

/** An HEVC SPS of `highestTemporalId + 1` sub-layers. */
function sps(highestTemporalId: number): Uint8Array {
	return Uint8Array.from([
		HEVC_SPS << 1,
		0x01,
		(highestTemporalId << 1) | 1,
		0x01,
	]);
}

function lengthPrefixed(nals: Uint8Array[], lengthSize: number): Uint8Array {
	const bytes: number[] = [];
	for (const nal of nals) {
		for (let i = lengthSize - 1; i >= 0; i--) {
			bytes.push(Math.floor(nal.length / 256 ** i) % 256);
		}
		bytes.push(...nal);
	}
	return Uint8Array.from(bytes);
}

/** NAL units behind start codes of the given lengths. */
function annexB(nals: Uint8Array[], startCodes: number[]): Uint8Array {
	return Uint8Array.from(
		nals.flatMap((nal, i) => [
			...(startCodes[i] === 4 ? [0, 0, 0, 1] : [0, 0, 1]),
			...nal,
		]),
	);
}

/** An avcC record header: version, profile, compatibility, level, NAL length size; no parameter sets. */
function avcC(lengthSize: number): Uint8Array {
	return Uint8Array.from([1, 100, 0, 40, 0xfc | (lengthSize - 1), 0xe0, 0]);
}

/** An hvcC record with one SPS of `highestTemporalId + 1` sub-layers. */
function hvcC(highestTemporalId: number): Uint8Array {
	const header = new Uint8Array(23);
	header[0] = 1;
	header[21] = 0x0f; // 4-byte NAL lengths
	header[22] = 1; // one array
	const nal = sps(highestTemporalId);
	return Uint8Array.from([
		...header,
		0x80 | HEVC_SPS,
		0,
		1,
		0,
		nal.length,
		...nal,
	]);
}
