import { ADMIN_ID } from "~/features/admin/admin-constants";
import { userAsyncLocalStorage } from "~/features/auth/core/user-context.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import { TEAM_LEADERBOARD_QUALIFYING_COUNT } from "~/features/leaderboards/leaderboards-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const tournamentIdArg = process.argv[2]?.trim();

invariant(tournamentIdArg, "tournamentId is required (argument 1)");

const tournamentId = Number(tournamentIdArg);
invariant(
	Number.isInteger(tournamentId) && tournamentId > 0,
	"tournamentId must be a positive integer",
);

async function loadTournament() {
	try {
		return await tournamentFromDB(tournamentId);
	} catch {
		throw new Error(`Tournament with id ${tournamentId} not found`);
	}
}

async function main() {
	const tournament = await loadTournament();

	invariant(!tournament.hasStarted, "Tournament has already started");

	const adminUser = await UserRepository.findLeanById(ADMIN_ID);
	invariant(adminUser, `Admin user with id ${ADMIN_ID} not found`);

	const season = Seasons.currentOrPrevious();
	invariant(season, "No current or previous season found");

	const leaderboard = await LeaderboardRepository.findTeamLeaderboardBySeason({
		season: season.nth,
		onlyOneEntryPerUser: true,
	});

	const entries = leaderboard.filter(
		(entry) =>
			entry.placementRank !== null &&
			entry.placementRank <= TEAM_LEADERBOARD_QUALIFYING_COUNT,
	);
	invariant(
		entries.length === TEAM_LEADERBOARD_QUALIFYING_COUNT,
		`Expected ${TEAM_LEADERBOARD_QUALIFYING_COUNT} qualifying teams on season ${season.nth} leaderboard, got ${entries.length}`,
	);

	const existingTeamNames = new Set(tournament.ctx.teams.map((t) => t.name));

	let teamNameCounter = 1;
	const resolvedNames = entries.map((entry) => {
		return entry.team?.name ?? `Team ${teamNameCounter++}`;
	});

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const teamName = resolvedNames[i];

		for (const member of entry.members) {
			const existingTeam = tournament.teamMemberOfByUser({ id: member.id });
			invariant(
				!existingTeam,
				`User ${member.username} (id: ${member.id}) is already on team "${existingTeam?.name}"`,
			);

			const user = await UserRepository.findLeanById(member.id);
			invariant(user, `User with id ${member.id} not found`);
			invariant(user.friendCode, `User ${member.username} has no friend code`);

			if (tournament.ctx.settings.requireInGameNames) {
				const inGameName = await UserRepository.findInGameNameByUserId(
					member.id,
				);
				invariant(
					inGameName,
					`User ${member.username} has no in-game name (required by tournament)`,
				);
			}
		}

		invariant(
			!existingTeamNames.has(teamName),
			`Team name "${teamName}" is already taken in the tournament`,
		);
		existingTeamNames.add(teamName);
	}

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const teamName = resolvedNames[i];
		const owner = entry.members[0];

		const tournamentTeam = await userAsyncLocalStorage.run(
			{ user: adminUser },
			() =>
				TournamentTeamRepository.insert({
					team: {
						name: teamName,
						prefersNotToHost: 0,
						teamId: entry.team?.id ?? null,
					},
					userId: owner.id,
					tournamentId,
				}),
		);

		for (const member of entry.members.slice(1)) {
			await userAsyncLocalStorage.run({ user: adminUser }, () =>
				TournamentTeamRepository.join({
					newTeamId: tournamentTeam.id,
					userId: member.id,
				}),
			);
		}

		logger.info(
			`Created team "${teamName}" (placement #${entry.placementRank}) with members: ${entry.members.map((m) => m.username).join(", ")}`,
		);
	}

	logger.info(
		`Done. Added ${entries.length} teams to tournament ${tournamentId}`,
	);
}

void main();
