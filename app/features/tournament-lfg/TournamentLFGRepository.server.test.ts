import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "~/db/seed/factories/TournamentLFGTeamFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { withUserId } from "~/utils/Test";
import * as TournamentLFGRepository from "./TournamentLFGRepository.server";

const users = UserFactory.pool();

const createTournament = () =>
	TournamentFactory.create({ authorId: users.id(1) });

const createPlaceholder = (tournamentId: number, userId: number) =>
	TournamentLFGTeamFactory.create({ tournamentId, userId });

describe("insertPlaceholderTeam", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("creates a placeholder team with owner member", async () => {
		const tournament = await createTournament();
		const team = await TournamentLFGRepository.insertPlaceholderTeam({
			tournamentId: tournament.id,
			userId: users.id(1),
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe(team.id);
	});

	test("owner has OWNER role", async () => {
		const tournament = await createTournament();
		await TournamentLFGRepository.insertPlaceholderTeam({
			tournamentId: tournament.id,
			userId: users.id(1),
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members[0].role).toBe("OWNER");
	});
});

describe("findLookingTeamsByTournamentId", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("returns looking teams for given tournament", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, users.id(1));
		await createPlaceholder(tournament.id, users.id(2));

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(2);
	});

	test("returns empty array when no looking teams exist", async () => {
		const tournament = await createTournament();

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);
	});

	test("returns groups with member data", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, users.id(1));

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members[0].id).toBe(users.id(1));
		expect(members[0].username).toBeDefined();
		expect(members[0].role).toBe("OWNER");
	});

	test("does not return teams from other tournaments", async () => {
		const tournament1 = await createTournament();
		const tournament2 = await createTournament();
		await createPlaceholder(tournament1.id, users.id(1));
		await createPlaceholder(tournament2.id, users.id(2));

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament1.id,
		);

		expect(groups).toHaveLength(1);
	});
});

describe("insertLike / deleteLike", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("adds a like between two teams", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		await TournamentLFGRepository.insertLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});

		const likes = await TournamentLFGRepository.findAllLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(1);
		expect(likes.given[0].teamId).toBe(team2.id);
	});

	test("duplicate like does not throw", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		await TournamentLFGRepository.insertLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});
		await TournamentLFGRepository.insertLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});

		const likes = await TournamentLFGRepository.findAllLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(1);
	});

	test("deleteLike removes the like", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		await TournamentLFGRepository.insertLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});
		await TournamentLFGRepository.deleteLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});

		const likes = await TournamentLFGRepository.findAllLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(0);
	});
});

describe("findAllLikesByTeamId", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("separates likes into given and received", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));
		const team3 = await createPlaceholder(tournament.id, users.id(3));

		await TournamentLFGRepository.insertLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});
		await TournamentLFGRepository.insertLike({
			likerTeamId: team3.id,
			targetTeamId: team1.id,
		});

		const likes = await TournamentLFGRepository.findAllLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(1);
		expect(likes.given[0].teamId).toBe(team2.id);
		expect(likes.received).toHaveLength(1);
		expect(likes.received[0].teamId).toBe(team3.id);
	});

	test("returns empty given/received when no likes", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, users.id(1));

		const likes = await TournamentLFGRepository.findAllLikesByTeamId(team.id);

		expect(likes.given).toHaveLength(0);
		expect(likes.received).toHaveLength(0);
	});
});

describe("startLooking", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("generates chatCode for a 2+ member team", async () => {
		const tournament = await createTournament();
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [users.id(1), users.id(2)],
		});

		const pickup = await TournamentLFGRepository.startLooking(team.id);

		expect(pickup).not.toBeNull();
		expect(pickup?.chatCode).toMatch(/.+/);
		expect(pickup?.memberUserIds.sort()).toEqual(
			[users.id(1), users.id(2)].sort(),
		);

		const row = await db
			.selectFrom("TournamentTeam")
			.select("chatCode")
			.where("id", "=", team.id)
			.executeTakeFirstOrThrow();
		expect(row.chatCode).toBe(pickup?.chatCode);
	});

	test("returns null when team has only 1 member", async () => {
		const tournament = await createTournament();
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [users.id(1)],
		});

		const pickup = await TournamentLFGRepository.startLooking(team.id);

		expect(pickup).toBeNull();

		const row = await db
			.selectFrom("TournamentTeam")
			.select("chatCode")
			.where("id", "=", team.id)
			.executeTakeFirstOrThrow();
		expect(row.chatCode).toBeNull();
	});

	test("reuses existing chatCode if already set", async () => {
		const tournament = await createTournament();
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [users.id(1), users.id(2)],
		});
		// the only production write of the column is `startLooking` itself, which
		// invents a random code
		// biome-ignore lint/plugin: no production write sets a known chatCode
		await db
			.updateTable("TournamentTeam")
			.set({ chatCode: "existing-code" })
			.where("id", "=", team.id)
			.execute();

		const pickup = await TournamentLFGRepository.startLooking(team.id);

		expect(pickup?.chatCode).toBe("existing-code");
	});
});

describe("mergeTeams", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("merges two teams, other team is deleted", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe(team1.id);
		const members = groups[0].members;
		expect(members).toHaveLength(2);
	});

	test("demotes other team's OWNER to MANAGER", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;
		const user2Member = members.find((m) => m.id === users.id(2));

		expect(user2Member?.role).toBe("MANAGER");
	});

	test("throws when merged size exceeds maxGroupSize", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		await expect(
			TournamentLFGRepository.mergeTeams({
				survivingTeamId: team1.id,
				otherTeamId: team2.id,
				maxGroupSize: 1,
			}),
		).rejects.toThrow("Group has too many members after merge");
	});

	test("stops looking when merged team reaches max capacity", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 2,
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);
	});

	test("survivor gets a chatCode when merged size is 2+", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		const result = await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		expect(result.survivor).not.toBeNull();
		expect(result.survivor?.chatCode).toMatch(/.+/);
		expect(result.survivor?.memberUserIds.sort()).toEqual(
			[users.id(1), users.id(2)].sort(),
		);
		expect(result.removedChatCode).toBeNull();

		const row = await db
			.selectFrom("TournamentTeam")
			.select("chatCode")
			.where("id", "=", team1.id)
			.executeTakeFirstOrThrow();
		expect(row.chatCode).toBe(result.survivor?.chatCode);
	});

	test("returns removedChatCode when other team had a chatCode", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		// biome-ignore lint/plugin: as above, a known chatCode has no production write
		await db
			.updateTable("TournamentTeam")
			.set({ chatCode: "other-code" })
			.where("id", "=", team2.id)
			.execute();

		const result = await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		expect(result.removedChatCode).toBe("other-code");
	});

	test("clears likes on surviving team after merge", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));
		const team3 = await createPlaceholder(tournament.id, users.id(3));

		await TournamentLFGRepository.insertLike({
			likerTeamId: team1.id,
			targetTeamId: team3.id,
		});
		await TournamentLFGRepository.insertLike({
			likerTeamId: team3.id,
			targetTeamId: team1.id,
		});

		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		const likes = await TournamentLFGRepository.findAllLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(0);
		expect(likes.received).toHaveLength(0);
	});

	test("resets createdAt of merged-in members so they sort after survivors", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, users.id(1));
		const team2 = await createPlaceholder(tournament.id, users.id(2));

		// user 2 was looking before user 1 i.e. has an older createdAt. The column
		// defaults in SQL, and the table has no id of its own for `backdate` to key on
		// biome-ignore lint/plugin: no production write sets the timestamp
		await db
			.updateTable("TournamentTeamMember")
			.set({ createdAt: 1000 })
			.where("tournamentTeamId", "=", team2.id)
			.where("userId", "=", users.id(2))
			.execute();

		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		const mergedMember = await db
			.selectFrom("TournamentTeamMember")
			.select("createdAt")
			.where("tournamentTeamId", "=", team1.id)
			.where("userId", "=", users.id(2))
			.executeTakeFirstOrThrow();

		expect(mergedMember.createdAt).toBeGreaterThan(1000);
	});
});

describe("updateTeamNote", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("sets and clears a team note", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, users.id(1));

		await TournamentLFGRepository.updateTeamNote({
			teamId: team.id,
			value: "Looking for support",
		});

		let groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		expect(groups[0].note).toBe("Looking for support");

		await TournamentLFGRepository.updateTeamNote({
			teamId: team.id,
			value: null,
		});

		groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		expect(groups[0].note).toBeNull();
	});
});

describe("updateMemberRole", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("changes role from REGULAR to MANAGER", async () => {
		const tournament = await createTournament();
		const team = await TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: [users.id(1), users.id(2)],
			},
			{ isLooking: true },
		);

		await TournamentLFGRepository.updateMemberRole({
			userId: users.id(2),
			teamId: team.id,
			role: "MANAGER",
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;
		const user2Member = members.find((m) => m.id === users.id(2));

		expect(user2Member?.role).toBe("MANAGER");
	});

	test("throws when attempting to set OWNER role", () => {
		expect(() =>
			TournamentLFGRepository.updateMemberRole({
				userId: users.id(1),
				teamId: 1,
				role: "OWNER",
			}),
		).toThrow("Can't set role to OWNER with this function");
	});
});

describe("updateStayAsSub", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("toggles isStayAsSub on/off", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, users.id(1));

		await withUserId(users.id(1), () =>
			TournamentLFGRepository.updateOwnStayAsSub({
				teamId: team.id,
				value: true,
			}),
		);

		let subs = await TournamentLFGRepository.findAllSubsByTournamentId(
			tournament.id,
		);
		expect(subs).toContain(users.id(1));

		await withUserId(users.id(1), () =>
			TournamentLFGRepository.updateOwnStayAsSub({
				teamId: team.id,
				value: false,
			}),
		);

		subs = await TournamentLFGRepository.findAllSubsByTournamentId(
			tournament.id,
		);
		expect(subs).not.toContain(users.id(1));
	});
});

describe("leaveLfg", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("deletes placeholder team when last member leaves", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, users.id(1));

		await TournamentLFGRepository.leaveLfg({
			userId: users.id(1),
			tournamentId: tournament.id,
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);
	});

	test("sets isLooking=0 for non-placeholder team", async () => {
		const tournament = await createTournament();

		const team = await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [users.id(1)] },
			{ isLooking: true },
		);

		await TournamentLFGRepository.leaveLfg({
			userId: users.id(1),
			tournamentId: tournament.id,
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);

		const teamRow = await db
			.selectFrom("TournamentTeam")
			.select("isLooking")
			.where("id", "=", team.id)
			.executeTakeFirstOrThrow();

		expect(teamRow.isLooking).toBe(0);
	});
});

describe("findAllSubsByTournamentId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("returns userIds with isStayAsSub", async () => {
		const tournament = await createTournament();
		await TournamentLFGTeamFactory.create({
			tournamentId: tournament.id,
			userId: users.id(1),
			isStayAsSub: true,
		});
		await createPlaceholder(tournament.id, users.id(2));

		const subs = await TournamentLFGRepository.findAllSubsByTournamentId(
			tournament.id,
		);

		expect(subs).toEqual([users.id(1)]);
	});

	test("returns empty when nobody opted in", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, users.id(1));

		const subs = await TournamentLFGRepository.findAllSubsByTournamentId(
			tournament.id,
		);

		expect(subs).toHaveLength(0);
	});
});
