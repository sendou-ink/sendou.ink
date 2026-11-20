/**
 * H.264 and HEVC reference bookkeeping for skipping decodes, the counterpart
 * of av1-refs.ts: a picture no later picture may reference leaves the
 * decoder as it found it, so it can go undecoded whenever its own picture is
 * not wanted (what a decoder's "skip non-reference frames" mode drops).
 *
 * - H.264: every slice has nal_ref_idc 0 (7.4.1). frame_num and the picture
 *   order count are derived from reference pictures only (8.2.1).
 * - HEVC: every slice is a sub-layer non-reference picture (TRAIL_N, TSA_N,
 *   STSA_N, RADL_N, RASL_N) of the highest sub-layer: only pictures of higher
 *   sub-layers may reference one (7.4.2.2), and the picture order count skips
 *   them (8.3.1, prevTid0Pic).
 *
 * A unit carrying a parameter set, an end of sequence or stream, a NAL type
 * this does not know, or no picture at all, is decoded.
 */

const AVC_SLICE_FIRST = 1;
const AVC_SLICE_LAST = 5;
const AVC_IDR = 5;
/** SEI, access unit delimiter, filler: no decoder state */
const AVC_STATELESS = new Set([6, 9, 12]);

const HEVC_VCL_LAST = 31;
const HEVC_SUB_LAYER_NON_REFERENCE = new Set([0, 2, 4, 6, 8]);
const HEVC_SPS = 33;
/** access unit delimiter, filler, prefix and suffix SEI */
const HEVC_STATELESS = new Set([35, 38, 39, 40]);

/** Whether decoding the unit can change what later units decode to. */
export type NalUnitClassifier = (unit: Uint8Array) => boolean;

/**
 * A classifier for an H.264 stream. `avcC` is the decoder configuration
 * record (codec description): with it units are length-prefixed NAL units,
 * without it Annex B.
 */
export function createAvcUnitClassifier(avcC?: Uint8Array): NalUnitClassifier {
	const lengthSize = avcC && avcC.length > 4 ? (avcC[4]! & 3) + 1 : null;
	return (unit) => {
		let picture = false;
		let changesState = false;
		for (const offset of nalOffsets(unit, lengthSize)) {
			const header = unit[offset]!;
			const refIdc = (header >> 5) & 3;
			const type = header & 0x1f;
			if (type >= AVC_SLICE_FIRST && type <= AVC_SLICE_LAST) {
				picture = true;
				if (refIdc !== 0 || type === AVC_IDR) changesState = true;
			} else if (!AVC_STATELESS.has(type)) {
				changesState = true;
			}
		}
		return changesState || !picture;
	};
}

/**
 * A classifier for an HEVC stream, fed every unit in decode order (skipped
 * ones too: an SPS in the stream may change its sub-layer count). `hvcC` is
 * the decoder configuration record: with it units are length-prefixed NAL
 * units, without it Annex B.
 */
export function createHevcUnitClassifier(hvcC?: Uint8Array): NalUnitClassifier {
	const lengthSize = hvcC && hvcC.length > 22 ? (hvcC[21]! & 3) + 1 : null;
	let highestTemporalId = hvcC ? configHighestTemporalId(hvcC) : null;
	return (unit) => {
		let picture = false;
		let changesState = false;
		for (const offset of nalOffsets(unit, lengthSize)) {
			const type = (unit[offset]! >> 1) & 0x3f;
			const layerId = ((unit[offset]! & 1) << 5) | (unit[offset + 1]! >> 3);
			const temporalId = (unit[offset + 1]! & 7) - 1;
			if (layerId !== 0) {
				changesState = true;
			} else if (type <= HEVC_VCL_LAST) {
				picture = true;
				if (
					!HEVC_SUB_LAYER_NON_REFERENCE.has(type) ||
					temporalId !== highestTemporalId
				) {
					changesState = true;
				}
			} else if (type === HEVC_SPS) {
				highestTemporalId = spsHighestTemporalId(unit, offset);
				changesState = true;
			} else if (!HEVC_STATELESS.has(type)) {
				changesState = true;
			}
		}
		return changesState || !picture;
	};
}

/** Offsets of the NAL unit headers in `unit`: length-prefixed with `lengthSize` bytes, or Annex B when null. */
function nalOffsets(unit: Uint8Array, lengthSize: number | null): number[] {
	const offsets: number[] = [];
	if (lengthSize === null) {
		for (let i = 0; i + 3 < unit.length; i++) {
			if (unit[i] !== 0 || unit[i + 1] !== 0) continue;
			if (unit[i + 2] === 1) {
				offsets.push(i + 3);
				i += 2;
			}
		}
		return offsets;
	}
	let offset = 0;
	while (offset + lengthSize < unit.length) {
		let length = 0;
		for (let i = 0; i < lengthSize; i++) {
			length = length * 256 + unit[offset + i]!;
		}
		offset += lengthSize;
		if (length === 0) continue;
		offsets.push(offset);
		offset += length;
	}
	return offsets;
}

/** sps_max_sub_layers_minus1 of the SPS whose NAL header is at `offset`. */
function spsHighestTemporalId(data: Uint8Array, offset: number): number | null {
	const byte = data[offset + 2];
	return byte === undefined ? null : (byte >> 1) & 7;
}

/** The highest temporal id per the hvcC record's SPS, null when it carries none. */
function configHighestTemporalId(hvcC: Uint8Array): number | null {
	let highest: number | null = null;
	let offset = 23;
	const arrays = hvcC[22] ?? 0;
	for (let a = 0; a < arrays && offset + 3 <= hvcC.length; a++) {
		const type = hvcC[offset]! & 0x3f;
		const count = (hvcC[offset + 1]! << 8) | hvcC[offset + 2]!;
		offset += 3;
		for (let n = 0; n < count && offset + 2 <= hvcC.length; n++) {
			const length = (hvcC[offset]! << 8) | hvcC[offset + 1]!;
			offset += 2;
			if (type === HEVC_SPS) highest = spsHighestTemporalId(hvcC, offset);
			offset += length;
		}
	}
	return highest;
}
