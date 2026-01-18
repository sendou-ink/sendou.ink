import { beforeEach, describe, expect, it } from "vitest";
import { RunningTournaments } from "./RunningTournaments.server";
import { testTournament, tournamentCtxTeam } from "./tests/test-utils";

const createMember = (userId: number) => ({
	userId,
	username: `User ${userId}`,
	discordId: String(userId),
	discordAvatar: null,
	customUrl: null,
	country: null,
	twitch: null,
	plusTier: null,
	createdAt: 0,
	isOwner: 0,
	inGameName: null,
	streamTwitch: null,
	streamViewerCount: null,
	streamThumbnailUrl: null,
});

const createTestTournament = (
	tournamentId: number,
	teamMembers: { teamId: number; userIds: number[] }[],
) => {
	const teams = teamMembers.map(({ teamId, userIds }) =>
		tournamentCtxTeam(teamId, {
			members: userIds.map(createMember),
		}),
	);

	return testTournament({
		ctx: {
			id: tournamentId,
			teams,
		},
	});
};

describe("RunningTournaments", () => {
	beforeEach(() => {
		RunningTournaments.clear();
	});

	describe("add", () => {
		it("adds a tournament to the registry", () => {
			const tournament = createTestTournament(1, [
				{ teamId: 1, userIds: [100, 101] },
			]);

			RunningTournaments.add(tournament);

			expect(RunningTournaments.has(1)).toBe(true);
			expect(RunningTournaments.get(1)).toBe(tournament);
		});

		it("tracks all team members", () => {
			const tournament = createTestTournament(1, [
				{ teamId: 1, userIds: [100, 101] },
				{ teamId: 2, userIds: [200, 201, 202] },
			]);

			RunningTournaments.add(tournament);

			expect(RunningTournaments.isUserPlaying(100)).toBe(true);
			expect(RunningTournaments.isUserPlaying(101)).toBe(true);
			expect(RunningTournaments.isUserPlaying(200)).toBe(true);
			expect(RunningTournaments.isUserPlaying(201)).toBe(true);
			expect(RunningTournaments.isUserPlaying(202)).toBe(true);
			expect(RunningTournaments.isUserPlaying(999)).toBe(false);
		});

		it("updates existing tournament when added again with different instance", () => {
			const tournament1 = createTestTournament(1, [
				{ teamId: 1, userIds: [100] },
			]);
			const tournament2 = createTestTournament(1, [
				{ teamId: 1, userIds: [100, 101] },
			]);

			RunningTournaments.add(tournament1);
			RunningTournaments.add(tournament2);

			expect(RunningTournaments.get(1)).toBe(tournament2);
			expect(RunningTournaments.isUserPlaying(101)).toBe(true);
		});

		it("skips update when same tournament instance is added", () => {
			const tournament = createTestTournament(1, [
				{ teamId: 1, userIds: [100] },
			]);

			RunningTournaments.add(tournament);
			RunningTournaments.add(tournament);

			expect(RunningTournaments.get(1)).toBe(tournament);
		});
	});

	describe("remove", () => {
		it("removes a tournament from the registry", () => {
			const tournament = createTestTournament(1, [
				{ teamId: 1, userIds: [100] },
			]);

			RunningTournaments.add(tournament);
			RunningTournaments.remove(1);

			expect(RunningTournaments.has(1)).toBe(false);
			expect(RunningTournaments.get(1)).toBeUndefined();
		});

		it("cleans up user tracking", () => {
			const tournament = createTestTournament(1, [
				{ teamId: 1, userIds: [100, 101] },
			]);

			RunningTournaments.add(tournament);
			RunningTournaments.remove(1);

			expect(RunningTournaments.isUserPlaying(100)).toBe(false);
			expect(RunningTournaments.isUserPlaying(101)).toBe(false);
		});

		it("does nothing when tournament not in registry", () => {
			RunningTournaments.remove(999);

			expect(RunningTournaments.has(999)).toBe(false);
		});
	});

	describe("getUserTournamentId", () => {
		it("returns tournament ID for user", () => {
			const tournament = createTestTournament(42, [
				{ teamId: 1, userIds: [100] },
			]);

			RunningTournaments.add(tournament);

			expect(RunningTournaments.getUserTournamentId(100)).toBe(42);
		});

		it("returns undefined for user not in any tournament", () => {
			expect(RunningTournaments.getUserTournamentId(999)).toBeUndefined();
		});
	});

	describe("getUserTournament", () => {
		it("returns tournament instance for user", () => {
			const tournament = createTestTournament(1, [
				{ teamId: 1, userIds: [100] },
			]);

			RunningTournaments.add(tournament);

			expect(RunningTournaments.getUserTournament(100)).toBe(tournament);
		});

		it("returns undefined for user not in any tournament", () => {
			expect(RunningTournaments.getUserTournament(999)).toBeUndefined();
		});
	});

	describe("updateTournamentUsers", () => {
		it("updates user tracking when roster changes", () => {
			const tournament1 = createTestTournament(1, [
				{ teamId: 1, userIds: [100, 101] },
			]);
			const tournament2 = createTestTournament(1, [
				{ teamId: 1, userIds: [101, 102] },
			]);

			RunningTournaments.add(tournament1);
			RunningTournaments.updateTournamentUsers(1, tournament2);

			expect(RunningTournaments.isUserPlaying(100)).toBe(false);
			expect(RunningTournaments.isUserPlaying(101)).toBe(true);
			expect(RunningTournaments.isUserPlaying(102)).toBe(true);
		});
	});

	describe("clear", () => {
		it("removes all tournaments and users", () => {
			const tournament1 = createTestTournament(1, [
				{ teamId: 1, userIds: [100] },
			]);
			const tournament2 = createTestTournament(2, [
				{ teamId: 2, userIds: [200] },
			]);

			RunningTournaments.add(tournament1);
			RunningTournaments.add(tournament2);
			RunningTournaments.clear();

			expect(RunningTournaments.has(1)).toBe(false);
			expect(RunningTournaments.has(2)).toBe(false);
			expect(RunningTournaments.isUserPlaying(100)).toBe(false);
			expect(RunningTournaments.isUserPlaying(200)).toBe(false);
		});
	});
});
