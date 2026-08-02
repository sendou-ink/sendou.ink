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
		.select(["TournamentTeamMember.userId", "TournamentTeamMember.role"])
		.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
		.execute();

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
				}),
			);

			const members = await membersByTeamId(team.id);

			expect(members).toHaveLength(3);
			expect(roleOf(members, owner.id)).toBe("OWNER");
			expect(roleOf(members, member.id)).toBe("REGULAR");
			expect(roleOf(members, anotherMember.id)).toBe("REGULAR");
		});
	});
});
