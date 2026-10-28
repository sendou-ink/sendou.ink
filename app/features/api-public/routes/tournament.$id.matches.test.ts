import { beforeEach, describe, expect, test } from "bun:test";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import type { GetTournamentMatchesResponse } from "../schema";
import { loader } from "./tournament.$id.matches";

const users = UserFactory.pool();

const matchesLoader = wrappedLoader<Response>({ loader });

const fetchMatches = async (tournamentId: number) => {
	const response = await matchesLoader({
		params: { id: String(tournamentId) },
	});

	return (await response.json()) as GetTournamentMatchesResponse;
};

/** Four one-player teams in a single elimination bracket of SZ Bo3 sets, started. */
const startedTournament = async () => {
	const tournament = await TournamentFactory.create({
		authorId: users.id(1),
		minMembersPerTeam: 1,
	});

	for (const userId of users.ids()) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [userId] },
			{ isCheckedIn: true },
		);
	}

	const [semifinalOne, semifinalTwo, final] =
		await TournamentFactory.startBracket(tournament.id);

	return {
		tournamentId: tournament.id,
		semifinals: [semifinalOne, semifinalTwo],
		final,
	};
};

describe("GET /api/tournament/:id/matches", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	test("lists the played maps of every match with their results", async () => {
		const { tournamentId, semifinals } = await startedTournament();
		const [finished] = await TournamentFactory.playMatches(tournamentId, {
			matchIds: [semifinals[0].id],
		});
		const [inProgress] = await TournamentFactory.playMatches(tournamentId, {
			matchIds: [semifinals[1].id],
			mapCount: 1,
		});

		const matches = await fetchMatches(tournamentId);

		expect(
			matches.map((match) => ({
				id: match.id,
				winnerTeamId: match.winnerTeamId,
				mapWinnerTeamIds: match.playedMaps.map((map) => map.winnerTeamId),
			})),
		).toEqual([
			{
				id: finished.id,
				winnerTeamId: finished.winnerTeamId,
				mapWinnerTeamIds: [finished.winnerTeamId, finished.winnerTeamId],
			},
			{
				id: inProgress.id,
				winnerTeamId: null,
				mapWinnerTeamIds: [inProgress.winnerTeamId],
			},
		]);
		expect(matches[0].playedMaps[0].participatedUserIds).toHaveLength(2);
	});

	test("leaves out matches with a team not yet known", async () => {
		const { tournamentId, final } = await startedTournament();

		const matches = await fetchMatches(tournamentId);

		expect(matches).toHaveLength(2);
		expect(matches.map((match) => match.id)).not.toContain(final.id);
	});
});
