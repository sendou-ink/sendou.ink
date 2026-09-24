import type { TimeRange } from "~/features/availability/availability-types";

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const LEAGUE_SCHEDULING = {
	/** Teams can put candidate times up this long before the round becomes playable. */
	OPENS_BEFORE_PLAYABLE_SECONDS: DAY_SECONDS,
	/** Sanity cap on a team's open candidates per set. */
	MAX_OPEN_PROPOSALS_PER_TEAM: 6,
	/** How long before the agreed time a set counts as live while a member streams. */
	LIVE_BEFORE_SECONDS: HOUR_SECONDS / 2,
	/** How long after the agreed time a set without a winner still counts as live. */
	LIVE_AFTER_SECONDS: HOUR_SECONDS,
	/** Length of the busy block a scheduled set puts on its players' schedules. */
	SET_DURATION_SECONDS: HOUR_SECONDS,
	/** Availability is shown until the next round opens, or this long when there is no next round. */
	DEFAULT_WINDOW_SECONDS: 7 * DAY_SECONDS,
	/** The "starting soon" notification goes out this long before the agreed time. */
	STARTING_SOON_SECONDS: HOUR_SECONDS,
	/** A round's playable date starts in the earliest time zone (UTC+14), so it is playable wherever that date has begun. */
	EARLIEST_UTC_OFFSET_SECONDS: 14 * HOUR_SECONDS,
} as const;

/**
 * `CLOSED` = nothing to schedule (no scheduling in the bracket, over, or a team missing), `NOT_OPEN` = the board opens
 * later, `UNSCHEDULED` = the teams are agreeing on a time, `SCHEDULED_LOCKED` = a time is agreed but the
 * round is not playable yet, `SCHEDULED` = agreed and playable.
 */
export type Phase =
	| "CLOSED"
	| "NOT_OPEN"
	| "UNSCHEDULED"
	| "SCHEDULED_LOCKED"
	| "SCHEDULED";

export type ProposalError =
	| "NOT_OPEN"
	| "BEFORE_PLAYABLE"
	| "IN_PAST"
	| "TOO_MANY"
	| "ORGANIZER_LOCKED";

/** Which point of the scheduling flow the set is at; every timestamp in unix seconds. */
export function phase({
	hasScheduling,
	isOver,
	hasBothTeams,
	isPlayableAt,
	scheduledAt,
	now,
}: {
	/** False outside leagues and in a league's real-time brackets. */
	hasScheduling: boolean;
	isOver: boolean;
	hasBothTeams: boolean;
	isPlayableAt: number | null;
	scheduledAt: number | null;
	now: number;
}): Phase {
	if (!hasScheduling || isOver || !hasBothTeams) return "CLOSED";

	const isPlayable = isPlayableAt === null || now >= isPlayableAt;

	if (scheduledAt !== null) {
		return isPlayable ? "SCHEDULED" : "SCHEDULED_LOCKED";
	}

	if (now < opensAt(isPlayableAt)) return "NOT_OPEN";

	return "UNSCHEDULED";
}

/** When teams can start putting times on the board: a day before the round is playable, right away without a playable time. */
export function opensAt(isPlayableAt: number | null) {
	if (isPlayableAt === null) return 0;

	return isPlayableAt - LEAGUE_SCHEDULING.OPENS_BEFORE_PLAYABLE_SECONDS;
}

/** When a round picked to be playable on `date`'s calendar day (read in local time) opens: the start of that day in UTC+14. */
export function playableAtFromDate(date: Date) {
	return (
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 1000 -
		LEAGUE_SCHEDULING.EARLIEST_UTC_OFFSET_SECONDS
	);
}

/** The calendar day a round is playable from, as local midnight, so formatting it shows the organizer's picked date in any time zone. */
export function playableDate(isPlayableAt: number) {
	const earliestZoneDate = new Date(
		(isPlayableAt + LEAGUE_SCHEDULING.EARLIEST_UTC_OFFSET_SECONDS) * 1000,
	);

	return new Date(
		earliestZoneDate.getUTCFullYear(),
		earliestZoneDate.getUTCMonth(),
		earliestZoneDate.getUTCDate(),
	);
}

/** Whether no round becomes playable before an earlier round of its section; rounds in play order, those without a time skipped. */
export function playableAtsAreAscending(
	rounds: Array<{ section?: string | null; isPlayableAt?: number | null }>,
) {
	const latestBySection = new Map<string | null, number>();

	for (const round of rounds) {
		if (typeof round.isPlayableAt !== "number") continue;

		const section = round.section ?? null;
		const latest = latestBySection.get(section);
		if (latest !== undefined && round.isPlayableAt < latest) return false;

		latestBySection.set(section, round.isPlayableAt);
	}

	return true;
}

/** Whether a team may replace its candidate times with `proposedAts` now, and if not, why; times it already has up are not rechecked. */
export function validateProposals({
	proposedAts,
	existingProposedAts,
	phase: currentPhase,
	isPlayableAt,
	now,
	setByOrganizer,
}: {
	/** The team's full new set of candidates. */
	proposedAts: Array<number>;
	/** The team's candidates currently on the board. */
	existingProposedAts: Array<number>;
	phase: Phase;
	isPlayableAt: number | null;
	now: number;
	setByOrganizer: boolean;
}): ProposalError | null {
	if (setByOrganizer) return "ORGANIZER_LOCKED";
	if (currentPhase === "CLOSED" || currentPhase === "NOT_OPEN") {
		return "NOT_OPEN";
	}
	if (proposedAts.length > LEAGUE_SCHEDULING.MAX_OPEN_PROPOSALS_PER_TEAM) {
		return "TOO_MANY";
	}

	const added = proposedAts.filter(
		(proposedAt) => !existingProposedAts.includes(proposedAt),
	);
	if (added.some((proposedAt) => proposedAt <= now)) return "IN_PAST";
	if (
		isPlayableAt !== null &&
		added.some((proposedAt) => proposedAt < isPlayableAt)
	) {
		return "BEFORE_PLAYABLE";
	}

	return null;
}

/** Whether a candidate time can still be picked: it has to be ahead. */
export function isAcceptableProposal({
	proposedAt,
	now,
}: {
	proposedAt: number;
	now: number;
}) {
	return proposedAt > now;
}

/** The span around the agreed time in which the set counts as live while somebody streams it. */
export function liveWindow(scheduledAt: number): TimeRange {
	return {
		startsAt: scheduledAt - LEAGUE_SCHEDULING.LIVE_BEFORE_SECONDS,
		endsAt: scheduledAt + LEAGUE_SCHEDULING.LIVE_AFTER_SECONDS,
	};
}

/** Whether the set is inside its live window and still undecided. */
export function isLive({
	scheduledAt,
	hasWinner,
	now,
}: {
	scheduledAt: number;
	hasWinner: boolean;
	now: number;
}) {
	if (hasWinner) return false;

	const window = liveWindow(scheduledAt);

	return now >= window.startsAt && now < window.endsAt;
}

/** The span a scheduled set blocks on its players' schedules. */
export function busyBlock(scheduledAt: number): TimeRange {
	return {
		startsAt: scheduledAt,
		endsAt: scheduledAt + LEAGUE_SCHEDULING.SET_DURATION_SECONDS,
	};
}

/**
 * The span the availability panel covers: from the round becoming playable (or now, once it is) to
 * the next round becoming playable, a week when there is no next round or it opens no later.
 */
export function availabilityWindow({
	now,
	isPlayableAt,
	nextIsPlayableAt,
}: {
	now: number;
	isPlayableAt: number | null;
	nextIsPlayableAt: number | null;
}): TimeRange {
	const startsAt = Math.max(now, isPlayableAt ?? now);
	const endsAt =
		nextIsPlayableAt !== null && nextIsPlayableAt > startsAt
			? nextIsPlayableAt
			: startsAt + LEAGUE_SCHEDULING.DEFAULT_WINDOW_SECONDS;

	return { startsAt, endsAt };
}
