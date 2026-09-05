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

/** `FULL` = the required players are free for the whole window, `ONE_SHORT` = one short, a sub is needed. */
export type PlayableWindowTier = "FULL" | "ONE_SHORT";

export interface PlayableWindow extends TimeRange {
	tier: PlayableWindowTier;
	/** Members free for the whole window, in the order they were given. */
	userIds: Array<number>;
}

/** A span within one editor day in minutes from midnight. `end` may pass 1440 for a range crossing midnight. */
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

/** A commitment overriding reported availability. `name` is e.g. the tournament's name, null when the type says it (a scrim). */
export interface BusyBlock extends TimeRange {
	type: "tournament" | "scrim" | "teamEvent";
	name: string | null;
}

/**
 * `available` = reported availability covers the window, `partial` = part of it (`ranges` say which),
 * `unavailable` = a week was reported but none overlaps, `busy` = a commitment overrides whatever
 * was reported, `unknown` = no reported week covers the window.
 */
export type WindowAvailability =
	| { status: "available" | "partial"; ranges: Array<TimeRange> }
	| { status: "busy"; block: BusyBlock }
	| { status: "unavailable" }
	| { status: "unknown" };

/** One person's fit to a window as roster views render it. `notes` is left out by views without day notes at hand. */
export interface WindowAvailabilityEntry {
	userId: number;
	availability: WindowAvailability;
	notes?: Array<string>;
}

/**
 * What `Availability.availabilityInWindow` resolves a status from. Sent to the browser as is by
 * views asking about many windows, so narrowing one down (a start inside a post's flexibility)
 * needs no further round trip.
 */
export interface WindowSchedule {
	userId: number;
	/** Whether they filled in the week the window falls in. */
	reported: boolean;
	/** Effective availability inside the window. */
	ranges: Array<TimeRange>;
	/** Commitments overlapping the window. */
	busy: Array<BusyBlock>;
}

/**
 * One person's week as read-only views render it: seven days in the viewer's timezone with the
 * time they are free to play, commitments already cut out ("when can they play", not "what are they doing").
 */
export interface ScheduleWeekView {
	week: "current" | "next";
	weekNumber: number;
	/** Whether they filled the week in at all. */
	reported: boolean;
	days: Array<{ noonAt: number; ranges: Array<TimeRange> }>;
}
