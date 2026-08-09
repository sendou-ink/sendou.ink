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

let organizer: { id: number };
let owner: { id: number };
let member: { id: number };
let anotherMember: { id: number };

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
		[organizer, owner, member, anotherMember] = await UserFactory.createMany(4);
	});

	describe("upsertRegistration", () => {
		test("gives a new team's members their roles", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizer.id,
			});

			await withUserId(organizer.id, () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: owner.id,
					ownerChange: null,
					membersToAdd: [owner.id, member.id, anotherMember.id],
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
			expect(roleOf(members, owner.id)).toBe("OWNER");
			expect(roleOf(members, member.id)).toBe("REGULAR");
			expect(roleOf(members, anotherMember.id)).toBe("REGULAR");
		});

		test("added members of an existing team don't take the owner role", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizer.id,
			});
			const team = await TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [owner.id],
				team: { name: "Team Olive", prefersNotToHost: 0, teamId: null },
			});

			await withUserId(organizer.id, () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentTeamId: team.id,
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: owner.id,
					ownerChange: null,
					membersToAdd: [member.id, anotherMember.id],
					membersToRemove: [],
					inGameNameUpdates: [],
					tournamentNameUpdates: [],
				}),
			);

			const members = await membersByTeamId(team.id);

			expect(members).toHaveLength(3);
			expect(roleOf(members, owner.id)).toBe("OWNER");
			expect(roleOf(members, member.id)).toBe("REGULAR");
			expect(roleOf(members, anotherMember.id)).toBe("REGULAR");
		});

		test("marks added members as organizer added", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizer.id,
			});

			await withUserId(organizer.id, () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: owner.id,
					ownerChange: null,
					membersToAdd: [owner.id, member.id],
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
				authorId: organizer.id,
			});

			const { appliedTournamentNameChanges } = await withUserId(
				organizer.id,
				() =>
					TournamentTeamRepository.upsertRegistration({
						tournamentId: tournament.id,
						name: "Team Olive",
						teamId: null,
						avatarImgId: null,
						ownerUserId: owner.id,
						ownerChange: null,
						membersToAdd: [owner.id, member.id],
						membersToRemove: [],
						inGameNameUpdates: [],
						tournamentNameUpdates: [
							{ userId: owner.id, tournamentName: "Sendou" },
							{ userId: member.id, tournamentName: null },
						],
					}),
			);

			expect(appliedTournamentNameChanges).toEqual([
				{
					userId: owner.id,
					previousTournamentName: null,
					tournamentName: "Sendou",
				},
			]);
			expect(await tournamentNameOf(owner.id)).toBe("Sendou");
			expect(await tournamentNameOf(member.id)).toBeNull();
		});

		test("logs a tournament name change in the audit log", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizer.id,
			});

			await withUserId(organizer.id, () =>
				TournamentTeamRepository.upsertRegistration({
					tournamentId: tournament.id,
					name: "Team Olive",
					teamId: null,
					avatarImgId: null,
					ownerUserId: owner.id,
					ownerChange: null,
					membersToAdd: [owner.id],
					membersToRemove: [],
					inGameNameUpdates: [],
					tournamentNameUpdates: [
						{ userId: owner.id, tournamentName: "Sendou" },
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
			expect(events[0].actorUserId).toBe(organizer.id);
			expect(events[0].subjectUserId).toBe(owner.id);
			expect(events[0].metadata?.tournamentName).toBe("Sendou");
		});

		test("does not touch a tournament name that did not change", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizer.id,
			});
			const team = await TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [owner.id],
				team: { name: "Team Olive", prefersNotToHost: 0, teamId: null },
			});

			const upsert = (tournamentName: string) =>
				withUserId(organizer.id, () =>
					TournamentTeamRepository.upsertRegistration({
						tournamentTeamId: team.id,
						tournamentId: tournament.id,
						name: "Team Olive",
						teamId: null,
						avatarImgId: null,
						ownerUserId: owner.id,
						ownerChange: null,
						membersToAdd: [],
						membersToRemove: [],
						inGameNameUpdates: [],
						tournamentNameUpdates: [{ userId: owner.id, tournamentName }],
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
				authorId: organizer.id,
			});
			const team = await TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [owner.id],
				team: { name: "Team Olive", prefersNotToHost: 0, teamId: null },
			});

			await withUserId(member.id, () =>
				TournamentTeamRepository.join({
					newTeamId: team.id,
					userId: member.id,
				}),
			);

			const members = await membersByTeamId(team.id);

			expect(
				members.find((teamMember) => teamMember.userId === member.id)
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
					authorId: organizer.id,
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
