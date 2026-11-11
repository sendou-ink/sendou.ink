import type { DetectedEvent, EventType } from "../core/events";

/**
 * An event for tests that only look at part of it: `data` holds whatever the
 * test needs of the type's shape, beside any record fields (store ids, send
 * status) the caller adds.
 */
export function stubEvent<TRecord extends object>(
	event: TRecord & {
		type: EventType;
		t: number;
		confidence: number;
		data: unknown;
	},
): DetectedEvent & TRecord {
	return event as DetectedEvent & TRecord;
}
