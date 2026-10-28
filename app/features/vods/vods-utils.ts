import { databaseTimestampToDate } from "../../utils/dates";
import { HOURS_MINUTES_SECONDS_REGEX } from "./vods-schemas";
import type { VideoBeingAdded, Vod } from "./vods-types";

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];
const YOUTUBE_VIDEO_ID_PATH_PREFIXES = ["live", "embed"];

export function vodToVideoBeingAdded(vod: Vod): VideoBeingAdded {
	const dateObj = databaseTimestampToDate(vod.youtubePublishedAt);

	return {
		title: vod.title,
		youtubeUrl: youtubeIdToYoutubeUrl(vod.youtubeId),
		date: {
			day: dateObj.getUTCDate(),
			month: dateObj.getUTCMonth(),
			year: dateObj.getUTCFullYear(),
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

export function extractYoutubeIdFromVideoUrl(url: string): string | null {
	const parsed = parseUrl(url.trim());
	if (!parsed) return null;

	const pathSegments = parsed.pathname.split("/").filter(Boolean);

	if (parsed.hostname === "youtu.be") {
		return pathSegments[0] || null;
	}

	if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return null;

	if (pathSegments[0] === "watch") {
		// biome-ignore lint/plugin: user-pasted YouTube URL
		return parsed.searchParams.get("v") || null;
	}

	if (
		pathSegments.length >= 2 &&
		YOUTUBE_VIDEO_ID_PATH_PREFIXES.includes(pathSegments[0])
	) {
		return pathSegments[1];
	}

	return null;
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

export function generateYoutubeTimestamps(
	matches: Vod["matches"],
	type: Vod["type"],
	resolvers: {
		weaponName: (weaponId: number) => string;
		stageName: (stageId: number) => string;
		modeName: (mode: string) => string;
	},
) {
	const lines: string[] = [];

	if (matches.length > 0 && matches[0].startsAt > 0) {
		lines.push("0:00 Intro");
	}

	const isCast = type === "CAST";

	for (const match of matches) {
		const timestamp = secondsToHoursMinutesSecondString(match.startsAt);
		const stage = resolvers.stageName(match.stageId);
		const mode = resolvers.modeName(match.mode);

		const weaponPart =
			!isCast && match.weapons.length === 1
				? `${resolvers.weaponName(match.weapons[0])} / `
				: "";

		lines.push(`${timestamp} ${weaponPart}${mode} ${stage}`);
	}

	return lines.join("\n");
}

function parseUrl(url: string) {
	try {
		return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
	} catch {
		return null;
	}
}
