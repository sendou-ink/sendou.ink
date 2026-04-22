import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as TournamentLFGRepository from "./TournamentLFGRepository.server";

const createTournament = () =>
	db
		.insertInto("Tournament")
		.values({
			mapPickingStyle: "TO",
			settings: JSON.stringify({ bracketProgression: [] }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createPlaceholder = (tournamentId: number, userId: number) =>
	TournamentLFGRepository.createPlaceholderTeam({ tournamentId, userId });

describe("createPlaceholderTeam", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("creates a placeholder team with owner member", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, 1);

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe(team.id);
	});

	test("owner has OWNER role", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, 1);

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members[0].role).toBe("OWNER");
	});
});

describe("findLookingTeamsByTournamentId", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns looking teams for given tournament", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, 1);
		await createPlaceholder(tournament.id, 2);

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
		await createPlaceholder(tournament.id, 1);

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members[0].id).toBe(1);
		expect(members[0].username).toBeDefined();
		expect(members[0].role).toBe("OWNER");
	});

	test("does not return teams from other tournaments", async () => {
		const tournament1 = await createTournament();
		const tournament2 = await createTournament();
		await createPlaceholder(tournament1.id, 1);
		await createPlaceholder(tournament2.id, 2);

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament1.id,
		);

		expect(groups).toHaveLength(1);
	});
});

describe("addLike / deleteLike", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("adds a like between two teams", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

		await TournamentLFGRepository.addLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});

		const likes = await TournamentLFGRepository.allLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(1);
		expect(likes.given[0].teamId).toBe(team2.id);
	});

	test("duplicate like does not throw", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

		await TournamentLFGRepository.addLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});
		await TournamentLFGRepository.addLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});

		const likes = await TournamentLFGRepository.allLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(1);
	});

	test("deleteLike removes the like", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

		await TournamentLFGRepository.addLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});
		await TournamentLFGRepository.deleteLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});

		const likes = await TournamentLFGRepository.allLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(0);
	});
});

describe("allLikesByTeamId", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("separates likes into given and received", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);
		const team3 = await createPlaceholder(tournament.id, 3);

		await TournamentLFGRepository.addLike({
			likerTeamId: team1.id,
			targetTeamId: team2.id,
		});
		await TournamentLFGRepository.addLike({
			likerTeamId: team3.id,
			targetTeamId: team1.id,
		});

		const likes = await TournamentLFGRepository.allLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(1);
		expect(likes.given[0].teamId).toBe(team2.id);
		expect(likes.received).toHaveLength(1);
		expect(likes.received[0].teamId).toBe(team3.id);
	});

	test("returns empty given/received when no likes", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, 1);

		const likes = await TournamentLFGRepository.allLikesByTeamId(team.id);

		expect(likes.given).toHaveLength(0);
		expect(likes.received).toHaveLength(0);
	});
});

describe("startLooking", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	const createRegisteredTeam = async (
		tournamentId: number,
		memberUserIds: number[],
	) => {
		const team = await db
			.insertInto("TournamentTeam")
			.values({
				tournamentId,
				name: "Real Team",
				inviteCode: `inv-${tournamentId}-${memberUserIds.join("-")}`,
				isLooking: 0,
				isPlaceholder: 0,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		for (const [idx, userId] of memberUserIds.entries()) {
			await db
				.insertInto("TournamentTeamMember")
				.values({
					tournamentTeamId: team.id,
					userId,
					role: idx === 0 ? "OWNER" : "REGULAR",
				})
				.execute();
		}

		return team;
	};

	test("generates chatCode for a 2+ member team", async () => {
		const tournament = await createTournament();
		const team = await createRegisteredTeam(tournament.id, [1, 2]);

		const pickup = await TournamentLFGRepository.startLooking(team.id);

		expect(pickup).not.toBeNull();
		expect(pickup?.chatCode).toMatch(/.+/);
		expect(pickup?.memberUserIds.sort()).toEqual([1, 2]);

		const row = await db
			.selectFrom("TournamentTeam")
			.select("chatCode")
			.where("id", "=", team.id)
			.executeTakeFirstOrThrow();
		expect(row.chatCode).toBe(pickup?.chatCode);
	});

	test("returns null when team has only 1 member", async () => {
		const tournament = await createTournament();
		const team = await createRegisteredTeam(tournament.id, [1]);

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
		const team = await createRegisteredTeam(tournament.id, [1, 2]);
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
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("merges two teams, other team is deleted", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

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
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;
		const user2Member = members.find((m) => m.id === 2);

		expect(user2Member?.role).toBe("MANAGER");
	});

	test("throws when merged size exceeds maxGroupSize", async () => {
		const tournament = await createTournament();
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

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
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

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
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

		const result = await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		expect(result.survivor).not.toBeNull();
		expect(result.survivor?.chatCode).toMatch(/.+/);
		expect(result.survivor?.memberUserIds.sort()).toEqual([1, 2]);
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
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);

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
		const team1 = await createPlaceholder(tournament.id, 1);
		const team2 = await createPlaceholder(tournament.id, 2);
		const team3 = await createPlaceholder(tournament.id, 3);

		await TournamentLFGRepository.addLike({
			likerTeamId: team1.id,
			targetTeamId: team3.id,
		});
		await TournamentLFGRepository.addLike({
			likerTeamId: team3.id,
			targetTeamId: team1.id,
		});

		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: team1.id,
			otherTeamId: team2.id,
			maxGroupSize: 4,
		});

		const likes = await TournamentLFGRepository.allLikesByTeamId(team1.id);

		expect(likes.given).toHaveLength(0);
		expect(likes.received).toHaveLength(0);
	});
});

describe("updateTeamNote", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("sets and clears a team note", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, 1);

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
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("changes role from REGULAR to MANAGER", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, 1);

		await db
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: team.id,
				userId: 2,
				role: "REGULAR",
			})
			.execute();

		await TournamentLFGRepository.updateMemberRole({
			userId: 2,
			teamId: team.id,
			role: "MANAGER",
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;
		const user2Member = members.find((m) => m.id === 2);

		expect(user2Member?.role).toBe("MANAGER");
	});

	test("throws when attempting to set OWNER role", () => {
		expect(() =>
			TournamentLFGRepository.updateMemberRole({
				userId: 1,
				teamId: 1,
				role: "OWNER",
			}),
		).toThrow("Can't set role to OWNER with this function");
	});
});

describe("updateStayAsSub", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("toggles isStayAsSub on/off", async () => {
		const tournament = await createTournament();
		const team = await createPlaceholder(tournament.id, 1);

		await TournamentLFGRepository.updateStayAsSub({
			teamId: team.id,
			userId: 1,
			value: true,
		});

		let subs = await TournamentLFGRepository.getSubsForTournament(
			tournament.id,
		);
		expect(subs).toContain(1);

		await TournamentLFGRepository.updateStayAsSub({
			teamId: team.id,
			userId: 1,
			value: false,
		});

		subs = await TournamentLFGRepository.getSubsForTournament(tournament.id);
		expect(subs).not.toContain(1);
	});
});

describe("leaveLfg", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("deletes placeholder team when last member leaves", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, 1);

		await TournamentLFGRepository.leaveLfg({
			userId: 1,
			tournamentId: tournament.id,
		});

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);
	});

	test("sets isLooking=0 for non-placeholder team", async () => {
		const tournament = await createTournament();

		const team = await db
			.insertInto("TournamentTeam")
			.values({
				tournamentId: tournament.id,
				name: "Real Team",
				inviteCode: "abc",
				isLooking: 1,
				isPlaceholder: 0,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await db
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: team.id,
				userId: 1,
				role: "OWNER",
			})
			.execute();

		await TournamentLFGRepository.leaveLfg({
			userId: 1,
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

describe("getSubsForTournament", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns userIds with isStayAsSub", async () => {
		const tournament = await createTournament();
		await TournamentLFGRepository.createPlaceholderTeam({
			tournamentId: tournament.id,
			userId: 1,
			isStayAsSub: true,
		});
		await createPlaceholder(tournament.id, 2);

		const subs = await TournamentLFGRepository.getSubsForTournament(
			tournament.id,
		);

		expect(subs).toEqual([1]);
	});

	test("returns empty when nobody opted in", async () => {
		const tournament = await createTournament();
		await createPlaceholder(tournament.id, 1);

		const subs = await TournamentLFGRepository.getSubsForTournament(
			tournament.id,
		);

		expect(subs).toHaveLength(0);
	});
});
