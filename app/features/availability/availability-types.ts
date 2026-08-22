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

/**
 * A span within one day of the schedule editor, in minutes from that day's
 * midnight. `end` may pass 1440 for a range crossing midnight.
 */
export interface DayTimeRange {
	start: number;
	end: number;
}

/** One day of the schedule editor: the ranges painted on its track plus its note. */
export interface AvailabilityEditorDay {
	/** `YYYY-MM-DD` in the editing user's timezone */
	date: string;
	ranges: Array<DayTimeRange>;
	note: string;
}

/** The schedule editor's value: the seven days of one week, Monday first. */
export type AvailabilityEditorWeek = Array<AvailabilityEditorDay>;

/** A commitment shown on the editor as a locked block that cannot be painted over. */
export interface EditorCommitment {
	date: string;
	range: DayTimeRange;
	name: string;
}
