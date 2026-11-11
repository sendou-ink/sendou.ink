import * as v from "valibot";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { adminRegistrationFormSchemaServer } from "./tournament-admin-registration-schemas.server";

const BAN = { banned: 1, bannedReason: null, bannedByUserId: null } as const;

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const captainId = () => users.id(2);

const createTournament = async (
	args: Partial<Parameters<typeof TournamentFactory.create>[0]> = {},
) => {
	const { id } = await TournamentFactory.create({
		authorId: organizerId(),
		...args,
	});

	return tournamentFromDB(id);
};

const memberIssues = async ({
	tournamentId,
	tournamentTeamId,
	members,
}: {
	tournamentId: number;
	tournamentTeamId?: number;
	members: Array<{ userId: number; inGameName?: string }>;
}) => {
	const tournament = await tournamentFromDB(tournamentId);
	const result = await v.safeParseAsync(
		adminRegistrationFormSchemaServer({ tournament }),
		{
			_action: "UPSERT_REGISTRATION",
			tournamentTeamId,
			linkedTeam: false,
			pickUpName: "Team Olive",
			logo: null,
			ownerId: String(members[0].userId),
			members: members.map((member) => ({
				userId: member.userId,
				inGameName: member.inGameName ?? null,
				tournamentName: null,
			})),
			mapPool: [],
		},
	);

	return (result.issues ?? [])
		.filter((issue) => issue.path?.[0]?.key === "members")
		.map((issue) => ({
			index: issue.path?.[1]?.key,
			message: issue.message,
		}));
};

describe("adminRegistrationFormSchemaServer", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("reports an unknown user as invalid", async () => {
		const tournament = await createTournament();

		expect(
			await memberIssues({
				tournamentId: tournament.ctx.id,
				members: [{ userId: captainId() }, { userId: 999_999 }],
			}),
		).toEqual([{ index: 1, message: "forms:errors.regMemberInvalid" }]);
	});

	test("reports a member without a friend code", async () => {
		const tournament = await createTournament();
		const withoutFriendCode = await UserFactory.create({ friendCode: null });

		expect(
			await memberIssues({
				tournamentId: tournament.ctx.id,
				members: [{ userId: captainId() }, { userId: withoutFriendCode.id }],
			}),
		).toEqual([{ index: 1, message: "forms:errors.regMemberNoFriendCode" }]);
	});

	test("accepts the in-game name given in the form in place of the profile's", async () => {
		const tournament = await createTournament({ requireInGameNames: true });
		const captain = await UserFactory.create({
			profile: { inGameName: "Captain#1234" },
		});
		const withoutInGameName = await UserFactory.create({ profile: null });

		expect(
			await memberIssues({
				tournamentId: tournament.ctx.id,
				members: [{ userId: captain.id }, { userId: withoutInGameName.id }],
			}),
		).toEqual([{ index: 1, message: "forms:errors.regMemberNoInGameName" }]);
		expect(
			await memberIssues({
				tournamentId: tournament.ctx.id,
				members: [
					{ userId: captain.id },
					{ userId: withoutInGameName.id, inGameName: "Player#1234" },
				],
			}),
		).toEqual([]);
	});

	test("reports a site-banned user being added but not one already on the team", async () => {
		const tournament = await createTournament();
		const bannedMember = await UserFactory.create();
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.ctx.id,
			memberUserIds: [captainId(), bannedMember.id],
		});
		const bannedNewcomer = await UserFactory.create();
		await UserFactory.grant(bannedMember.id, { ban: BAN });
		await UserFactory.grant(bannedNewcomer.id, { ban: BAN });
		await refreshBannedCache();

		expect(
			await memberIssues({
				tournamentId: tournament.ctx.id,
				tournamentTeamId: team.id,
				members: [
					{ userId: captainId() },
					{ userId: bannedMember.id },
					{ userId: bannedNewcomer.id },
				],
			}),
		).toEqual([{ index: 2, message: "forms:errors.regMemberBanned" }]);
	});

	test("lets organizers add a user their organization has banned", async () => {
		const bannedByOrganization = await UserFactory.create();
		const organization = await TournamentOrganizationFactory.create(
			{ ownerId: organizerId() },
			{ bannedUserIds: [bannedByOrganization.id] },
		);
		const tournament = await createTournament({
			organizationId: organization.id,
		});

		expect(
			await memberIssues({
				tournamentId: tournament.ctx.id,
				members: [{ userId: captainId() }, { userId: bannedByOrganization.id }],
			}),
		).toEqual([]);
	});
});
