import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { getServerTournamentManager } from "../tournament-bracket/core/brackets-manager/manager.server";
import { tournamentFromDB } from "../tournament-bracket/core/Tournament.server";
import { joinTeam } from "./queries/joinLeaveTeam.server";
import { updateRoundMaps } from "./queries/updateRoundMaps.server";
import * as TournamentRepository from "./TournamentRepository.server";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

/**
 * Creates a mock tournament with one single elimination bracket.
 */
export async function dbInsertTournament() {
	await CalendarRepository.create({
		isFullTournament: true,
		authorId: 1,
		badges: [],
		bracketUrl: "https://example.com/bracket",
		description: null,
		discordInviteCode: "test-discord",
		name: "Test Tournament",
		organizationId: null,
		rules: null,
		startTimes: [databaseTimestampNow()],
		tags: null,
		bracketProgression: [
			{
				name: "Bracket",
				type: "single_elimination",
				requiresCheckIn: false,
				settings: {
					thirdPlaceMatch: false,
				},
			},
		],
		mapPickingStyle: "TO",
		mapPoolMaps: ([1, 2, 3, 4, 5] as const).map((id) => ({
			mode: "SZ",
			stageId: id,
		})),
	});
}

/**
 * Inserts a tournament team into the database with the specified number of members. Also checks in the team to the tournament.
 */
export async function dbInsertTournamentTeam({
	membersCount,
	ownerId,
	tournamentId = 1,
}: {
	/** Total number of members in the team, including the owner. */
	membersCount: number;
	/** Id of the user who owns the team. The other members are relative to this ID so e.g. if captain has ID of 5 then other members have 6,7,8 etc. */
	ownerId: number;
	/** Id of the tournament to associate the team with. Defaults to 1. */
	tournamentId?: number;
}) {
	const tournamentTeam = await TournamentTeamRepository.create({
		ownerInGameName: null,
		team: {
			name: `Test Team ${ownerId}`,
			prefersNotToHost: 0,
			teamId: null,
		},
		userId: ownerId,
		tournamentId,
	});

	for (let i = 1; i < membersCount; i++) {
		const memberId = ownerId + i;

		joinTeam({
			userId: memberId,
			newTeamId: tournamentTeam.id,
			tournamentId,
			inGameName: null,
		});
	}

	await TournamentRepository.checkIn({
		tournamentTeamId: tournamentTeam.id,
		// no sources = regular check in
		bracketIdx: null,
	});
}

/**
 * Starts a tournament with the given seeding and tournament ID.
 * Assumes that the tournament has only one bracket and one round.
 */
export async function dbStartTournament(seeding: number[], tournamentId = 1) {
	const manager = getServerTournamentManager();

	const tournament = await tournamentFromDB({
		tournamentId,
		user: undefined,
	});

	invariant(
		seeding.every((id) => tournament.ctx.teams.some((team) => team.id === id)),
	);

	const bracket = tournament.bracketByIdx(0)!;

	const settings = tournament.bracketManagerSettings(
		bracket.settings,
		bracket.type,
		seeding.length,
	);

	manager.create({
		tournamentId: tournament.ctx.id,
		name: bracket.name,
		type: bracket.type,
		seeding,
		settings,
	});

	// assuming here every tournament has only one round
	const roundId = tournamentId === 1 ? 1 : 2;

	updateRoundMaps([
		{
			count: 3,
			roundId,
			type: "BEST_OF",
			list: ([1, 2, 3] as const).map((stageId) => ({
				pickBan: false,
				mode: "SZ",
				stageId,
				source: "TO",
			})),
		},
	]);
}
