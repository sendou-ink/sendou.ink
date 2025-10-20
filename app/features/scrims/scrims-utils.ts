import { differenceInMinutes } from "date-fns";
import * as R from "remeda";
import { databaseTimestampToDate } from "~/utils/dates";
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
		if (post.users.some((user) => user.id === userId)) {
			return "OWNED";
		}

		return "NEUTRAL";
	});

	return {
		owned: grouped.OWNED ?? [],
		neutral: grouped.NEUTRAL ?? [],
	};
}

export const parseLutiDiv = (div: number): LutiDiv => {
	if (div === 0) return "X";

	return String(div) as LutiDiv;
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
