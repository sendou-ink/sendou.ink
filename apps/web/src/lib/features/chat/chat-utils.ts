import { addHours } from "date-fns";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { CHAT } from "./chat-constants.ts";
import type { ChatRoomLifecycle } from "./chat-types.ts";

/**
 * Where a room is on its active → inactive → archived arc. `inactiveAt` is a
 * database timestamp (possibly in the future when scheduled at creation);
 * deletion is not a lifecycle state — the cleanup routine removes the row.
 */
export function roomLifecycle(
	inactiveAt: number | null,
	now = new Date(),
): ChatRoomLifecycle {
	if (inactiveAt === null) return "ACTIVE";

	const inactiveDate = databaseTimestampToDate(inactiveAt);
	if (now < inactiveDate) return "ACTIVE";
	if (now < addHours(inactiveDate, CHAT.INACTIVE_TO_ARCHIVED_HOURS)) {
		return "INACTIVE";
	}
	return "ARCHIVED";
}

/**
 * When the room's lifecycle next advances without anything happening to it, or
 * null once it is archived (the final state) or has no scheduled inactivity.
 */
export function nextLifecycleChangeAt(
	inactiveAt: number | null,
	now = new Date(),
): Date | null {
	if (inactiveAt === null) return null;

	const inactiveDate = databaseTimestampToDate(inactiveAt);
	if (now < inactiveDate) return inactiveDate;

	const archivedDate = addHours(inactiveDate, CHAT.INACTIVE_TO_ARCHIVED_HOURS);
	if (now < archivedDate) return archivedDate;

	return null;
}

/** Messages can be sent while the room is active or inactive, never archived. */
export function canSendToRoom(lifecycle: ChatRoomLifecycle) {
	return lifecycle !== "ARCHIVED";
}
