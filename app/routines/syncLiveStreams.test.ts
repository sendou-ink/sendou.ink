import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
	vi,
} from "bun:test";
import { add } from "date-fns";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { COMBINED_STREAMS_KEY } from "~/features/core/streams/streams.server";
import type { StreamAccount } from "~/features/live-streams/live-streams-constants";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import { testTournament } from "~/features/tournament-bracket/core/tests/test-utils";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { cache } from "~/utils/cache.server";
import { withUserId } from "~/utils/Test";
import { SyncLiveStreamsRoutine } from "./syncLiveStreams";

const mockGetStreams = vi.fn();
const mockGetYoutubeLiveStreams = vi.fn();

vi.mock("~/modules/twitch/streams", () => ({
	getStreams: mockGetStreams,
}));

vi.mock("~/modules/twitch/utils.server", () => ({
	hasTwitchEnvVars: () => true,
}));

vi.mock("~/modules/youtube/streams", () => ({
	getLiveStreams: mockGetYoutubeLiveStreams,
}));

vi.mock("~/modules/youtube/utils.server", () => ({
	hasYoutubeEnvVars: () => true,
}));

const users = UserFactory.pool();

const YOUTUBE_CHANNEL = "UCyoutuberChannelId000000";
const YOUTUBE_CASTER_CHANNEL = "UCcasterChannelId00000000";
const YOUTUBE_VIDEO_ID = "liveVideo01";

function findAllTournamentStreamers() {
	return db.selectFrom("TournamentStreamer").selectAll().execute();
}

function findAllLiveStreams() {
	return db.selectFrom("LiveStream").selectAll().execute();
}

/** A tournament the routine considers live: teams in the database (for members' stream accounts) and in the running tournaments registry. */
async function addRunningTournament({
	memberUserIds = [],
	castAccounts = [],
	droppedOut = false,
}: {
	memberUserIds?: number[];
	castAccounts?: StreamAccount[];
	droppedOut?: boolean;
} = {}) {
	const tournament = await TournamentFactory.create({ authorId: users.id(1) });

	if (memberUserIds.length > 0) {
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds,
		});

		if (droppedOut) {
			await withUserId(users.id(1), () =>
				TournamentTeamRepository.dropOut({
					tournamentTeamId: team.id,
					previewBracketIdxs: [],
				}),
			);
		}
	}

	RunningTournaments.clear();
	RunningTournaments.add(
		testTournament({
			ctx: {
				id: tournament.id,
				castAccounts: castAccounts.map((castAccount) => ({
					...castAccount,
					name: castAccount.account,
				})),
			},
		}),
	);

	return tournament;
}

let timeOffset = 0;

describe("syncLiveStreams tournament streamers", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		setSystemTime(
			add(new Date("2025-01-15T12:00:00Z"), { minutes: timeOffset }),
		);
		timeOffset += 31;
		RunningTournaments.clear();
		mockGetStreams.mockReset();
		mockGetStreams.mockResolvedValue([]);
		mockGetYoutubeLiveStreams.mockReset();
		mockGetYoutubeLiveStreams.mockResolvedValue([]);
		await users.create(1);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("populates LiveStream table with streams", async () => {
		mockGetStreams.mockResolvedValue([
			{
				twitchUserName: "streamer_one",
				viewerCount: 100,
				thumbnailUrl: "https://thumb.jpg",
			},
			{
				twitchUserName: "streamer_two",
				viewerCount: 50,
				thumbnailUrl: "https://thumb2.jpg",
			},
		]);

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllLiveStreams();
		expect(rows).toHaveLength(2);
		expect(
			rows.map((r) => r.account).sort((a, b) => a.localeCompare(b)),
		).toEqual(["streamer_one", "streamer_two"]);
		expect(rows.every((r) => r.platform === "TWITCH")).toBe(true);
		expect(rows[0].viewerCount).toBe(100);
	});

	test("inserts streamer rows for players who are live", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "player_one", viewerCount: 100, thumbnailUrl: "" },
		]);

		const player = await UserFactory.create({ twitch: "player_one" });
		const tournament = await addRunningTournament({
			memberUserIds: [player.id],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(player.id);
		expect(rows[0]).toMatchObject({
			platform: "TWITCH",
			account: "player_one",
		});
		expect(rows[0].tournamentId).toBe(tournament.id);
	});

	test("skips dropped-out teams", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "dropped_player", viewerCount: 50, thumbnailUrl: "" },
		]);

		const player = await UserFactory.create({ twitch: "dropped_player" });
		await addRunningTournament({
			memberUserIds: [player.id],
			droppedOut: true,
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(0);
	});

	test("inserts cast accounts with null userId", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "caster_account", viewerCount: 200, thumbnailUrl: "" },
		]);

		await addRunningTournament({
			castAccounts: [{ platform: "TWITCH", account: "caster_account" }],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBeNull();
		expect(rows[0]).toMatchObject({
			platform: "TWITCH",
			account: "caster_account",
		});
	});

	test("no inserts when no streams match", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "unrelated_stream", viewerCount: 10, thumbnailUrl: "" },
		]);

		const player = await UserFactory.create({ twitch: "different_account" });
		await addRunningTournament({ memberUserIds: [player.id] });

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(0);
	});

	test("throttles to run only every 30 minutes", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "streamer_a", viewerCount: 100, thumbnailUrl: "" },
		]);

		const playerA = await UserFactory.create({ twitch: "streamer_a" });
		await addRunningTournament({ memberUserIds: [playerA.id] });

		await SyncLiveStreamsRoutine.run();

		const rowsAfterFirst = await findAllTournamentStreamers();
		expect(rowsAfterFirst).toHaveLength(1);

		// a different tournament — if throttle works, nothing new is inserted
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "streamer_b", viewerCount: 50, thumbnailUrl: "" },
		]);

		const playerB = await UserFactory.create({ twitch: "streamer_b" });
		await addRunningTournament({ memberUserIds: [playerB.id] });

		// call again without advancing time — should be throttled
		await SyncLiveStreamsRoutine.run();

		const rowsAfterSecond = await findAllTournamentStreamers();
		expect(rowsAfterSecond).toHaveLength(1);
		expect(rowsAfterSecond[0].account).toBe("streamer_a");
	});

	test("populates LiveStream table with YouTube streams matched to the channel's user", async () => {
		const youtuber = await UserFactory.create({ youtubeId: YOUTUBE_CHANNEL });
		mockGetYoutubeLiveStreams.mockResolvedValue([
			youtubeStream({ channelId: YOUTUBE_CHANNEL, viewerCount: 25 }),
		]);

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllLiveStreams();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			platform: "YOUTUBE",
			account: YOUTUBE_CHANNEL,
			videoId: YOUTUBE_VIDEO_ID,
			userId: youtuber.id,
			viewerCount: 25,
		});
	});

	test("keeps both rows of a user live on Twitch and YouTube", async () => {
		const player = await UserFactory.create({
			twitch: "both_platforms",
			youtubeId: YOUTUBE_CHANNEL,
		});
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "both_platforms", viewerCount: 10, thumbnailUrl: "" },
		]);
		mockGetYoutubeLiveStreams.mockResolvedValue([
			youtubeStream({ channelId: YOUTUBE_CHANNEL }),
		]);

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllLiveStreams();
		expect(
			rows
				.map((row) => ({ platform: row.platform, userId: row.userId }))
				.sort((a, b) => a.platform.localeCompare(b.platform)),
		).toEqual([
			{ platform: "TWITCH", userId: player.id },
			{ platform: "YOUTUBE", userId: player.id },
		]);
	});

	test("inserts YouTube streamer rows for live players and casters", async () => {
		const player = await UserFactory.create({ youtubeId: YOUTUBE_CHANNEL });
		mockGetYoutubeLiveStreams.mockResolvedValue([
			youtubeStream({ channelId: YOUTUBE_CHANNEL }),
			youtubeStream({ channelId: YOUTUBE_CASTER_CHANNEL, videoId: "cast" }),
		]);

		await addRunningTournament({
			memberUserIds: [player.id],
			castAccounts: [{ platform: "YOUTUBE", account: YOUTUBE_CASTER_CHANNEL }],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(
			rows
				.map((row) => ({
					userId: row.userId,
					platform: row.platform,
					account: row.account,
				}))
				.sort((a, b) => a.account.localeCompare(b.account)),
		).toEqual([
			{ userId: null, platform: "YOUTUBE", account: YOUTUBE_CASTER_CHANNEL },
			{ userId: player.id, platform: "YOUTUBE", account: YOUTUBE_CHANNEL },
		]);
	});
});

describe("syncLiveStreams combined streams cache", () => {
	beforeEach(() => {
		RunningTournaments.clear();
		mockGetStreams.mockReset();
		mockGetYoutubeLiveStreams.mockReset();
		mockGetYoutubeLiveStreams.mockResolvedValue([]);
	});

	test.each([
		{ why: "nobody is live", streams: [] },
		{
			why: "someone is live",
			streams: [
				{ twitchUserName: "streamer_one", viewerCount: 10, thumbnailUrl: "" },
			],
		},
	])("clears the cached sidebar streams when $why", async ({ streams }) => {
		mockGetStreams.mockResolvedValue(streams);
		cache.set(COMBINED_STREAMS_KEY, {
			value: [],
			metadata: { createdTime: Date.now() },
		});

		await SyncLiveStreamsRoutine.run();

		expect(cache.has(COMBINED_STREAMS_KEY)).toBe(false);
	});
});

function youtubeStream({
	channelId,
	videoId = YOUTUBE_VIDEO_ID,
	viewerCount = 5,
}: {
	channelId: string;
	videoId?: string;
	viewerCount?: number;
}) {
	return { channelId, videoId, viewerCount, thumbnailUrl: "" };
}
