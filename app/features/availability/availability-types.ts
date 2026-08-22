/** A span of absolute time. Both ends are database timestamps (unix seconds), `endsAt` exclusive. */
export interface TimeRange {
	startsAt: number;
	endsAt: number;
}

/** Availability of one member of a team, as effective availability (reported minus commitments). */
export interface MemberAvailability {
	userId: number;
	ranges: Array<TimeRange>;
}

/**
 * A span the team could play in:
 * - `FULL` = the required amount of players is free for the whole window
 * - `ONE_SHORT` = one player short, so they would need a sub
 */
export type PlayableWindowTier = "FULL" | "ONE_SHORT";

export interface PlayableWindow extends TimeRange {
	tier: PlayableWindowTier;
	/** Members free for the whole window, in the order they were given. */
	userIds: Array<number>;
}
