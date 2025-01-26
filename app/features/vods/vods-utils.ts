import type { User } from "~/db/types";
import { isAdmin } from "~/permissions";
import { databaseTimestampToDate } from "../../utils/dates";
import { HOURS_MINUTES_SECONDS_REGEX } from "./vods-schemas";
import type { VideoBeingAdded, Vod } from "./vods-types";

export function canAddVideo(args: { isVideoAdder: number | null }) {
	return args.isVideoAdder;
}

export function vodToVideoBeingAdded(vod: Vod): VideoBeingAdded {
	const dateObj = databaseTimestampToDate(vod.youtubeDate);

	return {
		title: vod.title,
		youtubeUrl: youtubeIdToYoutubeUrl(vod.youtubeId),
		date: {
			day: dateObj.getDate(),
			month: dateObj.getMonth(),
			year: dateObj.getFullYear(),
		},
		matches: vod.matches.map((match) => ({
			...match,
			startsAt: secondsToHoursMinutesSecondString(match.startsAt),
		})),
		type: vod.type,
		pov:
			typeof vod.pov === "string"
				? { type: "NAME", name: vod.pov }
				: vod.pov
					? {
							type: "USER",
							userId: vod.pov.id,
						}
					: undefined,
	};
}

export function canEditVideo({
	userId,
	submitterUserId,
	povUserId,
}: {
	userId?: User["id"];
	submitterUserId: User["id"];
	povUserId?: User["id"];
}) {
	if (!userId) return false;

	return (
		isAdmin({ id: userId }) ||
		userId === submitterUserId ||
		userId === povUserId
	);
}

export function extractYoutubeIdFromVideoUrl(url: string): string | null {
	const match = url.match(
		/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([^&\/\?]+)/,
	);
	return match ? match[1] : null;
}

export function secondsToHoursMinutesSecondString(seconds: number) {
	if (seconds < 0) {
		throw new Error("Negative number of seconds");
	}

	if (!Number.isInteger(seconds)) {
		throw new Error("Non-integer number of seconds");
	}

	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secondsLeft = seconds % 60;

	return `${hours ? `${hours}:` : ""}${hours && minutes < 10 ? `0${minutes}` : minutes}:${secondsLeft
		.toString()
		.padStart(2, "0")}`;
}

export function hoursMinutesSecondsStringToSeconds(
	hoursMinutesSecondsString: string,
) {
	if (!HOURS_MINUTES_SECONDS_REGEX.test(hoursMinutesSecondsString)) {
		throw new Error("Invalid time format. Expected format: HH:MM:SS");
	}

	const parts = hoursMinutesSecondsString
		.split(":")
		.map((part) => Number(part));
	const seconds = parts.pop() || 0;
	const minutes = parts.pop() || 0;
	const hours = parts.pop() || 0;

	return hours * 3600 + minutes * 60 + seconds;
}

export function youtubeIdToYoutubeUrl(youtubeId: string) {
	return `https://www.youtube.com/watch?v=${youtubeId}`;
}
