import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { withUserId } from "~/utils/Test";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

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
});
