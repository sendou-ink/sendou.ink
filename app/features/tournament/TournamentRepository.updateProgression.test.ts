import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentRepository from "./TournamentRepository.server";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

const TEAM_COUNT = 6;

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
		settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
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

/** Two divisions, each its own starting bracket. */
const DIVISIONS: TournamentSettings["bracketProgression"] = [
	{
		name: "Division 1",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
	},
	{
		name: "Division 2",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
	},
	{
		name: "Division 3",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
	},
];

/** Two divisions, each with playoffs requiring check-in. */
const DIVISIONS_WITH_PLAYOFFS: TournamentSettings["bracketProgression"] = [
	DIVISIONS[0],
	DIVISIONS[1],
	...[0, 1].map((divisionIdx) => ({
		name: `Division ${divisionIdx + 1} Playoffs`,
		type: "single_elimination" as const,
		requiresCheckIn: true,
		settings: { skippedRounds: ["THIRD_PLACE_MATCH" as const] },
		sources: [{ bracketIdx: divisionIdx, placements: [1] }],
	})),
];

/** The same divisions, Division 2 now having a third place match. */
const DIVISIONS_WITH_THIRD_PLACE_MATCH: TournamentSettings["bracketProgression"] =
	[
		DIVISIONS[0],
		{ ...DIVISIONS[1], settings: { skippedRounds: [] } },
		DIVISIONS[2],
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
		expect(updated.bracketByIdx(0)?.previewSeeding).toEqual(teamIds);
		expect(updated.teamById(teamIds[1])?.seed).toBe(2);
	});

	test("editing a follow-up bracket clears only its check-ins", async () => {
		const checkedInTeams: Array<{ tournamentId: number; teamId: number }> = [];
		for (const userId of users.ids(2)) {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
				bracketProgression: DIVISIONS_WITH_PLAYOFFS,
				minMembersPerTeam: 1,
			});
			const team = await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds: [userId] },
				{ isCheckedIn: true, checkedInToBracketIdxs: [2, 3] },
			);
			checkedInTeams.push({ tournamentId: tournament.id, teamId: team.id });
		}
		const [editedTournamentTeam, otherTournamentTeam] = checkedInTeams;

		await TournamentRepository.updateProgression({
			tournamentId: editedTournamentTeam.tournamentId,
			bracketProgression: [
				...DIVISIONS_WITH_PLAYOFFS.slice(0, 2),
				{ ...DIVISIONS_WITH_PLAYOFFS[2], settings: { skippedRounds: [] } },
				DIVISIONS_WITH_PLAYOFFS[3],
			],
		});

		expect(await followUpCheckInBracketIdxs(editedTournamentTeam)).toEqual([3]);
		expect(await followUpCheckInBracketIdxs(otherTournamentTeam)).toEqual([
			2, 3,
		]);
	});

	describe("after a division started", () => {
		const divisionOf = (teamIdx: number) => Math.floor(teamIdx / 2);

		async function createDivisionsTournament() {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
				bracketProgression: DIVISIONS,
				minMembersPerTeam: 1,
			});

			const teamIdsByDivision: number[][] = [[], [], []];
			for (const [i, userId] of users.ids(TEAM_COUNT).entries()) {
				const team = await TournamentTeamFactory.create(
					{ tournamentId: tournament.id, memberUserIds: [userId] },
					{ isCheckedIn: true, startingBracketIdx: divisionOf(i) },
				);
				teamIdsByDivision[divisionOf(i)].push(team.id);
			}

			await TournamentFactory.startBracket(tournament.id, { bracketIdx: 0 });

			return { tournamentId: tournament.id, teamIdsByDivision };
		}

		const startingBracketIdxs = (tournament: Tournament, teamIds: number[]) =>
			teamIds.map((teamId) => tournament.teamById(teamId)?.startingBracketIdx);

		test("editing an unstarted division keeps every division's teams", async () => {
			const { tournamentId, teamIdsByDivision } =
				await createDivisionsTournament();

			await TournamentRepository.updateProgression({
				tournamentId,
				bracketProgression: DIVISIONS_WITH_THIRD_PLACE_MATCH,
			});

			const updated = await tournamentFromDB(tournamentId);

			expect(updated.bracketByIdx(1)?.previewSeeding).toEqual(
				expect.arrayContaining(teamIdsByDivision[1]),
			);
			expect(updated.bracketByIdx(2)?.previewSeeding).toEqual(
				expect.arrayContaining(teamIdsByDivision[2]),
			);
			expect(startingBracketIdxs(updated, teamIdsByDivision.flat())).toEqual([
				0, 0, 1, 1, 2, 2,
			]);
		});

		test("editing an unstarted division clears only its prepared maps", async () => {
			const { tournamentId } = await createDivisionsTournament();

			for (const bracketIdx of [1, 2]) {
				await TournamentFactory.prepareMaps({
					authorId: organizerId(),
					tournamentId,
					bracketIdx,
					maps: { maps: [], eliminationTeamCount: 2 },
				});
			}

			await TournamentRepository.updateProgression({
				tournamentId,
				bracketProgression: DIVISIONS_WITH_THIRD_PLACE_MATCH,
			});

			const preparedMaps =
				await TournamentRepository.findPreparedMapsById(tournamentId);

			expect(preparedMaps?.[1]).toBeNull();
			expect(preparedMaps?.[2]?.eliminationTeamCount).toBe(2);
		});
	});
});

async function followUpCheckInBracketIdxs({
	tournamentId,
	teamId,
}: {
	tournamentId: number;
	teamId: number;
}) {
	const tournament = await tournamentFromDB(tournamentId);

	return (tournament.teamById(teamId)?.checkIns ?? [])
		.flatMap((checkIn) =>
			checkIn.bracketIdx === null ? [] : [checkIn.bracketIdx],
		)
		.sort((a, b) => a - b);
}
