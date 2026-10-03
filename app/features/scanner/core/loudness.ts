/**
 * Integrated loudness per ITU-R BS.1770-4 / EBU R128, in LUFS: K-weighting
 * (a high shelf, then a high pass), mean square over 400 ms blocks every
 * 100 ms, the absolute gate at -70 LUFS and the relative gate 10 LU under
 * the absolutely gated loudness. Channels weigh 1 each, as left and right do
 * in the standard. The filter coefficients are derived for any sample rate
 * (the standard tabulates them for 48 kHz only). Plus the look-ahead peak
 * limiter that lets quiet footage with sharp peaks be raised to a target.
 */

const BLOCK_SECONDS = 0.4;
const BLOCK_STEP_SECONDS = 0.1;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = 10;
const LOUDNESS_OFFSET = -0.691;
/** the limiter sees a peak coming this early and ramps down before it */
const LIMITER_LOOKAHEAD_SECONDS = 0.005;
const LIMITER_ATTACK_SECONDS = 0.0015;
const LIMITER_RELEASE_SECONDS = 0.15;

interface Biquad {
	b: [number, number, number];
	a: [number, number];
}

/** Integrated loudness in LUFS; -Infinity for silence (or audio shorter than one block). */
export function integratedLoudness(
	channels: readonly Float32Array[],
	sampleRate: number,
): number {
	const blockLength = Math.round(BLOCK_SECONDS * sampleRate);
	const step = Math.round(BLOCK_STEP_SECONDS * sampleRate);
	const length = channels[0]?.length ?? 0;
	if (length < blockLength) return Number.NEGATIVE_INFINITY;

	const filters = kWeighting(sampleRate);
	const squaredPrefixSums = channels.map((channel) => {
		const weighted = filters.reduce(applyBiquad, channel);
		const sums = new Float64Array(length + 1);
		for (let i = 0; i < length; i++) {
			sums[i + 1] = sums[i]! + weighted[i]! ** 2;
		}
		return sums;
	});

	const blocks: number[][] = [];
	for (let start = 0; start + blockLength <= length; start += step) {
		blocks.push(
			squaredPrefixSums.map(
				(sums) => (sums[start + blockLength]! - sums[start]!) / blockLength,
			),
		);
	}

	const aboveAbsolute = blocks.filter(
		(block) => blockLoudness(block) > ABSOLUTE_GATE_LUFS,
	);
	if (aboveAbsolute.length === 0) return Number.NEGATIVE_INFINITY;
	const relativeGate =
		gatedLoudness(aboveAbsolute, channels.length) - RELATIVE_GATE_LU;
	const gated = aboveAbsolute.filter(
		(block) => blockLoudness(block) > relativeGate,
	);

	return gatedLoudness(gated, channels.length);
}

/**
 * Keeps every sample within ±`ceiling` in place, the channels sharing one
 * gain: it dips smoothly just before a peak and recovers after, so the
 * signal around the peak isn't clipped flat. Samples the smoothing still
 * leaves over the ceiling are clamped.
 */
export function limitPeaks(
	channels: readonly Float32Array[],
	sampleRate: number,
	ceiling: number,
): void {
	const length = channels[0]?.length ?? 0;
	const needed = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		let peak = 0;
		for (const channel of channels)
			peak = Math.max(peak, Math.abs(channel[i]!));
		needed[i] = peak > ceiling ? ceiling / peak : 1;
	}
	const ahead = slidingMinimum(
		needed,
		Math.round(LIMITER_LOOKAHEAD_SECONDS * sampleRate),
	);
	const attack = Math.exp(-1 / (LIMITER_ATTACK_SECONDS * sampleRate));
	const release = Math.exp(-1 / (LIMITER_RELEASE_SECONDS * sampleRate));
	let gain = 1;
	for (let i = 0; i < length; i++) {
		const target = ahead[i]!;
		gain = target + (target < gain ? attack : release) * (gain - target);
		for (const channel of channels) {
			channel[i] = Math.max(-ceiling, Math.min(ceiling, channel[i]! * gain));
		}
	}
}

/** Each sample's minimum over itself and the `window` samples after it. */
function slidingMinimum(values: Float32Array, window: number): Float32Array {
	const result = new Float32Array(values.length);
	const deque: number[] = [];
	let head = 0;
	for (let i = values.length - 1; i >= 0; i--) {
		while (deque.length > head && values[deque.at(-1)!]! >= values[i]!) {
			deque.pop();
		}
		deque.push(i);
		while (deque[head]! > i + window) head++;
		result[i] = values[deque[head]!]!;
	}
	return result;
}

function blockLoudness(channelMeanSquares: readonly number[]): number {
	const sum = channelMeanSquares.reduce((total, z) => total + z, 0);
	return LOUDNESS_OFFSET + 10 * Math.log10(sum);
}

function gatedLoudness(blocks: readonly number[][], channelCount: number) {
	let sum = 0;
	for (let channel = 0; channel < channelCount; channel++) {
		sum +=
			blocks.reduce((total, block) => total + block[channel]!, 0) /
			blocks.length;
	}
	return LOUDNESS_OFFSET + 10 * Math.log10(sum);
}

/** The two K-weighting stages as RBJ biquads (pyloudnorm's parameters). */
function kWeighting(sampleRate: number): Biquad[] {
	return [
		highShelf({ sampleRate, gainDb: 4, q: 1 / Math.SQRT2, frequency: 1500 }),
		highPass({ sampleRate, q: 0.5, frequency: 38 }),
	];
}

function highShelf({
	sampleRate,
	gainDb,
	q,
	frequency,
}: {
	sampleRate: number;
	gainDb: number;
	q: number;
	frequency: number;
}): Biquad {
	const a = 10 ** (gainDb / 40);
	const w0 = (2 * Math.PI * frequency) / sampleRate;
	const alpha = Math.sin(w0) / (2 * q);
	const cos = Math.cos(w0);
	const root = 2 * Math.sqrt(a) * alpha;
	const a0 = a + 1 - (a - 1) * cos + root;
	return normalized(
		[
			a * (a + 1 + (a - 1) * cos + root),
			-2 * a * (a - 1 + (a + 1) * cos),
			a * (a + 1 + (a - 1) * cos - root),
		],
		[a0, 2 * (a - 1 - (a + 1) * cos), a + 1 - (a - 1) * cos - root],
	);
}

function highPass({
	sampleRate,
	q,
	frequency,
}: {
	sampleRate: number;
	q: number;
	frequency: number;
}): Biquad {
	const w0 = (2 * Math.PI * frequency) / sampleRate;
	const alpha = Math.sin(w0) / (2 * q);
	const cos = Math.cos(w0);
	return normalized(
		[(1 + cos) / 2, -(1 + cos), (1 + cos) / 2],
		[1 + alpha, -2 * cos, 1 - alpha],
	);
}

function normalized(
	b: [number, number, number],
	[a0, a1, a2]: [number, number, number],
): Biquad {
	return { b: [b[0] / a0, b[1] / a0, b[2] / a0], a: [a1 / a0, a2 / a0] };
}

function applyBiquad(input: Float32Array, { b, a }: Biquad): Float32Array {
	const output = new Float32Array(input.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < input.length; i++) {
		const x = input[i]!;
		const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
		output[i] = y;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
	}
	return output;
}
