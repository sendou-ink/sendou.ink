import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { dbReset } from "~/utils/Test";
import * as TournamentMatchRepository from "./TournamentMatchRepository.server";

const TEAMS_PER_POOL = 2;
const TEAM_COUNT = 4;
const POOL_COUNT = TEAM_COUNT / TEAMS_PER_POOL;

/** Pools of two teams each, followed by a final between the two pool winners. */
const POOLS_TO_FINAL: TournamentSettings["bracketProgression"] = [
	{
		name: "Pools",
		type: "round_robin",
		requiresCheckIn: false,
		settings: { teamsPerGroup: TEAMS_PER_POOL },
	},
	{
		name: "Final",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: { thirdPlaceMatch: false },
		sources: [{ bracketIdx: 0, placements: [1] }],
	},
];

const users = UserFactory.pool();

describe("findByTournamentTeamId", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("preserves stage order: matches from an earlier stage come first even when later stage has lower group numbers", async () => {
		// the pools stage numbers its groups 1..2 while the final is group 1 of its
		// own stage, so the team page has to order by stage before group
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
			bracketProgression: POOLS_TO_FINAL,
			minMembersPerTeam: 1,
		});
		await TournamentTeamFactory.createMany(
			TEAM_COUNT,
			(index) => ({ tournamentId: tournament.id, userId: users.id(index + 1) }),
			{ isCheckedIn: true },
		);

		await TournamentFactory.startBracket(tournament.id);
		const poolMatches = await TournamentFactory.playMatches(tournament.id);

		await TournamentFactory.startBracket(tournament.id, { bracketIdx: 1 });
		const [finalMatch] = await TournamentFactory.playMatches(tournament.id);

		const lastPoolMatch = poolMatches.find(
			(match) => match.groupNumber === POOL_COUNT,
		)!;

		const result = await TournamentMatchRepository.findByTournamentTeamId(
			lastPoolMatch.winnerTeamId,
		);

		expect(result.map((s) => s.tournamentMatchId)).toEqual([
			lastPoolMatch.id,
			finalMatch.id,
		]);
	});
});
