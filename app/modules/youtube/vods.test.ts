import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { mockFetch } from "~/utils/test-helpers";
import { findRecentLiveStreams } from "./vods";

vi.mock("./utils.server", () => ({
	getYoutubeApiKey: () => "test-key",
}));

let playlistResponse: Response;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
	const url = new URL(input.toString());

	if (url.pathname.endsWith("/playlistItems")) return playlistResponse;

	return Response.json({
		items: [
			{
				id: "ended",
				liveStreamingDetails: {
					actualStartTime: "2026-10-10T10:00:00Z",
					actualEndTime: "2026-10-10T14:00:00Z",
				},
				statistics: { viewCount: "321" },
			},
			{
				id: "live",
				liveStreamingDetails: { actualStartTime: "2026-10-10T15:00:00Z" },
				statistics: { viewCount: "5" },
			},
			{
				id: "upcoming",
				liveStreamingDetails: { scheduledStartTime: "2026-10-12T10:00:00Z" },
			},
			{ id: "upload", statistics: { viewCount: "1000" } },
		],
	});
});

describe("findRecentLiveStreams", () => {
	beforeEach(() => {
		mockFetch(fetchMock);
		fetchMock.mockClear();
		playlistResponse = Response.json({
			items: ["ended", "live", "upcoming", "upload"].map((videoId) => ({
				contentDetails: { videoId },
			})),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("returns the started live streams among the channel's uploads", async () => {
		expect(await findRecentLiveStreams("UCchannel1")).toEqual([
			{
				videoId: "ended",
				startedAt: new Date("2026-10-10T10:00:00Z"),
				endedAt: new Date("2026-10-10T14:00:00Z"),
				viewCount: 321,
			},
			{
				videoId: "live",
				startedAt: new Date("2026-10-10T15:00:00Z"),
				endedAt: null,
				viewCount: 5,
			},
		]);

		const playlistUrl = new URL(fetchMock.mock.calls[0][0].toString());
		// eslint-disable-next-line sendou/no-raw-search-params -- mocked YouTube API request
		expect(playlistUrl.searchParams.get("playlistId")).toBe("UUchannel1");
	});

	test("returns nothing for a channel without an uploads playlist", async () => {
		playlistResponse = new Response(null, { status: 404 });

		expect(await findRecentLiveStreams("UCchannel1")).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
