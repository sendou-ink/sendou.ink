import { describe, expect, test } from "vitest";
import { integratedLoudness, limitPeaks } from "../../core/loudness";

const SAMPLE_RATE = 48_000;

function sine({
	amplitude,
	seconds,
	frequency = 997,
}: {
	amplitude: number;
	seconds: number;
	frequency?: number;
}) {
	return Float32Array.from(
		{ length: Math.round(seconds * SAMPLE_RATE) },
		(_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE),
	);
}

describe("integratedLoudness", () => {
	// BS.1770: a 0 dBFS 1 kHz sine in one of left/right reads -3.01 LUFS
	test.each([
		{ why: "-20 dBFS sine in both channels", channels: 2, expected: -20 },
		{ why: "-20 dBFS sine in one channel", channels: 1, expected: -23.01 },
	])("$why", ({ channels, expected }) => {
		const tone = sine({ amplitude: 0.1, seconds: 3 });

		expect(
			integratedLoudness(Array(channels).fill(tone), SAMPLE_RATE),
		).toBeCloseTo(expected, 1);
	});

	// only the few blocks straddling the edge count at partial level
	test("silence gates out, so it barely lowers the loudness", () => {
		const tone = sine({ amplitude: 0.1, seconds: 3 });
		const withSilence = new Float32Array(tone.length * 2);
		withSilence.set(tone);

		expect(integratedLoudness([withSilence], SAMPLE_RATE)).toBeCloseTo(
			integratedLoudness([tone], SAMPLE_RATE),
			0,
		);
	});

	test("pure silence has no loudness", () => {
		expect(
			integratedLoudness([new Float32Array(SAMPLE_RATE)], SAMPLE_RATE),
		).toBe(Number.NEGATIVE_INFINITY);
	});

	test("coefficients hold at 44.1 kHz too", () => {
		const rate = 44_100;
		const tone = Float32Array.from(
			{ length: 3 * rate },
			(_, i) => 0.1 * Math.sin((2 * Math.PI * 997 * i) / rate),
		);

		expect(integratedLoudness([tone, tone], rate)).toBeCloseTo(-20, 1);
	});
});

describe("limitPeaks", () => {
	const CEILING = 0.9;

	test("leaves audio under the ceiling as it is", () => {
		const tone = sine({ amplitude: 0.5, seconds: 1 });
		const limited = tone.slice();

		limitPeaks([limited], SAMPLE_RATE, CEILING);

		expect(limited).toEqual(tone);
	});

	test("keeps a spike under the ceiling and recovers after it", () => {
		const tone = sine({ amplitude: 0.5, seconds: 2 });
		const spiked = tone.slice();
		spiked[SAMPLE_RATE / 2] = 2;
		const other = tone.slice();

		limitPeaks([spiked, other], SAMPLE_RATE, CEILING);

		const peak = [spiked, other].reduce(
			(max, channel) =>
				channel.reduce(
					(channelMax, x) => Math.max(channelMax, Math.abs(x)),
					max,
				),
			0,
		);
		expect(peak).toBeLessThanOrEqual(CEILING);
		// both channels dip together
		expect(other[SAMPLE_RATE / 2]!).toBeCloseTo(
			(tone[SAMPLE_RATE / 2]! * CEILING) / 2,
			2,
		);
		const later = SAMPLE_RATE + 100;
		expect(spiked[later]!).toBeCloseTo(tone[later]!, 2);
	});
});
