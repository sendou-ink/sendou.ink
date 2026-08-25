import { format, isWeekend } from "date-fns";
import * as R from "remeda";
import type { Tables } from "~/db/tables";
import { AVAILABILITY } from "~/features/availability/availability-constants";
import type {
	MemberAvailability,
	PlayableWindowTier,
	TimeRange,
} from "~/features/availability/availability-types";
import * as Availability from "~/features/availability/core/Availability";
import { databaseTimestampToDate } from "~/utils/dates";
import { logger } from "~/utils/logger";
import {
	LUTI_DIVS,
	RANGE_END_MINUTES,
	type RangeEndOption,
	SCRIM,
	SCRIM_TRACKING_AUTO_LOCK_HOURS,
} from "../scrims-constants";
import type { ScrimFilters, ScrimPost, ScrimSide } from "../scrims-types";

/** Returns true if the original poster has accepted any of the requests. */
export function isAccepted(post: ScrimPost) {
	return post.requests.some((request) => request.isAccepted);
}

/** Returns true if the user is participating in the scrim, either in the original post users list or the request. */
export function isParticipating(post: ScrimPost, userId: number) {
	return (
		post.requests.some((request) =>
			request.users.some((user) => user.id === userId),
		) || post.users.some((user) => user.id === userId)
	);
}

export function resolvePoolCode(postId: number) {
	return `SC${(postId % 9) + 1}`;
}

/**
 * Returns an array of participant IDs from the given post object that is accepted (scrim page exists).
 */
export function participantIdsListFromAccepted(post: ScrimPost) {
	const acceptedRequest = post.requests.find((r) => r.isAccepted);

	if (!acceptedRequest) {
		logger.warn(
			`Scrim post ${post.id} has no accepted request, returning only post users.`,
		);
	}

	return post.users
		.map((u) => u.id)
		.concat(acceptedRequest?.users.map((u) => u.id) ?? []);
}

/**
 * Returns the actual start time of the scrim.
 * When the post has a time range (rangeEndsAt is set), returns the accepted request's specific time if available.
 * Otherwise returns the post's start time.
 */
export function getStartTime(post: ScrimPost): number {
	const acceptedRequest = post.requests.find((r) => r.isAccepted);
	return acceptedRequest?.startsAt ?? post.startsAt;
}

/**
 * Returns a display name for a scrim side: the team name when set,
 * otherwise "{ownerUsername}'s pickup".
 */
export function sideDisplayName(side: {
	team: { name: string } | null;
	users: Array<{ username: string; isOwner: boolean }>;
}): string {
	if (side.team) return side.team.name;
	const owner = side.users.find((u) => u.isOwner) ?? side.users[0];
	return `${owner.username}'s pickup`;
}

export function applyFilters(post: ScrimPost, filters: ScrimFilters): boolean {
	const hasMinFilter = filters.divs?.min !== null;
	const hasMaxFilter = filters.divs?.max !== null;
	if (filters.divs && (hasMinFilter || hasMaxFilter) && post.divs) {
		const postMinIndex = LUTI_DIVS.indexOf(post.divs.min);
		const postMaxIndex = LUTI_DIVS.indexOf(post.divs.max);

		if (hasMinFilter && hasMaxFilter) {
			const filterMinIndex = LUTI_DIVS.indexOf(filters.divs.min!);
			const filterMaxIndex = LUTI_DIVS.indexOf(filters.divs.max!);

			if (postMinIndex < filterMaxIndex || postMaxIndex > filterMinIndex) {
				return false;
			}
		} else if (hasMinFilter) {
			const filterMinIndex = LUTI_DIVS.indexOf(filters.divs.min!);
			if (postMaxIndex > filterMinIndex) {
				return false;
			}
		} else if (hasMaxFilter) {
			const filterMaxIndex = LUTI_DIVS.indexOf(filters.divs.max!);
			if (postMinIndex < filterMaxIndex) {
				return false;
			}
		}
	}

	const timeFilters = isWeekend(databaseTimestampToDate(post.startsAt))
		? filters.weekendTimes
		: filters.weekdayTimes;

	if (timeFilters) {
		const startDate = databaseTimestampToDate(post.startsAt);
		const endDate = post.rangeEndsAt
			? databaseTimestampToDate(post.rangeEndsAt)
			: startDate;

		const startTimeString = format(startDate, "HH:mm");
		const endTimeString = format(endDate, "HH:mm");

		const postSegments = timeRangeToSegments(startTimeString, endTimeString);
		const filterSegments = timeRangeToSegments(
			timeFilters.start,
			timeFilters.end,
		);

		const hasOverlap = postSegments.some((postSegment) =>
			filterSegments.some(
				(filterSegment) =>
					postSegment.start <= filterSegment.end &&
					postSegment.end >= filterSegment.start,
			),
		);

		if (!hasOverlap) {
			return false;
		}
	}

	return true;
}

export function defaultFilters(): ScrimFilters {
	return {
		weekdayTimes: null,
		weekendTimes: null,
		divs: null,
	};
}

export function filtersAreDefault(filters: ScrimFilters): boolean {
	return R.isShallowEqual(filters, defaultFilters());
}

/**
 * Returns the side ("ALPHA" or "BRAVO") the user belongs to in the scrim, or
 * null when the user is not part of the accepted pairing.
 *
 * The post's own users list is treated as the ALPHA side; the accepted
 * request's users list is treated as the BRAVO side.
 */
export function sideOfUser(post: ScrimPost, userId: number): ScrimSide | null {
	if (post.users.some((u) => u.id === userId)) return "ALPHA";

	const acceptedRequest = post.requests.find((r) => r.isAccepted);
	if (acceptedRequest?.users.some((u) => u.id === userId)) return "BRAVO";

	return null;
}

/**
 * Returns true when map-by-map tracking is locked: the auto-lock window has
 * elapsed since the last activity (most recent reported map, falling back to
 * the most recently updated submitted map list). Activity happening before the
 * scrim starts does not begin the window, it only starts running once the
 * scrim is under way. Returns false when no map list has been submitted yet
 * (tracking is not active).
 */
export function isTrackingLocked({
	startTime,
	maps = [],
	mapLists = [],
	now = Date.now(),
}: {
	startTime: number;
	maps?: Pick<Tables["ScrimMap"], "reportedAt">[];
	mapLists?: Pick<Tables["ScrimMapList"], "updatedAt">[];
	now?: number;
}): boolean {
	const latestReported = R.firstBy(
		maps.filter((m) => m.reportedAt !== null),
		[(m) => m.reportedAt!, "desc"],
	);
	const latestList = R.firstBy(mapLists, [(l) => l.updatedAt, "desc"]);

	const latestActivitySeconds =
		latestReported?.reportedAt ?? latestList?.updatedAt ?? null;
	if (latestActivitySeconds === null) return false;

	const referenceSeconds = Math.max(latestActivitySeconds, startTime);

	const elapsedHours = (now - referenceSeconds * 1000) / (60 * 60 * 1000);

	return elapsedHours > SCRIM_TRACKING_AUTO_LOCK_HOURS;
}

/**
 * Returns the next 0-based map index to be inserted given a list of existing
 * maps. Existing maps need not be in any particular order.
 */
export function nextMapIndex(
	maps: Pick<Tables["ScrimMap"], "index">[],
): number {
	const latest = R.firstBy(maps, [(m) => m.index, "desc"]);
	return latest ? latest.index + 1 : 0;
}

/**
 * Returns the most recently reported map (by `index`), or undefined if no map
 * has been reported yet.
 */
export function lastReportedMap<
	T extends Pick<Tables["ScrimMap"], "index" | "reportedAt">,
>(maps: T[]): T | undefined {
	return R.firstBy(
		maps.filter((m) => m.reportedAt !== null),
		[(m) => m.index, "desc"],
	);
}

export interface PickableSlot extends TimeRange {
	tier: PlayableWindowTier;
	/** Members free for the whole slot. */
	userIds: Array<number>;
	/** The part of the slot the whole team is free for, when that is only part of it. */
	fullSpan: TimeRange | null;
	/** What picking the slot fills the post's start and start-time flexibility with. */
	pick: { startsAt: number; rangeEnd: RangeEndOption | null };
}

/**
 * The roster's shared free time as the slots a scrim post can be picked from:
 * maximal spans where the team is at most one player short, the `ONE_SHORT`
 * ones being the "grab a sub" case.
 * be given.
 */
export function pickableSlots({
	members,
	minPlayers,
}: {
	members: Array<MemberAvailability>;
	minPlayers: number;
}): Array<PickableSlot> {
	const spansFreeFor = (playerCount: number) =>
		Availability.playableWindows({
			members,
			minPlayers: playerCount,
		}).filter((window) => window.tier === "FULL");

	const fullSpans = spansFreeFor(minPlayers);

	return spansFreeFor(Math.max(1, minPlayers - 1)).map((slot) => {
		const fullSpan = fullSpans.find(
			(span) => span.startsAt >= slot.startsAt && span.endsAt <= slot.endsAt,
		);
		const wholeSlotIsFull =
			fullSpan?.startsAt === slot.startsAt && fullSpan?.endsAt === slot.endsAt;

		return {
			startsAt: slot.startsAt,
			endsAt: slot.endsAt,
			userIds: slot.userIds,
			tier: wholeSlotIsFull ? "FULL" : "ONE_SHORT",
			fullSpan: wholeSlotIsFull ? null : (fullSpan ?? null),
			pick: startPick({ slot, at: fullSpan?.startsAt ?? slot.startsAt }),
		};
	});
}

/** Splits a "HH:mm" time range into segments, breaking a range that crosses midnight (e.g. 23:00 -> 01:00) into two. */
function timeRangeToSegments(start: string, end: string) {
	return end < start
		? [
				{ start, end: "24:00" },
				{ start: "00:00", end },
			]
		: [{ start, end }];
}

function startPick({ slot, at }: { slot: TimeRange; at: number }) {
	const lastStartsAt = slot.endsAt - AVAILABILITY.MIN_WINDOW_MINUTES * 60;
	const startsAt = R.clamp(at, {
		min: slot.startsAt,
		max: Math.max(slot.startsAt, lastStartsAt),
	});
	const flexMinutes =
		Math.min(lastStartsAt - startsAt, SCRIM.MAX_TIME_RANGE_MS / 1000) / 60;

	return { startsAt, rangeEnd: longestRangeEndWithin(flexMinutes) };
}

function longestRangeEndWithin(minutes: number): RangeEndOption | null {
	const fitting = R.entries(RANGE_END_MINUTES).filter(
		([, optionMinutes]) => optionMinutes <= minutes,
	);

	return (
		R.firstBy(fitting, [([, optionMinutes]) => optionMinutes, "desc"])?.[0] ??
		null
	);
}
