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

/**
 * A span a commitment makes the user busy for, overriding whatever
 * availability they reported. `name` is what the user is at (e.g. the
 * tournament's name); `null` when the type alone says it (a scrim).
 */
export interface BusyBlock extends TimeRange {
	type: "tournament" | "scrim" | "teamEvent";
	name: string | null;
}

/**
 * How one person's schedule relates to an event's window:
 * - `available` — reported availability covers the whole window
 * - `partial` — covers part of it; `ranges` show which part
 * - `unavailable` — a week was reported, none of it overlaps the window
 * - `busy` — a commitment elsewhere overlaps the window, overriding whatever
 *   was reported
 * - `unknown` — no reported week covers the window
 */
export type WindowAvailability =
	| { status: "available" | "partial"; ranges: Array<TimeRange> }
	| { status: "busy"; block: BusyBlock }
	| { status: "unavailable" }
	| { status: "unknown" };
