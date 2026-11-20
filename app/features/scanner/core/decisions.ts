/**
 * Threshold decision log: detectors compare a measured value to a tuning
 * constant through these helpers, so a tool can record every decision and see
 * how close the fixtures come to each threshold (pnpm scanner:report). With no
 * recorder set a helper is just the comparison.
 */

type DecisionOp = ">=" | ">" | "<=" | "<";

export interface DecisionSample {
	/** `<file under core/, sans detectors/ and /index>:<CONSTANT>[#site]` */
	id: string;
	value: number;
	threshold: number;
	op: DecisionOp;
	passed: boolean;
}

interface DecisionSide<TSource> {
	count: number;
	/** the sample closest to its threshold; null = no sample on this side */
	nearest: { value: number; margin: number; source: TSource } | null;
}

export interface DecisionMargin<TSource> {
	id: string;
	op: DecisionOp;
	/** null = the threshold is derived per read and varied */
	threshold: number | null;
	passed: DecisionSide<TSource>;
	failed: DecisionSide<TSource>;
	/** smallest margin of either side */
	margin: number;
	/** `margin` as a share of the span the observed values (and thresholds) cover */
	relativeMargin: number;
}

type DecisionRecorder = (sample: DecisionSample) => void;

let recorder: DecisionRecorder | null = null;

/** Sends every decision to `next` until called again; null stops recording. */
export function setRecorder(next: DecisionRecorder | null): void {
	recorder = next;
}

/** `value >= threshold`, recorded under `id`. */
export function atLeast(id: string, value: number, threshold: number): boolean {
	return decided(id, value, threshold, ">=", value >= threshold);
}

/** `value > threshold`, recorded under `id`. */
export function above(id: string, value: number, threshold: number): boolean {
	return decided(id, value, threshold, ">", value > threshold);
}

/** `value <= threshold`, recorded under `id`. */
export function atMost(id: string, value: number, threshold: number): boolean {
	return decided(id, value, threshold, "<=", value <= threshold);
}

/** `value < threshold`, recorded under `id`. */
export function below(id: string, value: number, threshold: number): boolean {
	return decided(id, value, threshold, "<", value < threshold);
}

/**
 * Per decision id, the sample nearest to its threshold on the passing and the
 * failing side, most fragile (smallest relative margin) first. Samples with a
 * non-finite value or threshold are left out.
 */
export function margins<TSource>(
	samples: Iterable<DecisionSample & { source: TSource }>,
): DecisionMargin<TSource>[] {
	const byId = new Map<string, Accumulator<TSource>>();
	for (const sample of samples) {
		if (!Number.isFinite(sample.value) || !Number.isFinite(sample.threshold)) {
			continue;
		}
		let acc = byId.get(sample.id);
		if (!acc) {
			acc = {
				op: sample.op,
				threshold: sample.threshold,
				min: Number.POSITIVE_INFINITY,
				max: Number.NEGATIVE_INFINITY,
				passed: { count: 0, nearest: null },
				failed: { count: 0, nearest: null },
			};
			byId.set(sample.id, acc);
		}
		if (acc.threshold !== sample.threshold) acc.threshold = null;
		acc.min = Math.min(acc.min, sample.value, sample.threshold);
		acc.max = Math.max(acc.max, sample.value, sample.threshold);

		const side = sample.passed ? acc.passed : acc.failed;
		const margin = Math.abs(sample.value - sample.threshold);
		side.count++;
		if (!side.nearest || margin < side.nearest.margin) {
			side.nearest = { value: sample.value, margin, source: sample.source };
		}
	}

	return [...byId.entries()]
		.map(([id, acc]) => {
			const margin = Math.min(
				acc.passed.nearest?.margin ?? Number.POSITIVE_INFINITY,
				acc.failed.nearest?.margin ?? Number.POSITIVE_INFINITY,
			);
			const span = acc.max - acc.min;
			return {
				id,
				op: acc.op,
				threshold: acc.threshold,
				passed: acc.passed,
				failed: acc.failed,
				margin,
				relativeMargin: span > 0 ? margin / span : 0,
			};
		})
		.sort((a, b) => a.relativeMargin - b.relativeMargin || a.margin - b.margin);
}

interface Accumulator<TSource> {
	op: DecisionOp;
	threshold: number | null;
	min: number;
	max: number;
	passed: DecisionSide<TSource>;
	failed: DecisionSide<TSource>;
}

function decided(
	id: string,
	value: number,
	threshold: number,
	op: DecisionOp,
	passed: boolean,
): boolean {
	if (recorder) recorder({ id, value, threshold, op, passed });
	return passed;
}
