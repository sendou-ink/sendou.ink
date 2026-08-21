import * as R from "remeda";
import * as v from "valibot";
import { twitchFetch } from "./fetch";
import {
	type RawVideo,
	type UsersResponse,
	usersSchema,
	videosSchema,
} from "./schemas";

export async function getUsersByLogin(
	logins: string[],
): Promise<UsersResponse["data"]> {
	if (logins.length === 0) return [];

	const results: UsersResponse["data"] = [];

	for (const batch of R.chunk(logins, 100)) {
		const params = batch.map((l) => `login=${encodeURIComponent(l)}`).join("&");

		const res = await twitchFetch(
			`https://api.twitch.tv/helix/users?${params}`,
		);

		const parsed = v.safeParse(usersSchema, await res.json());
		if (!parsed.success) {
			throw new Error(
				`Twitch users schema validation failed: ${v.summarize(parsed.issues)}`,
			);
		}

		results.push(...parsed.output.data);
	}

	return results;
}

export async function getArchiveVideos(userId: string): Promise<RawVideo[]> {
	const results: RawVideo[] = [];
	let cursor: string | undefined;

	while (true) {
		const url = new URL("https://api.twitch.tv/helix/videos");
		url.searchParams.set("user_id", userId);
		url.searchParams.set("type", "archive");
		url.searchParams.set("first", "100");
		if (cursor) {
			url.searchParams.set("after", cursor);
		}

		const res = await twitchFetch(url.toString());

		const parsed = v.safeParse(videosSchema, await res.json());
		if (!parsed.success) {
			throw new Error(
				`Twitch videos schema validation failed: ${v.summarize(parsed.issues)}`,
			);
		}

		results.push(...parsed.output.data);

		if (!parsed.output.pagination.cursor) break;
		cursor = parsed.output.pagination.cursor;
	}

	return results;
}

const DURATION_REGEX = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;

export function parseTwitchDuration(duration: string): number {
	const match = DURATION_REGEX.exec(duration);
	if (!match) return 0;

	const hours = Number(match[1] ?? 0);
	const minutes = Number(match[2] ?? 0);
	const seconds = Number(match[3] ?? 0);

	return hours * 3600 + minutes * 60 + seconds;
}
