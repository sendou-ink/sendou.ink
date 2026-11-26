/**
 * Replay codes the scanner read off the in-game replay browser. The game only serves a replay
 * for a limited time after its upload and drops every replay on a version update, so a code is
 * worth showing only while it still opens.
 */
import { differenceInDays } from "date-fns";
import * as Patches from "~/features/builds/core/patches";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";

const REPLAY_VIEWABLE_DAYS = 30;

/**
 * Whether a replay uploaded at `uploadedAt` can still be watched at `now`: under 30 days old and
 * uploaded on the game patch that is still current.
 *
 * @param uploadedAt database timestamp (seconds); the scan's upload time stands in for the replay's
 */
export function isViewable({
	uploadedAt,
	now,
}: {
	uploadedAt: number;
	now: Date;
}): boolean {
	if (
		differenceInDays(now, databaseTimestampToDate(uploadedAt)) >=
		REPLAY_VIEWABLE_DAYS
	) {
		return false;
	}

	return (
		Patches.ofTimestamp(uploadedAt) ===
		Patches.ofTimestamp(dateToDatabaseTimestamp(now))
	);
}
