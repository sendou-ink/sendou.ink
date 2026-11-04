/**
 * Windowed-sinc interpolation: reading a signal at fractional positions,
 * and resampling a whole signal to another rate (band-limited when going
 * down, so the result does not alias). The kernel is tabulated per
 * fractional phase, so a read is a dot product and no trigonometry.
 */

const DEFAULT_HALF_TAPS = 16;
const PHASES = 512;

interface SincKernel {
	halfTaps: number;
	/** `PHASES + 1` rows of `2 × halfTaps` taps */
	table: Float32Array;
}

const kernels = new Map<string, SincKernel>();

/**
 * Reads `x` at fractional sample positions with a Hann-windowed sinc of
 * `halfTaps` on each side; `cutoff` (≤ 1, a fraction of Nyquist) lowpasses
 * at the same time. Zero outside the signal.
 */
export function sincReader(
	x: Float32Array,
	{ halfTaps = DEFAULT_HALF_TAPS, cutoff = 1 } = {},
): (position: number) => number {
	const kernel = sincKernel(halfTaps, cutoff);
	const width = 2 * halfTaps;
	const { table } = kernel;
	return (position) => {
		const base = Math.floor(position);
		const phase = (position - base) * PHASES;
		const row = Math.floor(phase);
		const blend = phase - row;
		const a = row * width;
		const b = a + width;
		const first = base - halfTaps + 1;
		let sum = 0;
		for (let j = 0; j < width; j++) {
			const index = first + j;
			if (index < 0 || index >= x.length) continue;
			const weight = table[a + j]! + blend * (table[b + j]! - table[a + j]!);
			sum += x[index]! * weight;
		}
		return sum;
	};
}

/** `x` resampled from `fromRate` to `toRate`. */
export function resample(
	x: Float32Array,
	fromRate: number,
	toRate: number,
): Float32Array {
	if (fromRate === toRate) return x.slice();
	const ratio = fromRate / toRate;
	const cutoff = Math.min(1, toRate / fromRate) * 0.95;
	const read = sincReader(x, {
		halfTaps: Math.ceil(DEFAULT_HALF_TAPS / cutoff),
		cutoff,
	});
	const out = new Float32Array(Math.floor(x.length / ratio));
	for (let i = 0; i < out.length; i++) out[i] = read(i * ratio);
	return out;
}

function sincKernel(halfTaps: number, cutoff: number): SincKernel {
	const key = `${halfTaps}:${cutoff}`;
	const cached = kernels.get(key);
	if (cached) return cached;
	const width = 2 * halfTaps;
	const table = new Float32Array((PHASES + 1) * width);
	for (let row = 0; row <= PHASES; row++) {
		const frac = row / PHASES;
		for (let j = 0; j < width; j++) {
			const distance = j - halfTaps + 1 - frac;
			table[row * width + j] = tap(distance, halfTaps, cutoff);
		}
	}
	const kernel = { halfTaps, table };
	kernels.set(key, kernel);
	return kernel;
}

function tap(distance: number, halfTaps: number, cutoff: number): number {
	if (Math.abs(distance) >= halfTaps) return 0;
	const window = 0.5 + 0.5 * Math.cos((Math.PI * distance) / halfTaps);
	const arg = Math.PI * distance * cutoff;
	const sinc = arg === 0 ? 1 : Math.sin(arg) / arg;
	return cutoff * sinc * window;
}
