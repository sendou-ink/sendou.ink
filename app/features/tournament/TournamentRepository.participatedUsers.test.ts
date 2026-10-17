import { beforeEach, describe, expect, test } from "bun:test";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "./TournamentRepository.server";

const users = UserFactory.pool();

const subUserId = () => users.id(5);

const teamRosters = () => [
	[users.id(1), users.id(2), users.id(3), users.id(4), subUserId()],
	[users.id(6), users.id(7), users.id(8), users.id(9)],
];

describe("TournamentRepository.findParticipatedUserIdsById", () => {
	beforeEach(async () => {
		await users.create(9);
	});

	test("returns the members who played a map, leaving out a sub who did not", async () => {
		const { id: tournamentId } = await TournamentFactory.createPlayed(
			{ authorId: users.id(1) },
			{ teamRosters: teamRosters() },
		);

		const userIds =
			await TournamentRepository.findParticipatedUserIdsById(tournamentId);

		expect(userIds.toSorted((a, b) => a - b)).toEqual(
			users
				.ids()
				.filter((userId) => userId !== subUserId())
				.toSorted((a, b) => a - b),
		);
	});

	test("returns nothing before any map is played", async () => {
		const { id: tournamentId } = await TournamentFactory.createPlayed(
			{ authorId: users.id(1) },
			{ teamRosters: teamRosters(), playedOut: [] },
		);

		expect(
			await TournamentRepository.findParticipatedUserIdsById(tournamentId),
		).toEqual([]);
	});

	test("leaves out players of another tournament", async () => {
		const { id: tournamentId } = await TournamentFactory.createPlayed(
			{ authorId: users.id(1) },
			{ teamRosters: teamRosters(), playedOut: [] },
		);
		await TournamentFactory.createPlayed(
			{ authorId: users.id(1) },
			{ teamRosters: teamRosters() },
		);

		expect(
			await TournamentRepository.findParticipatedUserIdsById(tournamentId),
		).toEqual([]);
	});
});
