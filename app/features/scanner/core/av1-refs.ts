/**
 * AV1 reference bookkeeping for skipping decodes: a temporal unit whose
 * frames refresh no reference slot (and carries no sequence header) leaves
 * the decoder exactly as it found it — every frame's state (CDFs, motion
 * fields, segmentation, loop filter deltas, film grain) is only ever loaded
 * from a reference slot — so a decoder that never sees it decodes every
 * later frame bit for bit the same. Such a unit can be dropped whenever its
 * own picture is not wanted. Parses just enough of each frame header
 * (AV1 spec 5.9.2, up to refresh_frame_flags) to tell.
 */

const OBU_SEQUENCE_HEADER = 1;
const OBU_FRAME_HEADER = 3;
const OBU_FRAME = 6;

const KEY_FRAME = 0;
const INTRA_ONLY_FRAME = 2;
const SWITCH_FRAME = 3;

const SELECT_SCREEN_CONTENT_TOOLS = 2;
const SELECT_INTEGER_MV = 2;
const ALL_FRAMES = 0xff;

interface SequenceHeader {
	reducedStillPictureHeader: boolean;
	decoderModelInfoPresent: boolean;
	equalPictureInterval: boolean;
	framePresentationTimeLength: number;
	bufferRemovalTimeLength: number;
	operatingPoints: { idc: number; decoderModelPresent: boolean }[];
	frameIdNumbersPresent: boolean;
	idLength: number;
	seqForceScreenContentTools: number;
	seqForceIntegerMv: number;
	orderHintBits: number;
}

/** Whether decoding the unit can change what later units decode to. */
export type Av1UnitClassifier = (unit: Uint8Array) => boolean;

/**
 * A classifier for one stream, fed every temporal unit in decode order
 * (skipped ones too: it tracks each slot's frame type). `configObus` are the
 * av1C record's OBUs (codec description bytes from 4 on), if any.
 */
export function createAv1UnitClassifier(
	configObus?: Uint8Array,
): Av1UnitClassifier {
	let sequence: SequenceHeader | null = null;
	const slotFrameTypes = new Array<number>(8).fill(KEY_FRAME);
	if (configObus) {
		for (const obu of readObus(configObus)) {
			if (obu.type === OBU_SEQUENCE_HEADER) {
				sequence = parseSequenceHeader(obu.payload);
			}
		}
	}
	return (unit) => {
		let changesState = false;
		for (const obu of readObus(unit)) {
			if (obu.type === OBU_SEQUENCE_HEADER) {
				sequence = parseSequenceHeader(obu.payload);
				changesState = true;
				continue;
			}
			if (obu.type !== OBU_FRAME_HEADER && obu.type !== OBU_FRAME) continue;
			if (!sequence) return true;
			const header = parseFrameHeader(
				obu.payload,
				sequence,
				slotFrameTypes,
				obu.temporalId,
				obu.spatialId,
			);
			if (header.refreshFrameFlags !== 0) {
				changesState = true;
				for (let slot = 0; slot < 8; slot++) {
					if (header.refreshFrameFlags & (1 << slot)) {
						slotFrameTypes[slot] = header.frameType;
					}
				}
			}
		}
		return changesState;
	};
}

interface Obu {
	type: number;
	temporalId: number;
	spatialId: number;
	payload: Uint8Array;
}

function* readObus(data: Uint8Array): Generator<Obu> {
	let offset = 0;
	while (offset < data.length) {
		const header = data[offset]!;
		const type = (header >> 3) & 0xf;
		const hasExtension = (header >> 2) & 1;
		const hasSize = (header >> 1) & 1;
		offset++;
		let temporalId = 0;
		let spatialId = 0;
		if (hasExtension) {
			const extension = data[offset]!;
			temporalId = extension >> 5;
			spatialId = (extension >> 3) & 3;
			offset++;
		}
		let size = data.length - offset;
		if (hasSize) {
			size = 0;
			for (let i = 0; i < 8; i++) {
				const byte = data[offset++]!;
				size |= (byte & 0x7f) << (i * 7);
				if (!(byte & 0x80)) break;
			}
		}
		yield {
			type,
			temporalId,
			spatialId,
			payload: data.subarray(offset, offset + size),
		};
		offset += size;
	}
}

class BitReader {
	#position = 0;
	readonly #data: Uint8Array;

	constructor(data: Uint8Array) {
		this.#data = data;
	}

	bits(count: number): number {
		let value = 0;
		for (let i = 0; i < count; i++) {
			const byte = this.#data[this.#position >> 3] ?? 0;
			value = value * 2 + ((byte >> (7 - (this.#position & 7))) & 1);
			this.#position++;
		}
		return value;
	}

	flag(): boolean {
		return this.bits(1) === 1;
	}

	uvlc(): void {
		let leadingZeros = 0;
		while (!this.flag()) {
			leadingZeros++;
			if (leadingZeros >= 32) return;
		}
		this.bits(leadingZeros);
	}
}

function parseSequenceHeader(payload: Uint8Array): SequenceHeader {
	const r = new BitReader(payload);
	r.bits(3); // seq_profile
	r.bits(1); // still_picture
	const reducedStillPictureHeader = r.flag();
	let decoderModelInfoPresent = false;
	let equalPictureInterval = false;
	let framePresentationTimeLength = 0;
	let bufferRemovalTimeLength = 0;
	let bufferDelayLength = 0;
	const operatingPoints: SequenceHeader["operatingPoints"] = [];
	if (reducedStillPictureHeader) {
		r.bits(5); // seq_level_idx[0]
		operatingPoints.push({ idc: 0, decoderModelPresent: false });
	} else {
		const timingInfoPresent = r.flag();
		if (timingInfoPresent) {
			r.bits(32); // num_units_in_display_tick
			r.bits(32); // time_scale
			equalPictureInterval = r.flag();
			if (equalPictureInterval) r.uvlc();
			decoderModelInfoPresent = r.flag();
			if (decoderModelInfoPresent) {
				bufferDelayLength = r.bits(5) + 1;
				r.bits(32); // num_units_in_decoding_tick
				bufferRemovalTimeLength = r.bits(5) + 1;
				framePresentationTimeLength = r.bits(5) + 1;
			}
		}
		const initialDisplayDelayPresent = r.flag();
		const operatingPointCount = r.bits(5) + 1;
		for (let i = 0; i < operatingPointCount; i++) {
			const idc = r.bits(12);
			const seqLevelIdx = r.bits(5);
			if (seqLevelIdx > 7) r.bits(1); // seq_tier
			let decoderModelPresent = false;
			if (decoderModelInfoPresent) {
				decoderModelPresent = r.flag();
				if (decoderModelPresent) {
					r.bits(bufferDelayLength); // decoder_buffer_delay
					r.bits(bufferDelayLength); // encoder_buffer_delay
					r.bits(1); // low_delay_mode_flag
				}
			}
			if (initialDisplayDelayPresent && r.flag()) r.bits(4);
			operatingPoints.push({ idc, decoderModelPresent });
		}
	}
	const widthBits = r.bits(4) + 1;
	const heightBits = r.bits(4) + 1;
	r.bits(widthBits);
	r.bits(heightBits);
	let frameIdNumbersPresent = false;
	let idLength = 0;
	if (!reducedStillPictureHeader) frameIdNumbersPresent = r.flag();
	if (frameIdNumbersPresent) {
		const deltaFrameIdLength = r.bits(4) + 2;
		idLength = r.bits(3) + 1 + deltaFrameIdLength;
	}
	r.bits(3); // use_128x128_superblock, enable_filter_intra, enable_intra_edge_filter
	let seqForceScreenContentTools = SELECT_SCREEN_CONTENT_TOOLS;
	let seqForceIntegerMv = SELECT_INTEGER_MV;
	let orderHintBits = 0;
	if (!reducedStillPictureHeader) {
		r.bits(4); // interintra, masked compound, warped motion, dual filter
		const enableOrderHint = r.flag();
		if (enableOrderHint) r.bits(2); // jnt_comp, ref_frame_mvs
		seqForceScreenContentTools = r.flag()
			? SELECT_SCREEN_CONTENT_TOOLS
			: r.bits(1);
		if (seqForceScreenContentTools > 0) {
			seqForceIntegerMv = r.flag() ? SELECT_INTEGER_MV : r.bits(1);
		}
		if (enableOrderHint) orderHintBits = r.bits(3) + 1;
	}
	return {
		reducedStillPictureHeader,
		decoderModelInfoPresent,
		equalPictureInterval,
		framePresentationTimeLength,
		bufferRemovalTimeLength,
		operatingPoints,
		frameIdNumbersPresent,
		idLength,
		seqForceScreenContentTools,
		seqForceIntegerMv,
		orderHintBits,
	};
}

function parseFrameHeader(
	payload: Uint8Array,
	sequence: SequenceHeader,
	slotFrameTypes: readonly number[],
	temporalId: number,
	spatialId: number,
): { frameType: number; refreshFrameFlags: number } {
	if (sequence.reducedStillPictureHeader) {
		return { frameType: KEY_FRAME, refreshFrameFlags: ALL_FRAMES };
	}
	const r = new BitReader(payload);
	const temporalPointInfo = () => {
		if (sequence.decoderModelInfoPresent && !sequence.equalPictureInterval) {
			r.bits(sequence.framePresentationTimeLength);
		}
	};
	if (r.flag()) {
		// show_existing_frame: showing a key frame reloads it into every slot
		const slot = r.bits(3);
		const frameType = slotFrameTypes[slot]!;
		return {
			frameType,
			refreshFrameFlags: frameType === KEY_FRAME ? ALL_FRAMES : 0,
		};
	}
	const frameType = r.bits(2);
	const showFrame = r.flag();
	if (showFrame) temporalPointInfo();
	if (!showFrame) r.bits(1); // showable_frame
	const frameIsIntra =
		frameType === KEY_FRAME || frameType === INTRA_ONLY_FRAME;
	const errorResilient =
		frameType === SWITCH_FRAME || (frameType === KEY_FRAME && showFrame)
			? true
			: r.flag();
	r.bits(1); // disable_cdf_update
	const allowScreenContentTools =
		sequence.seqForceScreenContentTools === SELECT_SCREEN_CONTENT_TOOLS
			? r.bits(1)
			: sequence.seqForceScreenContentTools;
	if (
		allowScreenContentTools &&
		sequence.seqForceIntegerMv === SELECT_INTEGER_MV
	) {
		r.bits(1); // force_integer_mv
	}
	if (sequence.frameIdNumbersPresent) r.bits(sequence.idLength);
	if (frameType !== SWITCH_FRAME) r.bits(1); // frame_size_override_flag
	r.bits(sequence.orderHintBits);
	if (!frameIsIntra && !errorResilient) r.bits(3); // primary_ref_frame
	if (sequence.decoderModelInfoPresent && r.flag()) {
		for (const point of sequence.operatingPoints) {
			if (!point.decoderModelPresent) continue;
			const inTemporalLayer = (point.idc >> temporalId) & 1;
			const inSpatialLayer = (point.idc >> (spatialId + 8)) & 1;
			if (point.idc === 0 || (inTemporalLayer && inSpatialLayer)) {
				r.bits(sequence.bufferRemovalTimeLength);
			}
		}
	}
	const refreshFrameFlags =
		frameType === SWITCH_FRAME || (frameType === KEY_FRAME && showFrame)
			? ALL_FRAMES
			: r.bits(8);
	return { frameType, refreshFrameFlags };
}
