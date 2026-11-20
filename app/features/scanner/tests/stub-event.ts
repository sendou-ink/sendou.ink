import type { DetectedEvent, EventType } from "../core/events";
import type { FieldScores } from "../core/field-scores";

/**
 * An event for tests that only look at part of it: `data` holds whatever the
 * test needs of the type's shape, beside any record fields (store ids, send
 * status) the caller adds. A score under a key naming no field of `data`
 * (`read`) counts toward the read's mean and takes part in no vote.
 */
export function stubEvent<TRecord extends object>(
	event: TRecord & {
		type: EventType;
		t: number;
		scores: FieldScores;
		data: unknown;
	},
): DetectedEvent & TRecord {
	return event as DetectedEvent & TRecord;
}
