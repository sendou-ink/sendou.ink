/**
 * Which upcoming samples a detector pass can possibly run on, worked out
 * ahead of the scheduler from its state at one moment (`DetectorScheduler
 * .checkPlan`). A detector is checked at the first sample its interval has
 * elapsed by, and its interval is one of a few cadences picked by its own
 * outcomes, so its possible check times branch from its last check over the
 * stream's actual timestamps. The VoD decode skips the samples no branch
 * reaches when nothing later needs their decode (frame-source.ts).
 */

/** Mirrors the scheduler's tolerance on elapsed intervals. */
const INTERVAL_EPSILON_S = 1e-6;
/** Stepped samples remembered, so a plan made behind the decoder can be replayed up to it. */
const HISTORY_LIMIT = 512;

export interface DetectorCheckPlan {
	lastCheckT: number;
	/** intervals the detector's next check may come after */
	next: readonly number[];
	/** intervals any check after that may come after */
	later: readonly number[];
}

export interface CheckPlan {
	/** the sample the plan was made at: the detectors' state holds from it on */
	t: number;
	detectors: readonly DetectorCheckPlan[];
}

export interface CheckTracker {
	/** Steps the stream to sample `t` (presentation order); whether a detector pass may run on it. */
	step(t: number): boolean;
	/** Replaces the plan (null = every sample may be checked), replaying the samples stepped since it was made. */
	setPlan(plan: CheckPlan | null): void;
	/** Whether an already stepped sample may be checked under the current plan. */
	wanted(t: number): boolean;
	/** Forgets the stepped samples: the stream jumped. */
	clear(): void;
}

interface Branch {
	lastCheckT: number;
	intervals: readonly number[];
}

/** A tracker over one decode stream. */
export function createCheckTracker(): CheckTracker {
	let history: number[] = [];
	let verdicts = new Map<number, boolean>();
	let branches: Branch[][] | null = null;
	let laters: (readonly number[])[] = [];
	let prevT = Number.NEGATIVE_INFINITY;

	const advance = (t: number): boolean => {
		if (!branches) return true;
		let wanted = false;
		for (const [i, detectorBranches] of branches.entries()) {
			const spawned: Branch[] = [];
			const kept: Branch[] = [];
			for (const branch of detectorBranches) {
				let settled = true;
				for (const interval of branch.intervals) {
					if (fires(branch.lastCheckT, interval, prevT, t)) {
						wanted = true;
						if (!spawned.some((b) => b.lastCheckT === t)) {
							spawned.push({ lastCheckT: t, intervals: laters[i]! });
						}
					}
					if (!elapsed(branch.lastCheckT, interval, t)) settled = false;
				}
				if (!settled) kept.push(branch);
			}
			for (const branch of spawned) {
				if (
					!kept.some(
						(b) => b.lastCheckT === t && b.intervals === branch.intervals,
					)
				) {
					kept.push(branch);
				}
			}
			branches[i] = kept;
		}
		prevT = t;
		return wanted;
	};

	return {
		step(t) {
			const wanted = advance(t);
			history.push(t);
			verdicts.set(t, wanted);
			if (history.length > HISTORY_LIMIT) {
				verdicts.delete(history.shift()!);
			}
			return wanted;
		},
		setPlan(plan) {
			const from = plan ? history.lastIndexOf(plan.t) : -1;
			if (!plan || from < 0) {
				branches = null;
				for (const t of history) verdicts.set(t, true);
				return;
			}
			branches = plan.detectors.map((d) => [
				{ lastCheckT: d.lastCheckT, intervals: d.next },
			]);
			laters = plan.detectors.map((d) => d.later);
			prevT = plan.t;
			for (const t of history.slice(from + 1)) verdicts.set(t, advance(t));
		},
		wanted(t) {
			return verdicts.get(t) ?? true;
		},
		clear() {
			history = [];
			verdicts = new Map();
			branches = null;
			prevT = Number.NEGATIVE_INFINITY;
		},
	};
}

/**
 * Whether the detector last checked at `lastCheckT` may be checked at `t`
 * after `interval`, `prevT` being the sample before: the scheduler checks it
 * at the first sample both its tolerance (`dueDetectors`) and the plain sum
 * (`nextDueT`) let through, so either first crossing.
 */
function fires(
	lastCheckT: number,
	interval: number,
	prevT: number,
	t: number,
): boolean {
	const tolerant = (x: number) =>
		x - lastCheckT >= interval - INTERVAL_EPSILON_S;
	const plain = (x: number) => x >= lastCheckT + interval;
	return (tolerant(t) && !tolerant(prevT)) || (plain(t) && !plain(prevT));
}

function elapsed(lastCheckT: number, interval: number, t: number): boolean {
	return (
		t - lastCheckT >= interval - INTERVAL_EPSILON_S &&
		t >= lastCheckT + interval
	);
}
