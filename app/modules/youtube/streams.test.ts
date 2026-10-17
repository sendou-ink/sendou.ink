import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
	vi,
} from "bun:test";
import { logger } from "~/utils/logger";
import { mockFetch } from "~/utils/test-helpers";

vi.mock("./utils.server", () => ({
	getYoutubeApiKey: () => "test-key",
}));

const TAGGED_TITLE = "Splatoon 3 scrims #sendouink";

let YoutubeStreams: typeof import("./streams");
let freshImports = 0;
let searchResults: string[];
let videos: Map<string, VideoOptions>;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
	const url = new URL(input.toString());

	if (url.pathname.endsWith("/search")) {
		return Response.json({
			items: searchResults.map((videoId) => ({ id: { videoId } })),
		});
	}

	// eslint-disable-next-line sendou/no-raw-search-params -- mocked YouTube API request
	const ids = url.searchParams.get("id")?.split(",") ?? [];
	return Response.json({
		items: ids.flatMap((id) => {
			const video = videos.get(id);
			return video ? [rawVideo(id, video)] : [];
		}),
	});
});

describe("getLiveStreams", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		setSystemTime(new Date("2026-10-10T12:00:00Z"));
		mockFetch(fetchMock);
		vi.spyOn(logger, "error").mockImplementation(() => {});
		fetchMock.mockClear();
		searchResults = [];
		videos = new Map();

		// fresh modules, the tracked streams and the spent quota are module state
		freshImports++;
		const freshQuota = await import(`./quota?fresh=${freshImports}`);
		vi.mock("./quota", () => freshQuota);
		YoutubeStreams = await import(`./streams?fresh=${freshImports}`);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("finds a stream by search, tracks its viewers and drops it once ended", async () => {
		searchResults = ["video1"];
		videos.set("video1", { channelId: "channel1", viewers: 12 });

		expect(await getLiveStreams()).toEqual([
			{
				channelId: "channel1",
				videoId: "video1",
				viewerCount: 12,
				thumbnailUrl: "https://i.ytimg.com/vi/video1/hqdefault_live.jpg",
			},
		]);

		searchResults = [];
		videos.set("video1", { channelId: "channel1", viewers: 30 });
		advanceMinutes(2);

		expect(await getLiveStreams()).toMatchObject([{ viewerCount: 30 }]);
		expect(searchCallCount()).toBe(1);

		videos.set("video1", { channelId: "channel1", ended: true });
		advanceMinutes(2);

		expect(await getLiveStreams()).toEqual([]);

		fetchMock.mockClear();
		advanceMinutes(2);

		expect(await getLiveStreams()).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("searches again once the interval has passed", async () => {
		await getLiveStreams();
		advanceMinutes(8);
		await getLiveStreams();

		expect(searchCallCount()).toBe(1);

		advanceMinutes(2);
		searchResults = ["video1"];
		videos.set("video1", { channelId: "channel1" });

		expect(await getLiveStreams()).toHaveLength(1);
		expect(searchCallCount()).toBe(2);
	});

	test.each([
		{
			why: "tag missing from title and description",
			video: { channelId: "channel1", title: "Splatoon 3 scrims" },
		},
		{
			why: "upcoming stream",
			video: { channelId: "channel1", liveBroadcastContent: "upcoming" },
		},
		{
			why: "deleted video",
			video: null,
		},
	])(
		"leaves out a search result that isn't a tagged live stream: $why",
		async ({ video }) => {
			searchResults = ["video1"];
			if (video) videos.set("video1", video);

			expect(await getLiveStreams()).toEqual([]);
		},
	);

	test("accepts the tag in the description", async () => {
		searchResults = ["video1"];
		videos.set("video1", {
			channelId: "channel1",
			title: "Splatoon 3 scrims",
			description: "Come watch! #SendouInk",
		});

		expect(await getLiveStreams()).toHaveLength(1);
	});

	test("keeps only the most watched stream of a channel", async () => {
		searchResults = ["video1", "video2"];
		videos.set("video1", { channelId: "channel1", viewers: 5 });
		videos.set("video2", { channelId: "channel1", viewers: 50 });

		expect(await getLiveStreams()).toMatchObject([{ videoId: "video2" }]);
	});

	test("stops searching when the daily quota runs low and resumes after Pacific midnight", async () => {
		for (let i = 0; i < 100; i++) {
			await getLiveStreams({ searchIntervalMinutes: 0 });
		}

		expect(searchCallCount()).toBe(90);

		setSystemTime(new Date("2026-10-11T06:59:00Z"));
		await getLiveStreams({ searchIntervalMinutes: 0 });
		expect(searchCallCount()).toBe(90);

		setSystemTime(new Date("2026-10-11T07:00:00Z"));
		await getLiveStreams({ searchIntervalMinutes: 0 });
		expect(searchCallCount()).toBe(91);
	});

	test("keeps tracking found streams when search fails", async () => {
		searchResults = ["video1"];
		videos.set("video1", { channelId: "channel1" });
		await getLiveStreams();

		fetchMock.mockImplementationOnce(
			async () => new Response(null, { status: 403 }),
		);
		advanceMinutes(10);

		expect(await getLiveStreams()).toHaveLength(1);
	});
});

interface VideoOptions {
	channelId: string;
	title?: string;
	description?: string;
	liveBroadcastContent?: string;
	viewers?: number;
	ended?: boolean;
}

function getLiveStreams({ searchIntervalMinutes = 10 } = {}) {
	return YoutubeStreams.getLiveStreams({ searchIntervalMinutes });
}

function advanceMinutes(minutes: number) {
	setSystemTime(Date.now() + minutes * 60_000);
}

function searchCallCount() {
	return fetchMock.mock.calls.filter(([input]) =>
		input.toString().includes("/search"),
	).length;
}

function rawVideo(id: string, video: VideoOptions) {
	return {
		id,
		snippet: {
			channelId: video.channelId,
			title: video.title ?? TAGGED_TITLE,
			description: video.description ?? "",
			liveBroadcastContent:
				video.liveBroadcastContent ?? (video.ended ? "none" : "live"),
			thumbnails: {
				high: { url: `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg` },
			},
		},
		liveStreamingDetails: {
			actualEndTime: video.ended ? "2026-10-10T12:30:00Z" : undefined,
			concurrentViewers: video.ended ? undefined : String(video.viewers ?? 0),
		},
	};
}
