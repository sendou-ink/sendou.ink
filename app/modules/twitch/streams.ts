import { cachified } from "@epic-web/cachified";
import * as v from "valibot";
import { cache } from "~/utils/cache.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import { twitchFetch } from "./fetch";
import { type RawStream, type StreamsResponse, streamsSchema } from "./schemas";

export async function getStreams() {
	try {
		const result = await cachified({
			key: "twitch-streams",
			cache,
			ttl: 1000 * 60 * 2,
			staleWhileRevalidate: 1000 * 60 * 5 * 2,
			async getFreshValue() {
				return (await getAllStreams())
					.map(mapRawStream)
					.sort((a, b) => b.viewerCount - a.viewerCount);
			},
		});

		return result;
	} catch (e) {
		logger.error(e);
		return [];
	}
}

function mapRawStream(stream: RawStream) {
	return {
		thumbnailUrl: stream.thumbnail_url,
		twitchUserName: stream.user_login.toLowerCase(),
		viewerCount: stream.viewer_count,
	};
}

const SPLATOON_3_TWITCH_GAME_ID = "1158884259";
async function getAllStreams() {
	if (process.env.NODE_ENV === "test" || IS_E2E_TEST_RUN) return [];

	const result: RawStream[] = [];

	let cursor: string | undefined;
	let count = 0;
	while (true) {
		if (count === 50) {
			throw new Error("Stuck getting streams");
		}
		const { data, pagination } = await getStreamsChunk(cursor);

		result.push(
			...data.filter(
				(stream) =>
					!result.some(
						(existingStream) => existingStream.user_id === stream.user_id,
					),
			),
		);
		if (!pagination.cursor) {
			return result;
		}

		cursor = pagination.cursor;
		count++;
	}
}

async function getStreamsChunk(cursor?: string): Promise<StreamsResponse> {
	const res = await twitchFetch(
		`https://api.twitch.tv/helix/streams?game_id=${SPLATOON_3_TWITCH_GAME_ID}&first=100&after=${
			cursor ?? ""
		}`,
	);

	const parsed = v.safeParse(streamsSchema, await res.json());
	if (!parsed.success) {
		throw new Error(v.summarize(parsed.issues));
	}

	return parsed.output;
}
