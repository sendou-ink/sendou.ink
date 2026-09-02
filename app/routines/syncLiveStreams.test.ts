import { add } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import { testTournament } from "~/features/tournament-bracket/core/tests/test-utils";
import { withUserId } from "~/utils/Test";
import { SyncLiveStreamsRoutine } from "./syncLiveStreams";

const { mockGetStreams } = vi.hoisted(() => ({
	mockGetStreams: vi.fn(),
}));

vi.mock("~/modules/twitch", () => ({
	getStreams: mockGetStreams,
}));

vi.mock("~/modules/twitch/utils.server", () => ({
	hasTwitchEnvVars: () => true,
}));

vi.mock(
	"~/features/user-page/UserRepository.server",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("~/features/user-page/UserRepository.server")
		>()),
		findIdsByTwitchUsernames: () => [],
	}),
);

const users = UserFactory.pool();

function findAllTournamentStreamers() {
	return db.selectFrom("TournamentStreamer").selectAll().execute();
}

function findAllLiveStreams() {
	return db.selectFrom("LiveStream").selectAll().execute();
}

/** A tournament the routine considers live: teams in the database (for members' Twitch accounts) and in the running tournaments registry. */
async function addRunningTournament({
	memberUserIds = [],
	castTwitchAccounts = [],
	droppedOut = false,
}: {
	memberUserIds?: number[];
	castTwitchAccounts?: string[];
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
		testTournament({ ctx: { id: tournament.id, castTwitchAccounts } }),
	);

	return tournament;
}

let timeOffset = 0;

describe("syncLiveStreams tournament streamers", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(
			add(new Date("2025-01-15T12:00:00Z"), { minutes: timeOffset }),
		);
		timeOffset += 31;
		RunningTournaments.clear();
		mockGetStreams.mockReset();
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

		const player = await UserFactory.create({ twitch: "player_one" });
		const tournament = await addRunningTournament({
			memberUserIds: [player.id],
		});

		await SyncLiveStreamsRoutine.run();

		const rows = await findAllTournamentStreamers();
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(player.id);
		expect(rows[0].twitchAccount).toBe("player_one");
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

		await addRunningTournament({ castTwitchAccounts: ["caster_account"] });

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
		expect(rowsAfterSecond[0].twitchAccount).toBe("streamer_a");
	});
});
