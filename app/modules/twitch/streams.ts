import { cachified } from "@epic-web/cachified";
import { cache } from "~/utils/cache.server";
import type { Unpacked } from "~/utils/types";
import { type RawStream, type StreamsResponse, streamsSchema } from "./schemas";
import { getToken, purgeCachedToken } from "./token";
import { getTwitchEnvVars } from "./utils";

// const STREAMS_MOCK = [
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_777_jared-{width}x{height}.jpg",
//     twitchUserName: "777_jared",
//     viewerCount: 129,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_ano_rta-{width}x{height}.jpg",
//     twitchUserName: "ano_rta",
//     viewerCount: 50,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_mikashita0104-{width}x{height}.jpg",
//     twitchUserName: "mikashita0104",
//     viewerCount: 49,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_veenam-{width}x{height}.jpg",
//     twitchUserName: "veenam",
//     viewerCount: 42,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_minijutopia-{width}x{height}.jpg",
//     twitchUserName: "minijutopia",
//     viewerCount: 25,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_liligravybread-{width}x{height}.jpg",
//     twitchUserName: "liligravybread",
//     viewerCount: 25,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_ajx_live-{width}x{height}.jpg",
//     twitchUserName: "ajx_live",
//     viewerCount: 19,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_yuzuki729-{width}x{height}.jpg",
//     twitchUserName: "yuzuki729",
//     viewerCount: 18,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_noname_nosplat-{width}x{height}.jpg",
//     twitchUserName: "noname_nosplat",
//     viewerCount: 14,
//   },
//   {
//     thumbnailUrl:
//       "https://static-cdn.jtvnw.net/previews-ttv/live_user_dosankoneet-{width}x{height}.jpg",
//     twitchUserName: "dosankoneet",
//     viewerCount: 13,
//   },
// ];

export async function getStreams() {
	try {
		const result = await cachified({
			key: "twitch-streams",
			cache,
			// 2 minutes
			ttl: 1000 * 60 * 2,
			// 10 minutes
			staleWhileRevalidate: 1000 * 60 * 5 * 2,
			async getFreshValue() {
				return (await getAllStreams())
					.map(mapRawStream)
					.sort((a, b) => b.viewerCount - a.viewerCount);
			},
		});

		return result;
	} catch (e) {
		console.error(e);
		return [];
	}
}

export type MappedStream = Unpacked<ReturnType<typeof mapRawStream>>;

function mapRawStream(stream: RawStream) {
	return {
		thumbnailUrl: stream.thumbnail_url,
		twitchUserName: stream.user_login.toLowerCase(),
		viewerCount: stream.viewer_count,
	};
}

const SPLATOON_3_TWITCH_GAME_ID = "1158884259";
async function getAllStreams() {
	if (process.env.NODE_ENV === "test") return [];

	const result: RawStream[] = [];

	let cursor: string | undefined = undefined;
	let count = 0;
	while (true) {
		if (count === 50) {
			throw new Error("Stuck getting streams");
		}
		const { data, pagination } = await getStreamsChunk({ cursor });

		result.push(
			// filter to ensure each streamer appears only once
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

export async function getStreamsChunk({
	isRetry = false,
	cursor,
}: {
	isRetry?: boolean;
	cursor?: string;
}): Promise<StreamsResponse> {
	const { TWITCH_CLIENT_ID } = getTwitchEnvVars();
	const token = await getToken();

	const res = await fetch(
		`https://api.twitch.tv/helix/streams?game_id=${SPLATOON_3_TWITCH_GAME_ID}&first=100&after=${
			cursor ?? ""
		}`,
		{
			headers: [
				["Authorization", `Bearer ${token}`],
				["Client-Id", TWITCH_CLIENT_ID],
			],
		},
	);

	if (res.status === 401 && !isRetry) {
		purgeCachedToken();
		return getStreamsChunk({ isRetry: true, cursor });
	}

	if (!res.ok) {
		throw new Error(
			`Getting Twitch token failed with status code: ${res.status}`,
		);
	}

	const parsed = streamsSchema.safeParse(await res.json());
	if (!parsed.success) {
		throw new Error(parsed.error.message);
	}

	return parsed.data;
}
