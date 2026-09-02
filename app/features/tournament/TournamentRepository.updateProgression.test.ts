import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentRepository from "./TournamentRepository.server";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

const TEAM_COUNT = 4;

/** Groups and playoffs, the organizer having forgotten to link the two. */
const UNLINKED: TournamentSettings["bracketProgression"] = [
	{
		name: "Groups",
		type: "round_robin",
		requiresCheckIn: false,
		settings: { teamsPerGroup: 4 },
	},
	{
		name: "Playoffs",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: { thirdPlaceMatch: false },
	},
];

/** The same brackets, the playoffs now sourcing the top two of the groups. */
const LINKED: TournamentSettings["bracketProgression"] = [
	UNLINKED[0],
	{
		...UNLINKED[1],
		sources: [{ bracketIdx: 0, placements: [1, 2] }],
	},
];

const users = UserFactory.pool();
const organizerId = () => users.id(1);

describe("TournamentRepository.updateProgression", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT);
	});

	test("teams keep their seed order after the second starting bracket becomes a follow-up bracket", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			bracketProgression: UNLINKED,
			minMembersPerTeam: 1,
		});

		const teamIds: number[] = [];
		for (const userId of users.ids(TEAM_COUNT)) {
			const team = await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds: [userId] },
				{ isCheckedIn: true },
			);
			teamIds.push(team.id);
		}

		await TournamentRepository.updateTeamSeeds({
			tournamentId: tournament.id,
			teamIds,
		});
		// the top seed was put in the "Playoffs" starting bracket while the brackets were unlinked
		await TournamentTeamRepository.updateStartingBrackets([
			{ tournamentTeamId: teamIds[0], startingBracketIdx: 1 },
		]);

		await TournamentRepository.updateProgression({
			tournamentId: tournament.id,
			bracketProgression: LINKED,
		});

		const updated = await tournamentFromDB(tournament.id);

		expect(updated.isMultiStartingBracket).toBe(false);
		expect(updated.ctx.teams.map((team) => team.id)).toEqual(teamIds);
		expect(updated.bracketByIdx(0)?.seeding).toEqual(teamIds);
		expect(updated.teamById(teamIds[1])?.seed).toBe(2);
	});
});
