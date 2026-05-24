import { format, isWeekend } from "date-fns";
import * as R from "remeda";
import type { Tables } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { LUTI_DIVS, SCRIM_TRACKING_AUTO_LOCK_HOURS } from "../scrims-constants";
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
	return `SC${postId % 10}`;
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
 * When the post has a time range (rangeEnd is set), returns the accepted request's specific time if available.
 * Otherwise returns the post's start time.
 */
export function getStartTime(post: ScrimPost): number {
	const acceptedRequest = post.requests.find((r) => r.isAccepted);
	return acceptedRequest?.at ?? post.at;
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

	const timeFilters = isWeekend(databaseTimestampToDate(post.at))
		? filters.weekendTimes
		: filters.weekdayTimes;

	if (timeFilters) {
		const startDate = databaseTimestampToDate(post.at);
		const endDate = post.rangeEnd
			? databaseTimestampToDate(post.rangeEnd)
			: startDate;

		const startTimeString = format(startDate, "HH:mm");
		const endTimeString = format(endDate, "HH:mm");

		const hasOverlap =
			startTimeString <= timeFilters.end && endTimeString >= timeFilters.start;

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
 * the most recently updated submitted map list). Returns false when no map
 * list has been submitted yet (tracking is not active).
 */
export function isTrackingLocked(
	maps: Pick<Tables["ScrimMap"], "reportedAt">[] = [],
	mapLists: Pick<Tables["ScrimMapList"], "updatedAt">[] = [],
	now: number = Date.now(),
): boolean {
	const latestReported = R.firstBy(
		maps.filter((m) => m.reportedAt !== null),
		[(m) => m.reportedAt!, "desc"],
	);
	const latestList = R.firstBy(mapLists, [(l) => l.updatedAt, "desc"]);

	const referenceSeconds =
		latestReported?.reportedAt ?? latestList?.updatedAt ?? null;
	if (referenceSeconds === null) return false;

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
