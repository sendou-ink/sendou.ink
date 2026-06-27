import { differenceInMinutes } from "date-fns";
import * as R from "remeda";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { databaseTimestampToDate } from "~/utils/dates";
import * as Scrim from "./core/Scrim";
import { LUTI_DIVS } from "./scrims-constants";
import type { LutiDiv, ScrimPost } from "./scrims-types";

export const getPostRequestCensor =
	(userId: number) =>
	(post: ScrimPost): ScrimPost => {
		return {
			...post,
			requests: post.requests.filter((request) => {
				const isOwnPost = post.users.some((user) => user.id === userId);
				if (isOwnPost) {
					return true;
				}

				const isOwnRequest = request.users.some((user) => user.id === userId);
				return isOwnRequest;
			}),
		};
	};

export function dividePosts(posts: Array<ScrimPost>, userId?: number) {
	const grouped = R.groupBy(posts, (post) => {
		const isAccepted = post.requests.some((request) => request.isAccepted);
		const isParticipating = userId
			? Scrim.isParticipating(post, userId)
			: false;

		if (isAccepted && isParticipating) {
			return "BOOKED";
		}

		if (post.users.some((user) => user.id === userId)) {
			return "OWNED";
		}

		return "NEUTRAL";
	});

	return {
		owned: grouped.OWNED ?? [],
		neutral: grouped.NEUTRAL ?? [],
		booked: grouped.BOOKED ?? [],
	};
}

export const parseLutiDiv = (div: number): LutiDiv => {
	if (div === 0) return "X";

	return String(div) as LutiDiv;
};

/**
 * Extracts the LUTI division (e.g. `"X"`, `"2"`) from a tournament name such as
 * "LUTI: Season 15 - Division 2". Returns `null` if no valid division token is found.
 */
export const parseLutiDivFromName = (name: string): LutiDiv | null => {
	const match = name.match(/\bdiv(?:ision)?\.?\s*(X|11|10|[1-9])\b/i);
	if (!match) return null;

	const token = match[1].toUpperCase();
	return (LUTI_DIVS as readonly string[]).includes(token)
		? (token as LutiDiv)
		: null;
};

export const serializeLutiDiv = (div: LutiDiv): number => {
	if (div === "X") return 0;

	return Number(div);
};

export function generateTimeOptions(startDate: Date, endDate: Date): number[] {
	const timestamps = new Set<number>();

	const clearSubMinutes = (date: Date) => {
		const cleared = new Date(date);
		cleared.setSeconds(0, 0);
		return cleared;
	};

	timestamps.add(clearSubMinutes(startDate).getTime());
	timestamps.add(clearSubMinutes(endDate).getTime());

	const currentDate = clearSubMinutes(startDate);
	const minutes = currentDate.getMinutes();

	if (minutes > 0 && minutes < 30) {
		currentDate.setMinutes(30, 0, 0);
	} else if (minutes > 30) {
		currentDate.setHours(currentDate.getHours() + 1, 0, 0, 0);
	}

	while (currentDate <= endDate) {
		timestamps.add(currentDate.getTime());
		currentDate.setMinutes(currentDate.getMinutes() + 30);
	}

	return Array.from(timestamps).sort((a, b) => a - b);
}

export function parseMapPoolInput(input: string): MapPool | null {
	const serialized = extractSerializedPool(input);
	if (!serialized) return null;

	try {
		const pool = new MapPool(serialized);
		if (pool.isEmpty()) return null;
		return pool;
	} catch {
		return null;
	}
}

export function formatFlexTimeDisplay(
	startTimestamp: number,
	endTimestamp: number,
): string | null {
	const totalMinutes = differenceInMinutes(
		databaseTimestampToDate(endTimestamp),
		databaseTimestampToDate(startTimestamp),
	);
	const hours = Math.floor(totalMinutes / 60);
	const remainingMinutes = totalMinutes % 60;

	if (hours > 0 && remainingMinutes > 0) {
		return `+${hours}h ${remainingMinutes}m`;
	}
	if (hours > 0) {
		return `+${hours}h`;
	}
	if (totalMinutes > 0) {
		return `+${totalMinutes}m`;
	}

	return null;
}

function extractSerializedPool(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (trimmed.includes("://")) {
		try {
			const url = new URL(trimmed);
			return url.searchParams.get("pool");
		} catch {
			return null;
		}
	}

	if (trimmed.includes("pool=")) {
		return new URLSearchParams(trimmed).get("pool");
	}

	return trimmed;
}
