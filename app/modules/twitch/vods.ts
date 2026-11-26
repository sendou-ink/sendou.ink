import { addDays } from "date-fns";
import * as R from "remeda";
import * as v from "valibot";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { twitchFetch } from "./fetch";
import {
	type RawVideo,
	type UsersResponse,
	usersSchema,
	videosByIdSchema,
	videosSchema,
} from "./schemas";

const PARTNER_ARCHIVE_RETENTION_DAYS = 60;
const AFFILIATE_ARCHIVE_RETENTION_DAYS = 14;
/** Prime/Turbo users get 60 days too but the API does not tell them apart. */
const DEFAULT_ARCHIVE_RETENTION_DAYS = 7;
export const MAX_VIDEO_IDS_PER_REQUEST = 100;

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

/**
 * The videos of `ids` (at most 100) that still exist. Twitch leaves removed ones out, answering 404 when every one
 * of them is gone. Throws on a 429 rather than waiting for the rate limit to reset.
 */
export async function getVideosByIds(ids: string[]): Promise<RawVideo[]> {
	if (ids.length === 0) return [];
	if (ids.length > MAX_VIDEO_IDS_PER_REQUEST) {
		throw new Error(
			`At most ${MAX_VIDEO_IDS_PER_REQUEST} video IDs per request, got ${ids.length}`,
		);
	}

	const url = new URL("https://api.twitch.tv/helix/videos");
	for (const id of ids) {
		url.searchParams.append("id", id);
	}

	const res = await twitchFetch(url.toString(), {
		failOnRateLimit: true,
		allowNotFound: true,
	});
	if (res.status === 404) return [];

	const parsed = v.safeParse(videosByIdSchema, await res.json());
	if (!parsed.success) {
		throw new Error(
			`Twitch videos schema validation failed: ${v.summarize(parsed.issues)}`,
		);
	}

	return parsed.output.data;
}

/**
 * Database timestamp of the earliest moment Twitch might auto-delete an archive video created at `createdAt`:
 * Partners keep theirs for 60 days, Affiliates for 14 and everyone else for at least 7.
 */
export function archiveVideoCheckAfter({
	createdAt,
	broadcasterType,
}: {
	createdAt: Date;
	/** `broadcaster_type` of the Get Users response. */
	broadcasterType: string;
}) {
	const retentionDays = archiveRetentionDays(broadcasterType);

	return dateToDatabaseTimestamp(addDays(createdAt, retentionDays));
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

function archiveRetentionDays(broadcasterType: string) {
	switch (broadcasterType) {
		case "partner":
			return PARTNER_ARCHIVE_RETENTION_DAYS;
		case "affiliate":
			return AFFILIATE_ARCHIVE_RETENTION_DAYS;
		default:
			return DEFAULT_ARCHIVE_RETENTION_DAYS;
	}
}
