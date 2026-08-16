import { beforeEach, describe, expect, test, vi } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentStreamerFactory from "~/db/seed/factories/TournamentStreamerFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentSettings } from "~/db/tables-json";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";

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

vi.mock("~/modules/twitch/utils.server", () => ({
	hasTwitchEnvVars: () => true,
}));

const DOUBLE_ELIMINATION: TournamentSettings["bracketProgression"] = [
	{
		name: "Main Bracket",
		type: "double_elimination",
		requiresCheckIn: false,
		settings: {},
	},
];

const TEAM_COUNT = 4;
const MATCH_START_SECONDS = 1700000000;
const SECOND_MATCH_START_SECONDS = MATCH_START_SECONDS + 1800;

const users = UserFactory.pool();

let tournamentId: number;
/** The two first round matches, backdated to the times the VODs are matched against. */
let firstMatch: { id: number; winnerTeamId: number; loserTeamId: number };
let secondMatch: { id: number; winnerTeamId: number; loserTeamId: number };
let teams: Array<{ id: number; ownerUserId: number }>;

describe("syncTournamentVods", () => {
	beforeEach(async () => {
		mockGetUsersByLogin.mockReset();
		mockGetArchiveVideos.mockReset();
		await users.create(TEAM_COUNT);
	});

	test("player streamer gets VODs only for matches they participated in", async () => {
		await seedTournamentWithMatches();
		const player = playerOf(firstMatch.winnerTeamId);
		await seedStreamer("player_stream", player);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-1", login: "player_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([twitchVideo()]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(1);
		expect(vods[0].matchId).toBe(firstMatch.id);
		expect(vods[0].userId).toBe(player);
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
			castedOn: { match: "second", twitchAccount: "caster_stream" },
		});

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-c", login: "caster_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([twitchVideo()]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(1);
		expect(vods[0].matchId).toBe(secondMatch.id);
		expect(vods[0].userId).toBeNull();
		expect(vods[0].account).toBe("caster_stream");
	});

	test("player VOD is preferred over cast VOD for same match and account", async () => {
		await seedTournamentWithMatches({
			castedOn: { match: "first", twitchAccount: "dual_stream" },
		});
		const player = playerOf(firstMatch.winnerTeamId);
		await seedStreamer("dual_stream", player);

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-d", login: "dual_stream" },
		]);
		mockGetArchiveVideos.mockResolvedValue([twitchVideo()]);

		await runProcessOneTournament();

		const vods = await findAllVods();
		expect(vods).toHaveLength(1);
		expect(vods[0].userId).toBe(player);
	});

	test("no VODs inserted when no Twitch videos match", async () => {
		await seedTournamentWithMatches({
			castedOn: { match: "first", twitchAccount: "caster_stream" },
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
		await seedStreamer("player_stream", playerOf(firstMatch.winnerTeamId));

		mockGetUsersByLogin.mockResolvedValue([
			{ id: "twitch-1", login: "player_stream" },
		]);
		mockGetArchiveVideos.mockRejectedValue(new Error("Twitch API down"));

		const hadApiError = await runProcessOneTournament();

		expect(hadApiError).toBe(true);
	});

	test("returns hadApiError=false when getArchiveVideos returns empty (no vods found)", async () => {
		await seedTournamentWithMatches();
		await seedStreamer("player_stream", playerOf(firstMatch.winnerTeamId));

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
			castedOn: { match: "first", twitchAccount: "caster_stream" },
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
		await seedStreamer("good_stream", playerOf(firstMatch.winnerTeamId));
		await seedStreamer("bad_stream", playerOf(secondMatch.winnerTeamId));

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
		await seedStreamer("player_stream", playerOf(firstMatch.winnerTeamId));

		// clear startedAt on all matches: a played match that was never started is a
		// state no production write leaves behind
		// biome-ignore lint/plugin: written rather than seeded, see above
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

/**
 * A played out double elimination bracket of four one-player teams, its first
 * round backdated to the times the VODs are matched against and optionally
 * streamed by a cast account. Later matches start at the current time, far from
 * any mocked VOD.
 */
async function seedTournamentWithMatches({
	castedOn,
}: {
	castedOn?: { match: "first" | "second"; twitchAccount: string };
} = {}) {
	const tournament = await TournamentFactory.createPlayed(
		{
			authorId: users.id(1),
			bracketProgression: DOUBLE_ELIMINATION,
			minMembersPerTeam: 1,
		},
		{ teamRosters: users.ids(TEAM_COUNT).map((userId) => [userId]) },
	);
	tournamentId = tournament.id;
	teams = tournament.teams;
	[firstMatch, secondMatch] = tournament.matches;

	await backdate("TournamentMatch", firstMatch.id, {
		startedAt: new Date(MATCH_START_SECONDS * 1000),
	});
	await backdate("TournamentMatch", secondMatch.id, {
		startedAt: new Date(SECOND_MATCH_START_SECONDS * 1000),
	});

	if (castedOn) {
		await TournamentRepository.setMatchAsCasted({
			tournamentId,
			matchId: castedOn.match === "first" ? firstMatch.id : secondMatch.id,
			twitchAccount: castedOn.twitchAccount,
		});
	}
}

function playerOf(tournamentTeamId: number) {
	return teams.find((team) => team.id === tournamentTeamId)!.ownerUserId;
}

function seedStreamer(twitchAccount: string, userId: number | null = null) {
	return TournamentStreamerFactory.create({
		tournamentId,
		twitchAccount,
		userId,
	});
}

function findAllVods() {
	return db.selectFrom("TournamentMatchVod").selectAll().execute();
}

// lazy-import so mocks are in place before the module loads
async function runProcessOneTournament() {
	const { processOneTournament } = await import("./syncTournamentVods");
	return processOneTournament(tournamentId);
}
