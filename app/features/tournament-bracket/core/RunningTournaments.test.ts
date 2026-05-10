import { beforeEach, describe, expect, it } from "vitest";
import { RunningTournaments } from "./RunningTournaments.server";
import { testTournament, tournamentCtxTeam } from "./tests/test-utils";

const createMember = (userId: number) =>
	({
		userId,
		username: `User ${userId}`,
		discordId: String(userId),
		discordAvatar: null,
		customUrl: null,
		country: null,
		twitch: null,
		plusTier: null,
		createdAt: 0,
		inGameName: null,
		streamTwitch: null,
		streamViewerCount: null,
		streamThumbnailUrl: null,
		role: "REGULAR",
	}) as const;

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

		it("does nothing when tournament not in registry", () => {
			RunningTournaments.remove(999);

			expect(RunningTournaments.has(999)).toBe(false);
		});
	});

	describe("clear", () => {
		it("removes all tournaments", () => {
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
		});
	});
});
