/**
 * How an estimated start of a LAN tournament match ({@link EtaRange}) is shown: as minutes from now, rounded,
 * and not at all when it's too far out to mean anything. Kept apart from the simulation so the client can
 * count the minutes down without loading it.
 */
import type { EtaRange } from "./EtaSimulation";

/** Estimates further out than this are not shown, too much can change before. */
const MAX_SHOWN_MINUTES = 180;
/** Shown minutes are rounded to multiples of this. */
const SHOWN_MINUTES_STEP = 5;

/**
 * Minutes from now to the estimate, rounded to multiples of 5 (`{ min: 0, max: 0 }` when it's due now), or
 * `null` when the estimate is too far out to be worth showing.
 */
export function minutesFromNow(
	range: EtaRange,
	now: number,
): { min: number; max: number } | null {
	const toMinutes = (timestamp: number) =>
		Math.max(0, (timestamp - now) / 60_000);

	const max =
		Math.ceil(toMinutes(range.latest) / SHOWN_MINUTES_STEP) *
		SHOWN_MINUTES_STEP;
	if (max > MAX_SHOWN_MINUTES) return null;

	return {
		min: Math.min(
			max,
			Math.round(toMinutes(range.earliest) / SHOWN_MINUTES_STEP) *
				SHOWN_MINUTES_STEP,
		),
		max,
	};
}
