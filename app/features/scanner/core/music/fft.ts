/**
 * In-place iterative radix-2 complex FFT over Float64Arrays, with twiddle and
 * bit-reversal tables cached per size. The inverse scales by 1/n, so a
 * forward and inverse pass round-trips.
 */

interface FftTables {
	cos: Float64Array;
	sin: Float64Array;
	reversed: Uint32Array;
}

const tablesBySize = new Map<number, FftTables>();

export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
	const n = re.length;
	const { cos, sin, reversed } = tablesFor(n);
	for (let i = 0; i < n; i++) {
		const j = reversed[i]!;
		if (i < j) {
			const tr = re[i]!;
			re[i] = re[j]!;
			re[j] = tr;
			const ti = im[i]!;
			im[i] = im[j]!;
			im[j] = ti;
		}
	}
	const sign = inverse ? 1 : -1;
	for (let size = 2; size <= n; size <<= 1) {
		const half = size >> 1;
		const step = n / size;
		for (let start = 0; start < n; start += size) {
			for (let k = 0; k < half; k++) {
				const wr = cos[k * step]!;
				const wi = sign * sin[k * step]!;
				const a = start + k;
				const b = a + half;
				const xr = re[b]! * wr - im[b]! * wi;
				const xi = re[b]! * wi + im[b]! * wr;
				re[b] = re[a]! - xr;
				im[b] = im[a]! - xi;
				re[a] = re[a]! + xr;
				im[a] = im[a]! + xi;
			}
		}
	}
	if (inverse) {
		for (let i = 0; i < n; i++) {
			re[i] = re[i]! / n;
			im[i] = im[i]! / n;
		}
	}
}

export function nextPowerOfTwo(n: number): number {
	let power = 1;
	while (power < n) power <<= 1;
	return power;
}

function tablesFor(n: number): FftTables {
	const cached = tablesBySize.get(n);
	if (cached) return cached;
	if (n < 1 || (n & (n - 1)) !== 0) {
		throw new Error(`FFT size must be a power of two, got ${n}`);
	}
	const cos = new Float64Array(n / 2);
	const sin = new Float64Array(n / 2);
	for (let k = 0; k < n / 2; k++) {
		cos[k] = Math.cos((2 * Math.PI * k) / n);
		sin[k] = Math.sin((2 * Math.PI * k) / n);
	}
	const bits = Math.log2(n);
	const reversed = new Uint32Array(n);
	for (let i = 0; i < n; i++) {
		let r = 0;
		for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
		reversed[i] = r;
	}
	const tables = { cos, sin, reversed };
	tablesBySize.set(n, tables);
	return tables;
}
