import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db, sql } from "~/db/sql";
import type { CastedMatchesInfo } from "~/db/tables";
import { dbInsertUsers, dbReset } from "~/utils/Test";

const { mockGetUsersByLogin, mockGetArchiveVideos } = vi.hoisted(() => ({
	mockGetUsersByLogin: vi.fn(),
	mockGetArchiveVideos: vi.fn(),
}));

vi.mock("~/modules/twitch/vods", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/modules/twitch/vods")>();
	return {
		...actual,
		getUsersByLogin: mockGetUsersByLogin,
		getArchiveVideos: mockGetArchiveVideos,
	};
});

vi.mock("~/modules/twitch/utils", () => ({
	hasTwitchEnvVars: () => true,
}));

const TOURNAMENT_ID = 1;
const MATCH_START_SECONDS = 1700000000;

describe("syncTournamentVods", () => {
	beforeEach(async () => {
		dbReset();
		mockGetUsersByLogin.mockReset();
		mockGetArchiveVideos.mockReset();
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("player streamer gets VODs only for matches they participated in", async () => {
		await seedTournamentWithMatches();
		await seedStreamer("player_stream", 1);
		await seedTournamentTeamAndGameResult(1, [1, 2]);
		await seedTournamentTeamAndGameResult(2, [3, 4]);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-1", login: "player_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([twitchVideo()]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(1);
		expect(vods[0].matchId).toBe(1);
		expect(vods[0].userId).toBe(1);
		expect(vods[0].account).toBe("player_stream");
	});

	test("cast account in TournamentStreamer without castedMatchHistory does NOT produce VODs", async () => {
		await seedTournamentWithMatches();
		await seedStreamer("caster_stream", null);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-c", login: "caster_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([twitchVideo()]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(0);
	});

	test("cast account with castedMatchHistory produces VODs for casted matches only", async () => {
		await seedTournamentWithMatches({
			castedMatchesInfo: {
				lockedMatches: [],
				castedMatches: [],
				castedMatchHistory: [
					{
						twitchAccount: "caster_stream",
						matchId: 2,
						timestamp: MATCH_START_SECONDS + 1800,
					},
				],
			},
		});

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-c", login: "caster_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([twitchVideo()]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(1);
		expect(vods[0].matchId).toBe(2);
		expect(vods[0].userId).toBeNull();
		expect(vods[0].account).toBe("caster_stream");
	});

	test("player VOD is preferred over cast VOD for same match and account", async () => {
		await seedTournamentWithMatches({
			castedMatchesInfo: {
				lockedMatches: [],
				castedMatches: [],
				castedMatchHistory: [
					{
						twitchAccount: "dual_stream",
						matchId: 1,
						timestamp: MATCH_START_SECONDS,
					},
				],
			},
		});
		await seedStreamer("dual_stream", 1);
		await seedTournamentTeamAndGameResult(1, [1, 2]);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-d", login: "dual_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([twitchVideo()]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(1);
		expect(vods[0].userId).toBe(1);
	});

	test("no VODs inserted when no Twitch videos match", async () => {
		await seedTournamentWithMatches({
			castedMatchesInfo: {
				lockedMatches: [],
				castedMatches: [],
				castedMatchHistory: [
					{
						twitchAccount: "caster_stream",
						matchId: 1,
						timestamp: MATCH_START_SECONDS,
					},
				],
			},
		});

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-c", login: "caster_stream" },
		]);
		// video ends well before match started
		mockGetArchiveVideos.mockResolvedValue([
			twitchVideo({
				createdAt: new Date((MATCH_START_SECONDS - 50000) * 1000).toISOString(),
				duration: "1h0m0s",
			}),
		]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(0);
	});

	test("returns hadApiError=true when getArchiveVideos throws for a streamer", async () => {
		await seedTournamentWithMatches();
		await seedStreamer("player_stream", 1);
		await seedTournamentTeamAndGameResult(1, [1, 2]);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-1", login: "player_stream" },
		]);
		mockGetArchiveVideos.mockRejectedValue(new Error("Twitch API down"));

		const hadApiError = await runProcessOneTournament();

		expect(hadApiError).toBe(true);
	});

	test("returns hadApiError=false when getArchiveVideos returns empty (no vods found)", async () => {
		await seedTournamentWithMatches();
		await seedStreamer("player_stream", 1);
		await seedTournamentTeamAndGameResult(1, [1, 2]);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-1", login: "player_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([]);

		const hadApiError = await runProcessOneTournament();

		expect(hadApiError).toBe(false);
		const vods = await findAllVods();
		expect(vods).toHaveLength(0);
	});

	test("returns hadApiError=true when cast account API call fails", async () => {
		await seedTournamentWithMatches({
			castedMatchesInfo: {
				lockedMatches: [],
				castedMatches: [],
				castedMatchHistory: [
					{
						twitchAccount: "caster_stream",
						matchId: 1,
						timestamp: MATCH_START_SECONDS,
					},
				],
			},
		});

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-c", login: "caster_stream" },
		]);
		mockGetArchiveVideos.mockRejectedValue(new Error("Twitch API down"));

		const hadApiError = await runProcessOneTournament();

		expect(hadApiError).toBe(true);
	});

	test("still inserts vods from successful streamers when another streamer's API call fails", async () => {
		await seedTournamentWithMatches();
		await seedStreamer("good_stream", 1);
		await seedStreamer("bad_stream", 3);
		await seedTournamentTeamAndGameResult(1, [1, 2]);
		await seedTournamentTeamAndGameResult(2, [3, 4]);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-g", login: "good_stream" },
			{ id: "twitch-b", login: "bad_stream" },
		]);
		mockGetArchiveVideos
			.mockResolvedValueOnce([twitchVideo()])
			.mockRejectedValueOnce(new Error("Twitch API down"));

		const hadApiError = await runProcessOneTournament();

		expect(hadApiError).toBe(true);
		const vods = await findAllVods();
		expect(vods).toHaveLength(1);
		expect(vods[0].account).toBe("good_stream");
	});

	test("no matches with startedAt results in no processing", async () => {
		await seedTournamentWithMatches();

		// clear startedAt on all matches
		await db.updateTable("TournamentMatch").set({ startedAt: null }).execute();

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(0);
		expect(mockGetUsersByLogin).not.toHaveBeenCalled();
	});
});

function twitchVideo({
	id = "video1",
	createdAt = new Date((MATCH_START_SECONDS - 600) * 1000).toISOString(),
	duration = "2h0m0s",
	viewCount = 100,
} = {}) {
	return {
		id,
		created_at: createdAt,
		duration,
		view_count: viewCount,
	};
}

async function seedTournamentWithMatches({
	castedMatchesInfo,
}: {
	castedMatchesInfo?: CastedMatchesInfo;
} = {}) {
	sql
		.prepare(
			/*sql*/ `insert into "Tournament" ("id", "mapPickingStyle", "settings", "isFinalized", "castedMatchesInfo") values (?, 'AUTO_SZ', ?, 1, ?)`,
		)
		.run(
			TOURNAMENT_ID,
			JSON.stringify({
				bracketProgression: [
					{ type: "double_elimination", name: "Main Bracket" },
				],
			}),
			castedMatchesInfo ? JSON.stringify(castedMatchesInfo) : null,
		);

	sql
		.prepare(
			/*sql*/ `insert into "TournamentStage" ("id", "tournamentId", "name", "type", "settings", "number") values (1, ?, 'Main Bracket', 'double_elimination', '{}', 0)`,
		)
		.run(TOURNAMENT_ID);

	sql
		.prepare(
			/*sql*/ `insert into "TournamentGroup" ("id", "stageId", "number") values (1, 1, 1)`,
		)
		.run();

	sql
		.prepare(
			/*sql*/ `insert into "TournamentRound" ("id", "stageId", "groupId", "number") values (1, 1, 1, 1)`,
		)
		.run();

	const insertTournamentMatchStm = sql.prepare(
		/*sql*/ `insert into "TournamentMatch" ("id", "roundId", "stageId", "groupId", "number", "opponentOne", "opponentTwo", "status", "startedAt") values (?, 1, 1, 1, ?, ?, ?, 4, ?)`,
	);

	insertTournamentMatchStm.run(
		1,
		1,
		JSON.stringify({ id: 1 }),
		JSON.stringify({ id: 2 }),
		MATCH_START_SECONDS,
	);

	insertTournamentMatchStm.run(
		2,
		2,
		JSON.stringify({ id: 3 }),
		JSON.stringify({ id: 4 }),
		MATCH_START_SECONDS + 1800,
	);
}

async function seedTournamentTeamAndGameResult(
	matchId: number,
	participantUserIds: number[],
) {
	const teamId = matchId * 100;

	sql
		.prepare(
			/*sql*/ `insert or ignore into "TournamentTeam" ("id", "name", "tournamentId", "inviteCode") values (?, ?, ?, ?)`,
		)
		.run(teamId, `Team ${teamId}`, TOURNAMENT_ID, `code-${teamId}`);

	const { lastInsertRowid: gameResultId } = sql
		.prepare(
			/*sql*/ `insert into "TournamentMatchGameResult" ("matchId", "number", "stageId", "mode", "source", "winnerTeamId", "reporterId") values (?, 1, 1, 'SZ', '{}', ?, 1)`,
		)
		.run(matchId, teamId);

	for (const userId of participantUserIds) {
		sql
			.prepare(
				/*sql*/ `insert into "TournamentMatchGameResultParticipant" ("matchGameResultId", "userId", "tournamentTeamId") values (?, ?, ?)`,
			)
			.run(Number(gameResultId), userId, teamId);
	}
}

async function seedStreamer(
	twitchAccount: string,
	userId: number | null = null,
) {
	await db
		.insertInto("TournamentStreamer")
		.values({ tournamentId: TOURNAMENT_ID, twitchAccount, userId })
		.execute();
}

function findAllVods() {
	return db.selectFrom("TournamentMatchVod").selectAll().execute();
}

// lazy-import so mocks are in place before the module loads
async function runProcessOneTournament() {
	const { processOneTournament } = await import("./syncTournamentVods");
	return processOneTournament(TOURNAMENT_ID);
}
