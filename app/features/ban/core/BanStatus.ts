/**
 * A site ban as `User.banned` stores it: `0` or `null` for none, `1` for a ban without an end, otherwise the
 * database timestamp the ban lifts at. Lifting a timed ban doesn't touch the column, so whether a user is banned
 * depends on the time it is asked at.
 */
import { databaseTimestampToDate } from "~/utils/dates";

const PERMANENT = 1;

/** Whether the ban of a `User.banned` value holds at `now`. A timed ban lifts at the second it ends. */
export function isActive(
	banned: number | null | undefined,
	now: Date = new Date(),
): boolean {
	if (!banned) return false;
	if (banned === PERMANENT) return true;

	return databaseTimestampToDate(banned) > now;
}

/** When the ban of a `User.banned` value lifts, `null` for a ban without an end or no ban at all. */
export function endsAt(banned: number | null | undefined): Date | null {
	if (!banned || banned === PERMANENT) return null;

	return databaseTimestampToDate(banned);
}
