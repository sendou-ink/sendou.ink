import { addDays } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchVodFactory from "~/db/seed/factories/TournamentMatchVodFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { RefreshTournamentVodsRoutine } from "./refreshTournamentVods";

const { mockTwitchFetch } = vi.hoisted(() => ({
	mockTwitchFetch: vi.fn<typeof import("~/modules/twitch/fetch").twitchFetch>(),
}));

vi.mock("~/modules/twitch/fetch", () => ({
	twitchFetch: mockTwitchFetch,
}));

vi.mock("~/modules/twitch/utils.server", () => ({
	hasTwitchEnvVars: () => true,
}));

const users = UserFactory.pool();

let matchId: number;

describe("RefreshTournamentVodsRoutine", () => {
	beforeEach(async () => {
		mockTwitchFetch.mockReset();
		await users.create(2);
		const tournament = await TournamentFactory.createPlayed(
			{ authorId: users.id(1), minMembersPerTeam: 1 },
			{ teamRosters: [[users.id(1)], [users.id(2)]] },
		);
		matchId = tournament.matches[0].id;
	});

	test("deletes VoDs whose video is missing from the response", async () => {
		await createVods(["gone", "kept"]);
		answerWithVideos(["kept"]);

		await RefreshTournamentVodsRoutine.run();

		expect(await videoIdsLeft()).toEqual(["kept"]);
	});

	test("refreshes the view count and pushes the next check a day forward for videos still up", async () => {
		await createVods(["kept"]);
		answerWithVideos(["kept"], 1234);

		await RefreshTournamentVodsRoutine.run();

		const [vod] = await findAllVods();
		expect(vod.viewCount).toBe(1234);
		expect(vod.checkAfter).toBeGreaterThan(
			dateToDatabaseTimestamp(addDays(new Date(), 1)) - 60,
		);
	});

	test("deletes every requested VoD when Twitch answers 404", async () => {
		await createVods(["gone-1", "gone-2"]);
		mockTwitchFetch.mockResolvedValue(new Response(null, { status: 404 }));

		await RefreshTournamentVodsRoutine.run();

		expect(await videoIdsLeft()).toEqual([]);
	});

	test("deletes nothing when the API call fails", async () => {
		await createVods(["video"]);
		mockTwitchFetch.mockRejectedValue(new Error("Twitch API rate limited"));

		await RefreshTournamentVodsRoutine.run();

		expect(await findAllVods()).toMatchObject([
			{ platformVideoId: "video", checkAfter: 0 },
		]);
	});

	test("asks for the rate limit to fail the request instead of waiting it out", async () => {
		await createVods(["video"]);
		answerWithVideos(["video"]);

		await RefreshTournamentVodsRoutine.run();

		expect(mockTwitchFetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ failOnRateLimit: true }),
		);
	});

	test("keeps the VoDs of a failed batch while saving the batches before it", async () => {
		await createVods(videoIds(150));
		mockTwitchFetch
			.mockResolvedValueOnce(videosResponse([]))
			.mockRejectedValueOnce(new Error("Twitch API down"));

		await RefreshTournamentVodsRoutine.run();

		expect(await findAllVods()).toHaveLength(50);
	});

	test("looks up 100 videos per request, a video covering several matches once", async () => {
		await createVods(videoIds(150));
		await TournamentMatchVodFactory.create({
			matchId,
			platformVideoId: "video-0",
		});
		answerWithVideos([]);

		await RefreshTournamentVodsRoutine.run();

		expect(requestedIdsPerCall().map((ids) => ids.length)).toEqual([100, 50]);
		expect(new Set(requestedIdsPerCall().flat()).size).toBe(150);
	});

	test("makes at most 5 requests per run", async () => {
		await createVods(videoIds(550));
		answerWithVideos([]);

		await RefreshTournamentVodsRoutine.run();

		expect(mockTwitchFetch).toHaveBeenCalledTimes(5);
		expect(await findAllVods()).toHaveLength(50);
	});

	test("skips videos not due a check and YouTube VoDs", async () => {
		await TournamentMatchVodFactory.create({
			matchId,
			platformVideoId: "not-due",
			checkAfter: dateToDatabaseTimestamp(addDays(new Date(), 3)),
		});
		await TournamentMatchVodFactory.create({
			matchId,
			platform: "YOUTUBE",
			platformVideoId: "youtube",
			checkAfter: null,
		});

		await RefreshTournamentVodsRoutine.run();

		expect(mockTwitchFetch).not.toHaveBeenCalled();
		expect(await videoIdsLeft()).toEqual(["not-due", "youtube"]);
	});
});

function videoIds(count: number) {
	return Array.from({ length: count }, (_, i) => `video-${i}`);
}

function createVods(platformVideoIds: string[]) {
	return TournamentMatchVodFactory.createMany(
		platformVideoIds.length,
		(index) => ({ matchId, platformVideoId: platformVideoIds[index] }),
	);
}

function answerWithVideos(foundVideoIds: string[], viewCount = 0) {
	mockTwitchFetch.mockImplementation(async () =>
		videosResponse(foundVideoIds, viewCount),
	);
}

function videosResponse(foundVideoIds: string[], viewCount = 0) {
	return new Response(
		JSON.stringify({
			data: foundVideoIds.map((id) => ({
				id,
				created_at: new Date().toISOString(),
				duration: "1h0m0s",
				view_count: viewCount,
			})),
			pagination: {},
		}),
	);
}

function requestedIdsPerCall() {
	return mockTwitchFetch.mock.calls.map(([url]) =>
		// biome-ignore lint/plugin: outgoing Twitch API call
		new URL(url).searchParams.getAll("id"),
	);
}

function findAllVods() {
	return db.selectFrom("TournamentMatchVod").selectAll().execute();
}

async function videoIdsLeft() {
	return (await findAllVods())
		.map((vod) => vod.platformVideoId)
		.sort((a, b) => a.localeCompare(b));
}
