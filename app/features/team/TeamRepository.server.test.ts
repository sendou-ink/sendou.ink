import { beforeEach, describe, expect, test } from "vitest";
import { actAs } from "~/db/seed/core/actAs";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as FeedRepository from "~/features/feed/FeedRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import * as TeamRepository from "./TeamRepository.server";
import { TEAM } from "./team-constants";
import { resolveNewOwner } from "./team-utils";

describe("findResultsById", () => {
	const seedTeamResult = async ({ div }: { div: string | null }) => {
		const [owner, formerMember] = await UserFactory.createMany(2);
		const team = await TeamFactory.create({
			memberUserIds: [owner.id, formerMember.id],
		});

		const tournament = await TournamentFactory.create({ authorId: owner.id });
		const tournamentTeam = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [owner.id, formerMember.id],
			team: {
				name: team.name,
				prefersNotToHost: 0,
				teamId: team.id,
			},
		});

		await TournamentRepository.finalize({
			tournamentId: tournament.id,
			season: undefined,
			summary: {
				skills: [],
				seedingSkills: [],
				mapResultDeltas: [],
				playerResultDeltas: [],
				tournamentResults: [owner.id, formerMember.id].map((userId) => ({
					userId,
					placement: 1,
					participantCount: 8,
					tournamentTeamId: tournamentTeam.id,
					div,
				})),
				setResults: new Map(),
			},
		});

		return { team, tournament, formerMember };
	};

	test("participant who was on the roster at the result's time but left later is not a sub", async () => {
		const { team, tournament, formerMember } = await seedTeamResult({
			div: null,
		});

		const { startsAt } = await db
			.selectFrom("CalendarEventDate")
			.select("startsAt")
			.where("eventId", "=", tournament.eventId)
			.executeTakeFirstOrThrow();

		// biome-ignore lint/plugin: a membership spanning a past event start only arises with the passage of time; `backdate` can't address AllTeamMember as it has no id column
		await db
			.updateTable("AllTeamMember")
			.set({ createdAt: startsAt - 1000, leftAt: startsAt + 1000 })
			.where("teamId", "=", team.id)
			.where("userId", "=", formerMember.id)
			.execute();

		const results = await TeamRepository.findResultsById(team.id);

		expect(results).toHaveLength(1);
		expect(results[0].subs).toHaveLength(0);
	});

	test("returns the division the team placed in", async () => {
		const { team } = await seedTeamResult({ div: "D2" });

		const results = await TeamRepository.findResultsById(team.id);

		expect(results[0].div).toBe("D2");
	});
});

describe("insertOwnMembership", () => {
	const users = UserFactory.pool();
	const ownerId = () => users.id(1);
	const rejoinerId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	const leaveAndRejoin = async (teamId: number) => {
		await TeamRepository.handleMemberLeaving({ userId: rejoinerId(), teamId });
		await actAs(rejoinerId(), () =>
			TeamRepository.insertOwnMembership({
				teamId,
				maxTeamsAllowed: TEAM.MAX_TEAM_COUNT_NON_PATRON,
			}),
		);
	};

	test.each([
		{ why: "preset role", role: "COACH" as const },
		{
			why: "custom role",
			role: { customRole: "Analyst", roleType: "OTHER" as const },
		},
	])("a rejoining member does not get their $why back", async ({ role }) => {
		const team = await TeamFactory.create(
			{ memberUserIds: [ownerId(), rejoinerId()] },
			{ roles: { [rejoinerId()]: role } },
		);

		await leaveAndRejoin(team.id);

		const rejoiner = (
			await TeamRepository.findByCustomUrl(team.customUrl)
		)?.members.find((member) => member.id === rejoinerId());
		expect(rejoiner).toMatchObject({
			role: null,
			customRole: null,
			roleType: null,
		});
	});

	test("a rejoin counts as a fresh team join", async () => {
		const team = await TeamFactory.create({
			memberUserIds: [ownerId(), rejoinerId()],
		});
		const firstJoinedAt = databaseTimestampNow() - 60 * 60 * 24 * 30;
		// biome-ignore lint/plugin: a membership from a month ago only arises with the passage of time; `backdate` can't address AllTeamMember as it has no id column
		await db
			.updateTable("AllTeamMember")
			.set({ createdAt: firstJoinedAt })
			.where("teamId", "=", team.id)
			.where("userId", "=", rejoinerId())
			.execute();

		await leaveAndRejoin(team.id);

		const joins = await FeedRepository.findAllTeamJoinsAfter(
			databaseTimestampNow() - 60,
		);
		expect(joins.map((join) => join.userId)).toContain(rejoinerId());
	});
});

describe("findAllByMemberUserId", () => {
	test("returns the main team first", async () => {
		const user = await UserFactory.create();
		await TeamFactory.create({
			name: "Secondary team",
			isMainTeam: false,
			memberUserIds: [user.id],
		});
		await TeamFactory.create({
			name: "Main team",
			isMainTeam: true,
			memberUserIds: [user.id],
		});

		const teams = await TeamRepository.findAllByMemberUserId(user.id);

		expect(teams.map((team) => team.name)).toEqual([
			"Main team",
			"Secondary team",
		]);
	});
});

describe("transferOwnership", () => {
	const users = UserFactory.pool();
	const ownerId = () => users.id(1);
	const newOwnerId = () => users.id(2);
	const otherMemberId = () => users.id(3);
	const outsiderId = () => users.id(4);

	beforeEach(async () => {
		await users.create(4);
	});

	const createTeam = () =>
		TeamFactory.create(
			{ memberUserIds: [ownerId(), newOwnerId(), otherMemberId()] },
			{ managerUserIds: [newOwnerId()] },
		);

	const membersOf = async (customUrl: string) => {
		const team = await TeamRepository.findByCustomUrl(customUrl);
		invariant(team, `No team with the custom url ${customUrl}`);

		return team.members;
	};

	const flagsOf = (
		members: Awaited<ReturnType<typeof membersOf>>,
		userId: number,
	) => {
		const member = members.find((m) => m.id === userId);
		invariant(member, `User ${userId} is not a member`);

		return { isOwner: member.isOwner, isManager: member.isManager };
	};

	test("makes the new owner owner and keeps the old owner on as a manager", async () => {
		const team = await createTeam();

		await TeamRepository.transferOwnership({
			teamId: team.id,
			oldOwnerUserId: ownerId(),
			newOwnerUserId: newOwnerId(),
		});

		const members = await membersOf(team.customUrl);
		expect(members).toHaveLength(3);
		expect(flagsOf(members, newOwnerId())).toEqual({
			isOwner: 1,
			isManager: 0,
		});
		expect(flagsOf(members, ownerId())).toEqual({ isOwner: 0, isManager: 1 });
		expect(flagsOf(members, otherMemberId())).toEqual({
			isOwner: 0,
			isManager: 0,
		});
	});

	test("does not touch the user's memberships of other teams", async () => {
		const team = await createTeam();
		const otherTeam = await TeamFactory.create({
			name: "Other team",
			isMainTeam: false,
			memberUserIds: [ownerId(), newOwnerId()],
		});

		await TeamRepository.transferOwnership({
			teamId: team.id,
			oldOwnerUserId: ownerId(),
			newOwnerUserId: newOwnerId(),
		});

		const otherTeamMembers = await membersOf(otherTeam.customUrl);
		expect(flagsOf(otherTeamMembers, ownerId()).isOwner).toBe(1);
		expect(flagsOf(otherTeamMembers, newOwnerId()).isOwner).toBe(0);
	});

	test("rejects a new owner who is not a member", async () => {
		const team = await createTeam();

		await expect(
			TeamRepository.transferOwnership({
				teamId: team.id,
				oldOwnerUserId: ownerId(),
				newOwnerUserId: outsiderId(),
			}),
		).rejects.toThrow();

		const members = await membersOf(team.customUrl);
		expect(flagsOf(members, ownerId()).isOwner).toBe(1);
	});

	test("the new owner is the one who is replaced when they leave", async () => {
		const team = await createTeam();

		await TeamRepository.transferOwnership({
			teamId: team.id,
			oldOwnerUserId: ownerId(),
			newOwnerUserId: newOwnerId(),
		});
		const successor = resolveNewOwner(await membersOf(team.customUrl));

		expect(successor?.id).toBe(ownerId());
	});
});
