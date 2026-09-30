import { addDays } from "date-fns";
import { describe, expect, test, vi } from "vitest";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { registerSchema } from "../tournament-schemas.server";
import { action as registerAction } from "./to.$id.register.server";

// adding a player notifies them; not under test here
vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: () => Promise.resolve(),
}));

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
