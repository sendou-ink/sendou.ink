import { addDays, subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as CalendarEventResultFactory from "~/db/seed/factories/CalendarEventResultFactory";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withUserId } from "~/utils/Test";
import * as UserRepository from "./UserRepository.server";

describe("UserRepository", () => {
	test("created user has createdAt field", async () => {
		await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
		});

		const user = await UserRepository.findModInfoById(1);

		expect(user).toBeDefined();
		expect(user?.createdAt).toBeDefined();
	});

	test("updates user name when upserting", async () => {
		const { id } = await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
		});

		const user = await UserRepository.findLayoutDataById(id);

		expect(user?.username).toBe("TestUser");

		await UserRepository.upsert({
			discordId: "1",
			discordName: "UpdatedUser",
		});

		const updatedUser = await UserRepository.findLayoutDataById(id);
		expect(updatedUser?.username).toBe("UpdatedUser");
	});

	test("updating a user doesn't change the createdAt field", async () => {
		await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
		});

		const user = await UserRepository.findModInfoById(1);
		const createdAt = user?.createdAt;

		await UserRepository.upsert({
			discordId: "1",
			discordName: "UpdatedUser",
		});

		const updatedUser = await UserRepository.findModInfoById(1);
		expect(updatedUser?.createdAt).toEqual(createdAt);
	});

	test("new user gets joinOrder of 1", async () => {
		const { id } = await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
		});

		const result = await UserRepository.findJoinOrderByUserId(id);

		expect(result?.joinOrder).toBe(1);
	});

	test("joinOrder increments for each new user and does not change on update", async () => {
		const { id: firstId } = await UserRepository.upsert({
			discordId: "1",
			discordName: "FirstUser",
		});

		const { id: secondId } = await UserRepository.upsert({
			discordId: "2",
			discordName: "SecondUser",
		});

		expect(
			(await UserRepository.findJoinOrderByUserId(firstId))?.joinOrder,
		).toBe(1);
		expect(
			(await UserRepository.findJoinOrderByUserId(secondId))?.joinOrder,
		).toBe(2);

		await UserRepository.upsert({
			discordId: "1",
			discordName: "UpdatedFirstUser",
		});

		expect(
			(await UserRepository.findJoinOrderByUserId(firstId))?.joinOrder,
		).toBe(1);
	});

	describe("findResultsByUserId filters", () => {
		const startTimeOf = (year: number) =>
			dateToDatabaseTimestamp(new Date(Date.UTC(year, 5, 1)));

		const seedResults = async () => {
			const user = await UserFactory.create();
			const mate = await UserFactory.create();
			const [firstOpponent, secondOpponent] = await UserFactory.createMany(2);

			const wonEvent = await CalendarEventFactory.create({
				name: "Gamma Open",
				authorId: user.id,
				startTimes: [startTimeOf(2024)],
			});
			await CalendarEventResultFactory.create({
				eventId: wonEvent.id,
				participantCount: 8,
				results: [
					{
						teamName: "Team Gamma",
						placement: 1,
						players: [
							{ userId: user.id, name: null },
							{ userId: mate.id, name: null },
						],
					},
				],
			});

			const lostEvent = await CalendarEventFactory.create({
				name: "Delta Open",
				authorId: user.id,
				startTimes: [startTimeOf(2022)],
			});
			await CalendarEventResultFactory.create({
				eventId: lostEvent.id,
				participantCount: 50,
				results: [
					{
						teamName: "Team Delta",
						placement: 5,
						players: [
							{ userId: user.id, name: null },
							{ userId: firstOpponent.id, name: null },
						],
					},
				],
			});

			await TournamentFactory.createPlayed(
				{
					name: "Alpha Invitational",
					authorId: user.id,
					startTimes: [startTimeOf(2023)],
					minMembersPerTeam: 1,
				},
				{
					teamRosters: [[user.id], [secondOpponent.id]],
					playedOut: "all",
					tier: 1,
				},
			);

			return { userId: user.id, mateUserId: mate.id };
		};

		const filteredResults = async (
			userId: number,
			filters: Parameters<typeof UserRepository.countResultsByUserId>[1],
		) => {
			const [results, count] = await Promise.all([
				UserRepository.findResultsByUserId(userId, filters),
				UserRepository.countResultsByUserId(userId, filters),
			]);

			expect(count).toBe(results.length);

			return results;
		};

		test("returns every result without filters", async () => {
			const { userId } = await seedResults();

			const results = await filteredResults(userId, {});

			expect(results).toHaveLength(3);
		});

		test("filters by result source", async () => {
			const { userId } = await seedResults();

			const tournaments = await filteredResults(userId, { source: "SENDOU" });
			const reported = await filteredResults(userId, { source: "EXTERNAL" });

			expect(tournaments).toHaveLength(1);
			expect(tournaments[0].eventName).toBe("Alpha Invitational");
			expect(reported.map((result) => result.eventName).sort()).toEqual([
				"Delta Open",
				"Gamma Open",
			]);
		});

		test("filters by tier, excluding results without one", async () => {
			const { userId } = await seedResults();

			const bestTiers = await filteredResults(userId, {
				minTier: 1,
				maxTier: 3,
			});
			const worstTiers = await filteredResults(userId, {
				minTier: 8,
				maxTier: 9,
			});

			expect(bestTiers).toHaveLength(1);
			expect(bestTiers[0].eventName).toBe("Alpha Invitational");
			expect(worstTiers).toHaveLength(0);
		});

		test("filters by placement", async () => {
			const { userId } = await seedResults();

			const wins = await filteredResults(userId, { maxPlacement: 1 });

			expect(wins.every((result) => result.placement === 1)).toBe(true);
			expect(wins.map((result) => result.eventName)).toContain("Gamma Open");
			expect(wins.map((result) => result.eventName)).not.toContain(
				"Delta Open",
			);
		});

		test("filters by year range", async () => {
			const { userId } = await seedResults();

			const results = await filteredResults(userId, {
				fromYear: 2023,
				toYear: 2024,
			});

			expect(results.map((result) => result.eventName).sort()).toEqual([
				"Alpha Invitational",
				"Gamma Open",
			]);
		});

		test("filters by teammate", async () => {
			const { userId, mateUserId } = await seedResults();

			const results = await filteredResults(userId, { mateUserId });

			expect(results).toHaveLength(1);
			expect(results[0].eventName).toBe("Gamma Open");
		});

		test("filters by team name", async () => {
			const { userId } = await seedResults();

			const results = await filteredResults(userId, { teamName: "delta" });

			expect(results).toHaveLength(1);
			expect(results[0].eventName).toBe("Delta Open");
		});

		test("filters by minimum participant count", async () => {
			const { userId } = await seedResults();

			const results = await filteredResults(userId, {
				minParticipantCount: 16,
			});

			expect(results).toHaveLength(1);
			expect(results[0].eventName).toBe("Delta Open");
		});

		test("filters by tournament name", async () => {
			const { userId } = await seedResults();

			const results = await filteredResults(userId, {
				tournamentName: "alpha",
			});

			expect(results).toHaveLength(1);
			expect(results[0].eventName).toBe("Alpha Invitational");
		});

		describe("of a tournament with many divisions", () => {
			const TOP_DIVISION_TIER = 2;
			const LOW_DIVISION_TIER = 7;

			const seedDivisionedResults = async () => {
				const [topUser, lowUser, topMate, lowMate] =
					await UserFactory.createMany(4);

				const { id: tournamentId } = await TournamentFactory.create(
					{
						name: "Divisioned Open",
						authorId: topUser.id,
						minMembersPerTeam: 1,
						bracketProgression: [
							{
								name: "Top Division",
								type: "single_elimination",
								requiresCheckIn: false,
								settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
							},
							{
								name: "Low Division",
								type: "single_elimination",
								requiresCheckIn: false,
								settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
							},
						],
					},
					{},
				);

				const teams: Awaited<
					ReturnType<typeof TournamentTeamFactory.create>
				>[] = [];
				for (const user of [topUser, topMate, lowUser, lowMate]) {
					teams.push(
						await TournamentTeamFactory.create(
							{ tournamentId, memberUserIds: [user.id] },
							{ isCheckedIn: true },
						),
					);
				}
				await TournamentTeamRepository.updateStartingBrackets(
					teams.map((team, idx) => ({
						tournamentTeamId: team.id,
						startingBracketIdx: idx < 2 ? 0 : 1,
					})),
				);

				await TournamentFactory.playOut(tournamentId, "all");

				await TournamentRepository.upsertDivisionTier({
					tournamentId,
					bracketIdx: 0,
					tier: TOP_DIVISION_TIER,
				});
				await TournamentRepository.upsertDivisionTier({
					tournamentId,
					bracketIdx: 1,
					tier: LOW_DIVISION_TIER,
				});

				return { topUserId: topUser.id, lowUserId: lowUser.id };
			};

			test("reports the tier of the division the result is from", async () => {
				const { topUserId, lowUserId } = await seedDivisionedResults();

				const [topResult] = await filteredResults(topUserId, {});
				const [lowResult] = await filteredResults(lowUserId, {});

				expect(topResult.tier).toBe(TOP_DIVISION_TIER);
				expect(lowResult.tier).toBe(LOW_DIVISION_TIER);
			});

			test("filters by the tier of the division the result is from", async () => {
				const { topUserId, lowUserId } = await seedDivisionedResults();

				const topRange = { minTier: 1, maxTier: 3 } as const;

				expect(await filteredResults(topUserId, topRange)).toHaveLength(1);
				expect(await filteredResults(lowUserId, topRange)).toHaveLength(0);
			});
		});
	});

	describe("userRoles", () => {
		test("returns empty array for basic user", async () => {
			await UserFactory.createAdmin();

			const recentDiscordId = String(
				(BigInt(Date.now() - 1420070400000) << 22n) + 1n,
			);
			const { id } = await UserFactory.create({
				discordId: recentDiscordId,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toEqual([]);
		});

		test("returns ADMIN and STAFF roles for admin user", async () => {
			const { id } = await UserFactory.createAdmin();

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("ADMIN");
			expect(user?.roles).toContain("STAFF");
		});

		test("returns MINOR_SUPPORT role for patron tier 1", async () => {
			const { id } = await UserFactory.create(null, { patronTier: 1 });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).not.toContain("SUPPORTER");
		});

		test("returns SUPPORTER, MINOR_SUPPORT, TOURNAMENT_ADDER, CALENDAR_EVENT_ADDER, and API_ACCESSER roles for patron tier 2", async () => {
			const { id } = await UserFactory.create(null, { patronTier: 2 });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("SUPPORTER");
			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns PLUS_SERVER_MEMBER role for plus tier user", async () => {
			const { id } = await UserFactory.create(null, { plusTier: 1 });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("PLUS_SERVER_MEMBER");
		});

		test("returns ARTIST role for artist user", async () => {
			const { id } = await UserFactory.create(null, { roles: ["ARTIST"] });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("ARTIST");
		});

		test("returns VIDEO_ADDER role for video adder user", async () => {
			const { id } = await UserFactory.create(null, { roles: ["VIDEO_ADDER"] });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("VIDEO_ADDER");
		});

		test("returns TOURNAMENT_ADDER and API_ACCESSER roles for tournament organizer", async () => {
			const { id } = await UserFactory.create(
				{},
				{ roles: ["TOURNAMENT_ORGANIZER"] },
			);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns API_ACCESSER role for api accesser user", async () => {
			const { id } = await UserFactory.create(null, {
				roles: ["API_ACCESSER"],
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns CALENDAR_EVENT_ADDER role for aged discord account", async () => {
			const agedDiscordId = "79237403620945921";
			const { id } = await UserFactory.create({ discordId: agedDiscordId });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
		});

		test("does not return CALENDAR_EVENT_ADDER role for new discord account", async () => {
			const recentDiscordId = String(
				(BigInt(Date.now() - 1420070400000) << 22n) + 1n,
			);

			const { id } = await UserFactory.create({
				discordId: recentDiscordId,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).not.toContain("CALENDAR_EVENT_ADDER");
		});

		test("returns multiple roles for user with multiple privileges", async () => {
			const { id } = await UserFactory.create(
				{},
				{
					patronTier: 2,
					plusTier: 2,
					roles: ["ARTIST", "VIDEO_ADDER"],
				},
			);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("SUPPORTER");
			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).toContain("PLUS_SERVER_MEMBER");
			expect(user?.roles).toContain("ARTIST");
			expect(user?.roles).toContain("VIDEO_ADDER");
			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});
	});

	describe("UserRepository.findStoredWidgetsByUserId", () => {
		const sixMainWidgets: Parameters<typeof UserFactory.create>[1] = {
			widgets: [
				{ id: "weapon-pool", settings: { weaponPool: [] } },
				{ id: "trophies-owned" },
				{ id: "badges-owned", settings: { favoriteBadgeIds: [] } },
				{ id: "badges-authored" },
				{ id: "badges-managed" },
				{ id: "builds" },
			],
		};

		test("returns all the widgets of a supporter", async () => {
			const { id } = await UserFactory.create(null, {
				...sixMainWidgets,
				patronTier: 2,
			});

			const widgets = await UserRepository.findStoredWidgetsByUserId(id);

			expect(widgets).toHaveLength(6);
		});

		test("truncates the widgets over the limit of a non supporter", async () => {
			const { id } = await UserFactory.create(null, sixMainWidgets);

			const widgets = await UserRepository.findStoredWidgetsByUserId(id);

			expect(widgets.map((widget) => widget.id)).toEqual([
				"weapon-pool",
				"trophies-owned",
				"badges-owned",
				"badges-authored",
			]);
		});
	});

	describe("UserRepository.findAllPatronsForFooter", () => {
		const patrons = UserFactory.pool();

		beforeEach(async () => {
			await patrons.create(15, null, { patronTier: 1 });
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test("returns the same order twice on the same UTC day", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2026-08-29T01:00:00Z"));

			const first = await UserRepository.findAllPatronsForFooter();

			vi.setSystemTime(new Date("2026-08-29T23:00:00Z"));

			const second = await UserRepository.findAllPatronsForFooter();

			expect(ids(first)).toEqual(ids(second));
		});

		test("shuffles into a new order when the UTC day changes", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2026-08-29T23:00:00Z"));

			const today = await UserRepository.findAllPatronsForFooter();

			vi.setSystemTime(new Date("2026-08-30T01:00:00Z"));

			const tomorrow = await UserRepository.findAllPatronsForFooter();

			expect(ids(today)).not.toEqual(ids(tomorrow));
			expect(ids(today).sort((a, b) => a - b)).toEqual(
				ids(tomorrow).sort((a, b) => a - b),
			);
		});
	});
	describe("UserRepository.updateOwnProfile", () => {
		const OLD_IN_GAME_NAME = "Old#1234";
		const NEW_IN_GAME_NAME = "New#1234";

		const users = UserFactory.pool();
		const playerId = () => users.id(1);
		const teammateId = () => users.id(2);
		const organizerId = () => users.id(3);

		beforeEach(async () => {
			await users.create(3, { profile: { inGameName: OLD_IN_GAME_NAME } });
		});

		const registerTo = async ({
			startsAt,
			requireInGameNames = true,
		}: {
			startsAt: Date;
			requireInGameNames?: boolean;
		}) => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
				startTimes: [dateToDatabaseTimestamp(startsAt)],
				requireInGameNames,
			});
			await TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [teammateId(), playerId()],
			});

			return tournament.id;
		};

		const updateInGameName = (inGameName: string | null) =>
			withUserId(playerId(), () =>
				UserRepository.updateOwnProfile({ inGameName }),
			);

		test("updates the in-game name of tournaments whose registration is still open", async () => {
			const upcomingTournamentId = await registerTo({
				startsAt: addDays(new Date(), 1),
			});
			const startedTournamentId = await registerTo({
				startsAt: subDays(new Date(), 1),
			});

			const { inGameNameUpdatedTournamentIds } =
				await updateInGameName(NEW_IN_GAME_NAME);

			expect(inGameNameUpdatedTournamentIds).toEqual([upcomingTournamentId]);
			expect(
				await memberInGameName({
					tournamentId: upcomingTournamentId,
					userId: playerId(),
				}),
			).toBe(NEW_IN_GAME_NAME);
			expect(
				await memberInGameName({
					tournamentId: startedTournamentId,
					userId: playerId(),
				}),
			).toBe(OLD_IN_GAME_NAME);
		});

		test("leaves the teammates' in-game names as they were", async () => {
			const tournamentId = await registerTo({
				startsAt: addDays(new Date(), 1),
			});

			await updateInGameName(NEW_IN_GAME_NAME);

			expect(
				await memberInGameName({ tournamentId, userId: teammateId() }),
			).toBe(OLD_IN_GAME_NAME);
		});

		test("sets no in-game name in a tournament not requiring one", async () => {
			const tournamentId = await registerTo({
				startsAt: addDays(new Date(), 1),
				requireInGameNames: false,
			});

			await updateInGameName(NEW_IN_GAME_NAME);

			expect(
				await memberInGameName({ tournamentId, userId: playerId() }),
			).toBeNull();
		});

		test("touches no tournament when the in-game name is removed", async () => {
			const tournamentId = await registerTo({
				startsAt: addDays(new Date(), 1),
			});

			const { inGameNameUpdatedTournamentIds } = await updateInGameName(null);

			expect(inGameNameUpdatedTournamentIds).toEqual([]);
			expect(await memberInGameName({ tournamentId, userId: playerId() })).toBe(
				OLD_IN_GAME_NAME,
			);
		});
	});

	describe("avatar", () => {
		const users = UserFactory.pool();
		const userId = () => users.id(1);

		beforeEach(async () => {
			await users.create(1, { discordAvatar: "hash" });
		});

		test("resolves to the synced avatar when the user has no custom one", async () => {
			const user = await UserRepository.findLeanById(userId());

			expect(user?.avatar).toBe(`avatar-${userId()}-hash.webp`);
		});

		test("resolves to the custom avatar over the synced one", async () => {
			const image = await ImageFactory.create(
				{ submitterUserId: userId(), url: "custom.webp" },
				{ isValidated: true },
			);
			await UserFactory.updateProfile(userId(), {
				customAvatarImgId: image.id,
			});

			const user = await UserRepository.findLeanById(userId());

			expect(user?.avatar).toBe("custom.webp");
		});
	});

	describe("UserRepository.replaceSyncedAvatar", () => {
		const users = UserFactory.pool();
		const userId = () => users.id(1);

		beforeEach(async () => {
			await users.create(1, { discordAvatar: "old" });
		});

		test("returns the previous file name and deletes its image row", async () => {
			const { syncedAvatarImgId: previousImgId } = await db
				.selectFrom("User")
				.select("syncedAvatarImgId")
				.where("id", "=", userId())
				.executeTakeFirstOrThrow();

			const previousFileName = await UserRepository.replaceSyncedAvatar({
				userId: userId(),
				discordAvatar: "new",
				fileName: `avatar-${userId()}-new.webp`,
			});

			expect(previousFileName).toBe(`avatar-${userId()}-old.webp`);
			expect(await ImageRepository.findById(previousImgId!)).toBeUndefined();
		});
	});
});

function ids(patrons: Array<{ id: number }>) {
	return patrons.map((patron) => patron.id);
}

async function memberInGameName({
	tournamentId,
	userId,
}: {
	tournamentId: number;
	userId: number;
}) {
	const member = await db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.select("TournamentTeamMember.inGameName")
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeamMember.userId", "=", userId)
		.executeTakeFirstOrThrow();

	return member.inGameName;
}
