/**
 * createAv1UnitClassifier over hand-built AV1 temporal units: which units
 * change the decoder's reference state (and so must be decoded) and which a
 * decoder may skip.
 */

import assert from "node:assert/strict";
import { createAv1UnitClassifier } from "../../core/av1-refs";
import { test } from "../node-test-compat";

const OBU_SEQUENCE_HEADER = 1;
const OBU_TEMPORAL_DELIMITER = 2;
const OBU_FRAME = 6;
const KEY_FRAME = 0;
const INTER_FRAME = 1;

test("a key frame unit changes state", () => {
	const classify = createAv1UnitClassifier(sequenceHeaderObu());
	assert.equal(classify(unit(keyFrameObu())), true);
});

test("an inter frame refreshing no slot can be skipped", () => {
	const classify = createAv1UnitClassifier(sequenceHeaderObu());
	classify(unit(keyFrameObu()));
	assert.equal(classify(unit(interFrameObu({ refresh: 0 }))), false);
});

test("an inter frame refreshing a slot changes state", () => {
	const classify = createAv1UnitClassifier(sequenceHeaderObu());
	classify(unit(keyFrameObu()));
	assert.equal(classify(unit(interFrameObu({ refresh: 0b100 }))), true);
});

test("a hidden frame refreshing a slot keeps its unit decoded", () => {
	const classify = createAv1UnitClassifier(sequenceHeaderObu());
	classify(unit(keyFrameObu()));
	assert.equal(
		classify(
			unit(
				interFrameObu({ refresh: 0b10, show: false }),
				interFrameObu({ refresh: 0 }),
			),
		),
		true,
	);
});

test("showing an existing inter frame can be skipped, showing a key frame cannot", () => {
	const classify = createAv1UnitClassifier(sequenceHeaderObu());
	classify(unit(keyFrameObu()));
	classify(unit(interFrameObu({ refresh: 0b10, show: false })));
	assert.equal(classify(unit(showExistingObu(1))), false);
	assert.equal(classify(unit(showExistingObu(0))), true);
});

test("a unit carrying a sequence header changes state", () => {
	const classify = createAv1UnitClassifier(sequenceHeaderObu());
	classify(unit(keyFrameObu()));
	assert.equal(
		classify(unit(sequenceHeaderObu(), interFrameObu({ refresh: 0 }))),
		true,
	);
});

test("without a sequence header nothing is skipped", () => {
	const classify = createAv1UnitClassifier();
	assert.equal(classify(unit(interFrameObu({ refresh: 0 }))), true);
});

/** A sequence header with timing info, frame ids off, order hints of 7 bits and screen content tools chosen per frame. */
function sequenceHeaderObu(): Uint8Array {
	const w = new BitWriter();
	w.bits(0, 3); // seq_profile
	w.bits(0, 1); // still_picture
	w.bits(0, 1); // reduced_still_picture_header
	w.bits(1, 1); // timing_info_present_flag
	w.bits(1, 32); // num_units_in_display_tick
	w.bits(60, 32); // time_scale
	w.bits(0, 1); // equal_picture_interval
	w.bits(0, 1); // decoder_model_info_present_flag
	w.bits(0, 1); // initial_display_delay_present_flag
	w.bits(0, 5); // operating_points_cnt_minus_1
	w.bits(0, 12); // operating_point_idc[0]
	w.bits(8, 5); // seq_level_idx[0]
	w.bits(0, 1); // seq_tier[0]
	w.bits(10, 4); // frame_width_bits_minus_1
	w.bits(10, 4); // frame_height_bits_minus_1
	w.bits(1919, 11); // max_frame_width_minus_1
	w.bits(1079, 11); // max_frame_height_minus_1
	w.bits(0, 1); // frame_id_numbers_present_flag
	w.bits(0, 3); // 128x128 superblock, filter intra, intra edge filter
	w.bits(0, 4); // interintra, masked compound, warped motion, dual filter
	w.bits(1, 1); // enable_order_hint
	w.bits(0, 2); // jnt_comp, ref_frame_mvs
	w.bits(1, 1); // seq_choose_screen_content_tools
	w.bits(1, 1); // seq_choose_integer_mv
	w.bits(6, 3); // order_hint_bits_minus_1
	return obu(OBU_SEQUENCE_HEADER, w.bytes());
}

function keyFrameObu(): Uint8Array {
	const w = new BitWriter();
	w.bits(0, 1); // show_existing_frame
	w.bits(KEY_FRAME, 2);
	w.bits(1, 1); // show_frame
	w.bits(0, 1); // disable_cdf_update
	w.bits(0, 1); // allow_screen_content_tools
	w.bits(0, 1); // frame_size_override_flag
	w.bits(0, 7); // order_hint
	return obu(OBU_FRAME, w.bytes());
}

function interFrameObu({
	refresh,
	show = true,
}: {
	refresh: number;
	show?: boolean;
}): Uint8Array {
	const w = new BitWriter();
	w.bits(0, 1); // show_existing_frame
	w.bits(INTER_FRAME, 2);
	w.bits(show ? 1 : 0, 1); // show_frame
	if (!show) w.bits(1, 1); // showable_frame
	w.bits(0, 1); // error_resilient_mode
	w.bits(0, 1); // disable_cdf_update
	w.bits(1, 1); // allow_screen_content_tools
	w.bits(0, 1); // force_integer_mv
	w.bits(0, 1); // frame_size_override_flag
	w.bits(5, 7); // order_hint
	w.bits(7, 3); // primary_ref_frame
	w.bits(refresh, 8); // refresh_frame_flags
	return obu(OBU_FRAME, w.bytes());
}

function showExistingObu(slot: number): Uint8Array {
	const w = new BitWriter();
	w.bits(1, 1); // show_existing_frame
	w.bits(slot, 3); // frame_to_show_map_idx
	return obu(OBU_FRAME, w.bytes());
}

/** An OBU with its size field (leb128). */
function obu(type: number, payload: Uint8Array): Uint8Array {
	const size: number[] = [];
	let remaining = payload.length;
	do {
		const byte = remaining & 0x7f;
		remaining >>= 7;
		size.push(remaining > 0 ? byte | 0x80 : byte);
	} while (remaining > 0);
	return Uint8Array.from([(type << 3) | 0b10, ...size, ...payload]);
}

/** A temporal unit: a temporal delimiter, then `obus`. */
function unit(...obus: Uint8Array[]): Uint8Array {
	return Uint8Array.from([
		...obu(OBU_TEMPORAL_DELIMITER, new Uint8Array()),
		...obus.flatMap((o) => [...o]),
	]);
}

class BitWriter {
	readonly #bits: number[] = [];

	bits(value: number, count: number): void {
		for (let i = count - 1; i >= 0; i--) {
			this.#bits.push(Math.floor(value / 2 ** i) % 2);
		}
	}

	bytes(): Uint8Array {
		const out = new Uint8Array(Math.ceil(this.#bits.length / 8));
		for (const [i, bit] of this.#bits.entries()) {
			if (bit) out[i >> 3]! |= 0x80 >> (i & 7);
		}
		return out;
	}
}
