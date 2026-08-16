import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentSettings } from "~/db/tables-json";
import { withUserId } from "~/utils/Test";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

const TEAM_COUNT = 4;

/** Pools of two teams each, followed by a final between the two pool winners. */
const POOLS_TO_FINAL: TournamentSettings["bracketProgression"] = [
	{
		name: "Pools",
		type: "round_robin",
		requiresCheckIn: false,
		settings: { teamsPerGroup: 2 },
	},
	{
		name: "Final",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: { thirdPlaceMatch: false },
		sources: [{ bracketIdx: 0, placements: [1] }],
	},
];

const POOL_MAPS: TournamentFactory.RoundMaps = {
	count: 1,
	type: "BEST_OF",
	list: [{ mode: "SZ", stageId: 1 }],
};
const FINAL_MAPS: TournamentFactory.RoundMaps = {
	count: 1,
	type: "BEST_OF",
	list: [{ mode: "TC", stageId: 2 }],
};

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const ownerId = () => users.id(2);
const memberId = () => users.id(3);
const anotherMemberId = () => users.id(4);

const membersByTeamId = (tournamentTeamId: number) =>
	db
		.selectFrom("TournamentTeamMember")
		.select([
			"TournamentTeamMember.userId",
			"TournamentTeamMember.role",
			"TournamentTeamMember.isOrganizerAdded",
		])
		.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
		.execute();

const tournamentNameOf = async (userId: number) =>
	(
		await db
			.selectFrom("User")
			.select("User.tournamentName")
			.where("User.id", "=", userId)
			.executeTakeFirstOrThrow()
	).tournamentName;

const roleOf = (
	members: Array<{ userId: number; role: string }>,
	userId: number,
) => members.find((teamMember) => teamMember.userId === userId)?.role;

describe("TournamentTeamRepository", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	describe("upsertRegistration", () => {
		test("gives a new team's members their roles", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
			});

			await withUserId(organizerId(), () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: ownerId(),
					ownerChange: null,
					membersToAdd: [ownerId(), memberId(), anotherMemberId()],
					membersToRemove: [],
					inGameNameUpdates: [],
					tournamentNameUpdates: [],
				}),
			);

			const team = await db
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.id")
				.where("TournamentTeam.tournamentId", "=", tournament.id)
				.executeTakeFirstOrThrow();

			const members = await membersByTeamId(team.id);

			expect(members).toHaveLength(3);
			expect(roleOf(members, ownerId())).toBe("OWNER");
			expect(roleOf(members, memberId())).toBe("REGULAR");
			expect(roleOf(members, anotherMemberId())).toBe("REGULAR");
		});

		test("added members of an existing team don't take the owner role", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
			});
			const team = await TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [ownerId()],
				team: { name: "Team Olive", prefersNotToHost: 0, teamId: null },
			});

			await withUserId(organizerId(), () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentTeamId: team.id,
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: ownerId(),
					ownerChange: null,
					membersToAdd: [memberId(), anotherMemberId()],
					membersToRemove: [],
					inGameNameUpdates: [],
					tournamentNameUpdates: [],
				}),
			);

			const members = await membersByTeamId(team.id);

			expect(members).toHaveLength(3);
			expect(roleOf(members, ownerId())).toBe("OWNER");
			expect(roleOf(members, memberId())).toBe("REGULAR");
			expect(roleOf(members, anotherMemberId())).toBe("REGULAR");
		});

		test("marks added members as organizer added", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
			});

			await withUserId(organizerId(), () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: ownerId(),
					ownerChange: null,
					membersToAdd: [ownerId(), memberId()],
					membersToRemove: [],
					inGameNameUpdates: [],
					tournamentNameUpdates: [],
				}),
			);

			const team = await db
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.id")
				.where("TournamentTeam.tournamentId", "=", tournament.id)
				.executeTakeFirstOrThrow();

			const members = await membersByTeamId(team.id);

			expect(members.every((teamMember) => teamMember.isOrganizerAdded)).toBe(
				true,
			);
		});

		test("updates tournament names of members", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
			});

			const { appliedTournamentNameChanges } = await withUserId(
				organizerId(),
				() =>
					TournamentTeamRepository.upsertRegistration({
						tournamentId: tournament.id,
						name: "Team Olive",
						teamId: null,
						avatarImgId: null,
						ownerUserId: ownerId(),
						ownerChange: null,
						membersToAdd: [ownerId(), memberId()],
						membersToRemove: [],
						inGameNameUpdates: [],
						tournamentNameUpdates: [
							{ userId: ownerId(), tournamentName: "Sendou" },
							{ userId: memberId(), tournamentName: null },
						],
					}),
			);

			expect(appliedTournamentNameChanges).toEqual([
				{
					userId: ownerId(),
					previousTournamentName: null,
					tournamentName: "Sendou",
				},
			]);
			expect(await tournamentNameOf(ownerId())).toBe("Sendou");
			expect(await tournamentNameOf(memberId())).toBeNull();
		});

		test("logs a tournament name change in the audit log", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
			});

			await withUserId(organizerId(), () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: ownerId(),
					ownerChange: null,
					membersToAdd: [ownerId()],
					membersToRemove: [],
					inGameNameUpdates: [],
					tournamentNameUpdates: [
						{ userId: ownerId(), tournamentName: "Sendou" },
					],
				}),
			);

			const events = await db
				.selectFrom("TournamentAuditLog")
				.select([
					"TournamentAuditLog.actorUserId",
					"TournamentAuditLog.subjectUserId",
					"TournamentAuditLog.metadata",
				])
				.where("TournamentAuditLog.type", "=", "UPDATE_TOURNAMENT_NAME")
				.execute();

			expect(events).toHaveLength(1);
			expect(events[0].actorUserId).toBe(organizerId());
			expect(events[0].subjectUserId).toBe(ownerId());
			expect(events[0].metadata?.tournamentName).toBe("Sendou");
		});

		test("does not touch a tournament name that did not change", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
			});
			const team = await TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [ownerId()],
				team: { name: "Team Olive", prefersNotToHost: 0, teamId: null },
			});

			const upsert = (tournamentName: string) =>
				withUserId(organizerId(), () =>
					TournamentTeamRepository.upsertRegistration({
						tournamentTeamId: team.id,
						tournamentId: tournament.id,
						name: "Team Olive",
						teamId: null,
						avatarImgId: null,
						ownerUserId: ownerId(),
						ownerChange: null,
						membersToAdd: [],
						membersToRemove: [],
						inGameNameUpdates: [],
						tournamentNameUpdates: [{ userId: ownerId(), tournamentName }],
					}),
				);

			await upsert("Sendou");
			const { appliedTournamentNameChanges } = await upsert("Sendou");

			expect(appliedTournamentNameChanges).toEqual([]);

			const events = await db
				.selectFrom("TournamentAuditLog")
				.select("TournamentAuditLog.id")
				.where("TournamentAuditLog.type", "=", "UPDATE_TOURNAMENT_NAME")
				.execute();

			expect(events).toHaveLength(1);
		});
	});

	describe("join", () => {
		test("joining on your own is not marked as organizer added", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
			});
			const team = await TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [ownerId()],
				team: { name: "Team Olive", prefersNotToHost: 0, teamId: null },
			});

			await withUserId(memberId(), () =>
				TournamentTeamRepository.join({
					newTeamId: team.id,
					userId: memberId(),
				}),
			);

			const members = await membersByTeamId(team.id);

			expect(
				members.find((teamMember) => teamMember.userId === memberId())
					?.isOrganizerAdded,
			).toBe(0);
		});
	});

	describe("findRecentlyPlayedMapsByIds", () => {
		test("leaves out the games of the match the maps are resolved for", async () => {
			// the map list of an in-progress set is regenerated whenever its cache entry
			// is lost, so counting the set's own games as recently played would change
			// the maps the teams have left to play under them
			const players = await UserFactory.createMany(TEAM_COUNT);
			const tournament = await TournamentFactory.createPlayed(
				{
					authorId: organizerId(),
					bracketProgression: POOLS_TO_FINAL,
					minMembersPerTeam: 1,
				},
				{
					teamRosters: players.map((player) => [player.id]),
					playedOut: 0,
					maps: POOL_MAPS,
				},
			);
			const [final] = await TournamentFactory.playOut(tournament.id, 1, {
				maps: FINAL_MAPS,
			});

			const recentMaps =
				await TournamentTeamRepository.findRecentlyPlayedMapsByIds({
					teamIds: [final.winnerTeamId, final.loserTeamId],
					excludeMatchId: final.id,
				});

			expect(recentMaps).toEqual([
				{ mode: "SZ", stageId: 1 },
				{ mode: "SZ", stageId: 1 },
			]);
		});
	});
});
