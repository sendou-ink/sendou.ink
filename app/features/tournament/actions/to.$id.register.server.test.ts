import { addDays, addMinutes, subMinutes } from "date-fns";
import { describe, expect, test } from "vitest";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as LobbyActivity from "~/features/lobbies/core/LobbyActivity.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { registerSchema } from "../tournament-schemas.server";
import { action as registerAction } from "./to.$id.register.server";

/** `maxMembersPerTeam` of a regular 4v4 tournament that sets no limit of its own. */
const MAX_ROSTER_SIZE = 6;

const register = wrappedAction<ReturnType<typeof registerSchema>>({
	action: registerAction,
	isJsonSubmission: true,
});

const memberCountOfOnlyTeam = async (tournamentId: number) => {
	const { count } = await db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.executeTakeFirstOrThrow();

	return count;
};

/** Open tournament with one team of `rosterSize` captained by the submitting user, plus a friend to add. */
const scenario = async ({
	rosterSize,
	requireInGameNames = false,
}: {
	rosterSize: number;
	requireInGameNames?: boolean;
}) => {
	const captain = await UserFactory.createRegular({
		profile: requireInGameNames ? { inGameName: "Captain#1234" } : null,
	});
	// without an in-game name of their own
	const friend = await UserFactory.create({ profile: null });
	const teammates = await UserFactory.createMany(rosterSize - 1);

	await FriendshipFactory.create({
		userOneId: captain.id,
		userTwoId: friend.id,
	});

	const tournament = await TournamentFactory.create({
		authorId: captain.id,
		startTimes: [dateToDatabaseTimestamp(addDays(new Date(), 7))],
		requireInGameNames,
	});

	await TournamentTeamFactory.create({
		tournamentId: tournament.id,
		memberUserIds: [captain.id, ...teammates.map((user) => user.id)],
	});

	return {
		tournamentId: tournament.id,
		addFriend: () =>
			register(
				{ _action: "ADD_PLAYER", userId: friend.id },
				{ user: "regular", params: { id: String(tournament.id) } },
			),
	};
};

describe("Tournament registration ADD_PLAYER", () => {
	test("adds a player to a team with room left", async () => {
		const { tournamentId, addFriend } = await scenario({
			rosterSize: MAX_ROSTER_SIZE - 1,
		});

		await addFriend();

		expect(await memberCountOfOnlyTeam(tournamentId)).toBe(MAX_ROSTER_SIZE);
	});

	test("does not add a player to a team already at max capacity", async () => {
		const { tournamentId, addFriend } = await scenario({
			rosterSize: MAX_ROSTER_SIZE,
		});

		assertResponseErrored(await addFriend(), "Team is already at max capacity");

		expect(await memberCountOfOnlyTeam(tournamentId)).toBe(MAX_ROSTER_SIZE);
	});

	test("does not add a player without an in-game name when the tournament requires one", async () => {
		const { tournamentId, addFriend } = await scenario({
			rosterSize: 1,
			requireInGameNames: true,
		});

		assertResponseErrored(await addFriend(), "no in-game name");

		expect(await memberCountOfOnlyTeam(tournamentId)).toBe(1);
	});
});

describe("Tournament registration CHECK_IN", () => {
	test("checks in while active in a lobby", async () => {
		const captain = await UserFactory.createRegular();
		const teammates = await UserFactory.createMany(3);
		const tournament = await TournamentFactory.create({
			authorId: captain.id,
			startTimes: [dateToDatabaseTimestamp(addMinutes(new Date(), 30))],
		});
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [captain.id, ...teammates.map((user) => user.id)],
		});
		await LobbyFactory.create(
			{
				hostUserId: captain.id,
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{ checkedInUserIds: [captain.id] },
		);
		await LobbyActivity.refresh();

		await register(
			{ _action: "CHECK_IN" },
			{ user: "regular", params: { id: String(tournament.id) } },
		);

		const checkIn = await db
			.selectFrom("TournamentTeamCheckIn")
			.select("checkedInAt")
			.where("tournamentTeamId", "=", team.id)
			.executeTakeFirst();
		expect(checkIn).toBeDefined();
	});
});
