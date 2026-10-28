import { beforeEach, describe, expect, test } from "bun:test";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import type { GetTournamentMatchResponse } from "../schema";
import { loader } from "./tournament-match.$id";

const users = UserFactory.pool();

const matchLoader = wrappedLoader<Response>({ loader });

const fetchMatch = async (matchId: number) => {
	const response = await matchLoader({ params: { id: String(matchId) } });

	return (await response.json()) as GetTournamentMatchResponse;
};

/** Four one-player teams in a single elimination bracket of SZ Bo3 sets, the first set played `mapCount` maps in. */
const tournamentWithFirstSetPlayed = async (mapCount?: number) => {
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

	const [firstMatch] = await TournamentFactory.startBracket(tournament.id);
	const [played] = await TournamentFactory.playMatches(tournament.id, {
		matchIds: [firstMatch.id],
		mapCount,
	});

	return played;
};

describe("GET /api/tournament-match/:id", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	test("lists the maps already played of a set in progress with their results", async () => {
		const played = await tournamentWithFirstSetPlayed(1);

		const { mapList } = await fetchMatch(played.id);

		expect(mapList?.map((map) => map.winnerTeamId)).toEqual([
			played.winnerTeamId,
			null,
			null,
		]);
		expect(mapList?.[0].participatedUserIds).toHaveLength(2);
		expect(mapList?.[1].participatedUserIds).toBeNull();
	});

	test("lists only the played maps of a finished set", async () => {
		const played = await tournamentWithFirstSetPlayed();

		const { mapList } = await fetchMatch(played.id);

		expect(mapList?.map((map) => map.winnerTeamId)).toEqual([
			played.winnerTeamId,
			played.winnerTeamId,
		]);
	});
});
