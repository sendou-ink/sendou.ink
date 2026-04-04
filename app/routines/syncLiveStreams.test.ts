import { add } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db/sql";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import {
	testTournament,
	tournamentCtxTeam,
} from "~/features/tournament-bracket/core/tests/test-utils";
import { dbReset } from "~/utils/Test";
import { SyncLiveStreamsRoutine } from "./syncLiveStreams";

const { mockGetStreams } = vi.hoisted(() => ({
	mockGetStreams: vi.fn(),
}));

vi.mock("~/modules/twitch", () => ({
	getStreams: mockGetStreams,
}));

vi.mock("~/modules/twitch/utils", () => ({
	hasTwitchEnvVars: () => true,
}));

vi.mock("~/features/user-page/UserRepository.server", () => ({
	findIdsByTwitchUsernames: () => [],
}));

function findAllTournamentStreamers() {
	return db.selectFrom("TournamentStreamer").selectAll().execute();
}

function findAllLiveStreams() {
	return db.selectFrom("LiveStream").selectAll().execute();
}

function addRunningTournament(
	ctx?: Partial<Parameters<typeof testTournament>[0]["ctx"]>,
) {
	const tournament = testTournament({ ctx });
	RunningTournaments.add(tournament);
	return tournament;
}

let timeOffset = 0;

describe("syncLiveStreams tournament streamers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(
			add(new Date("2025-01-15T12:00:00Z"), { minutes: timeOffset }),
		);
		timeOffset += 31;
		dbReset();
		RunningTournaments.clear();
		mockGetStreams.mockReset();
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
		expect(rows.map((r) => r.twitch).sort()).toEqual([
			"streamer_one",
			"streamer_two",
		]);
		expect(rows[0].viewerCount).toBe(100);
	});

	test("inserts streamer rows for players who are live", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "player_one", viewerCount: 100, thumbnailUrl: "" },
		]);

		addRunningTournament({
			teams: [
				tournamentCtxTeam(1, {
					members: [
						{
							userId: 10,
							username: "Player One",
							discordId: "10",
							discordAvatar: null,
							customUrl: null,
							inGameName: null,
							country: null,
							twitch: "player_one",
							plusTier: null,
							isOwner: 1,
							role: "OWNER",
							createdAt: 0,
							streamTwitch: null,
							streamViewerCount: null,
							streamThumbnailUrl: null,
						},
					],
				}),
			],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(10);
		expect(rows[0].twitchAccount).toBe("player_one");
		expect(rows[0].tournamentId).toBe(1);
	});

	test("skips dropped-out teams", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "dropped_player", viewerCount: 50, thumbnailUrl: "" },
		]);

		addRunningTournament({
			teams: [
				tournamentCtxTeam(1, {
					droppedOut: 1,
					members: [
						{
							userId: 20,
							username: "Dropped",
							discordId: "20",
							discordAvatar: null,
							customUrl: null,
							inGameName: null,
							country: null,
							twitch: "dropped_player",
							plusTier: null,
							isOwner: 1,
							role: "OWNER",
							createdAt: 0,
							streamTwitch: null,
							streamViewerCount: null,
							streamThumbnailUrl: null,
						},
					],
				}),
			],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(0);
	});

	test("inserts cast accounts with null userId", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "caster_account", viewerCount: 200, thumbnailUrl: "" },
		]);

		addRunningTournament({
			castTwitchAccounts: ["caster_account"],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBeNull();
		expect(rows[0].twitchAccount).toBe("caster_account");
	});

	test("no inserts when no streams match", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "unrelated_stream", viewerCount: 10, thumbnailUrl: "" },
		]);

		addRunningTournament({
			teams: [
				tournamentCtxTeam(1, {
					members: [
						{
							userId: 30,
							username: "No Match",
							discordId: "30",
							discordAvatar: null,
							customUrl: null,
							inGameName: null,
							country: null,
							twitch: "different_account",
							plusTier: null,
							isOwner: 1,
							role: "OWNER",
							createdAt: 0,
							streamTwitch: null,
							streamViewerCount: null,
							streamThumbnailUrl: null,
						},
					],
				}),
			],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(0);
	});

	test("throttles to run only every 30 minutes", async () => {
		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "streamer_a", viewerCount: 100, thumbnailUrl: "" },
		]);

		addRunningTournament({
			teams: [
				tournamentCtxTeam(1, {
					members: [
						{
							userId: 40,
							username: "Streamer A",
							discordId: "40",
							discordAvatar: null,
							customUrl: null,
							inGameName: null,
							country: null,
							twitch: "streamer_a",
							plusTier: null,
							isOwner: 1,
							role: "OWNER",
							createdAt: 0,
							streamTwitch: null,
							streamViewerCount: null,
							streamThumbnailUrl: null,
						},
					],
				}),
			],
		});

		await SyncLiveStreamsRoutine.run();

		const rowsAfterFirst = await findAllTournamentStreamers();
		expect(rowsAfterFirst).toHaveLength(1);

		// clear DB and add a different tournament — if throttle works, nothing new is inserted
		await db.deleteFrom("TournamentStreamer").execute();
		RunningTournaments.clear();

		mockGetStreams.mockResolvedValue([
			{ twitchUserName: "streamer_b", viewerCount: 50, thumbnailUrl: "" },
		]);

		addRunningTournament({
			id: 2,
			teams: [
				tournamentCtxTeam(2, {
					members: [
						{
							userId: 50,
							username: "Streamer B",
							discordId: "50",
							discordAvatar: null,
							customUrl: null,
							inGameName: null,
							country: null,
							twitch: "streamer_b",
							plusTier: null,
							isOwner: 1,
							role: "OWNER",
							createdAt: 0,
							streamTwitch: null,
							streamViewerCount: null,
							streamThumbnailUrl: null,
						},
					],
				}),
			],
		});

		// call again without advancing time — should be throttled
		await SyncLiveStreamsRoutine.run();

		const rowsAfterSecond = await findAllTournamentStreamers();
		expect(rowsAfterSecond).toHaveLength(0);
	});
});
