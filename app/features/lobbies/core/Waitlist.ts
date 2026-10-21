import * as R from "remeda";

/**
 * Who of the waitlist gets the room's open slots. During the priority window a slot goes to the highest in
 * the waitlist who confirmed, decided early once nobody above them can still claim it. After the window
 * everyone who confirmed within it is ranked by waitlist order, then later confirmers first come, first served.
 *
 * @param queue user ids of the waitlist in order, highest first
 */
export function slotWinners({
	slotCount,
	queue,
	confirmedAtByUserId,
	priorityEndsAt,
	now,
}: {
	slotCount: number;
	queue: number[];
	confirmedAtByUserId: Map<number, number>;
	priorityEndsAt: number;
	now: number;
}): number[] {
	if (slotCount <= 0) return [];

	if (now < priorityEndsAt) {
		// everyone above could still confirm, so only the top slots are certain
		return queue
			.slice(0, slotCount)
			.filter((userId) => confirmedAtByUserId.has(userId));
	}

	const queuePosition = (userId: number) => queue.indexOf(userId);
	const confirmers = queue.filter((userId) => confirmedAtByUserId.has(userId));

	return R.sortBy(
		confirmers,
		[
			(userId) =>
				confirmedAtByUserId.get(userId)! <= priorityEndsAt
					? queuePosition(userId)
					: Number.MAX_SAFE_INTEGER,
			"asc",
		],
		[(userId) => confirmedAtByUserId.get(userId)!, "asc"],
	).slice(0, slotCount);
}
