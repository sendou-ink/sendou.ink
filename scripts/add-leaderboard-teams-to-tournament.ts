import "dotenv/config";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { joinTeam } from "~/features/tournament/queries/joinLeaveTeam.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const tournamentIdArg = process.argv[2]?.trim();
const placementsArg = process.argv[3]?.trim();

invariant(tournamentIdArg, "tournamentId is required (argument 1)");
invariant(placementsArg, "placements are required (argument 2), e.g. 1,2,3");

const tournamentId = Number(tournamentIdArg);
invariant(
	Number.isInteger(tournamentId) && tournamentId > 0,
	"tournamentId must be a positive integer",
);

const placements = placementsArg.split(",").map((p) => Number(p.trim()));
for (const p of placements) {
	invariant(
		Number.isInteger(p) && p > 0,
		`each placement must be a positive integer, got: ${p}`,
	);
}

async function loadTournament() {
	try {
		return await tournamentFromDB({
			user: undefined,
			tournamentId,
		});
	} catch {
		throw new Error(`Tournament with id ${tournamentId} not found`);
	}
}

async function main() {
	const tournament = await loadTournament();

	invariant(!tournament.hasStarted, "Tournament has already started");

	const season = Seasons.currentOrPrevious();
	invariant(season, "No current or previous season found");

	const leaderboard = await LeaderboardRepository.teamLeaderboardBySeason({
		season: season.nth,
		onlyOneEntryPerUser: true,
	});

	const entries = placements.map((placement) => {
		const entry = leaderboard.find((e) => e.placementRank === placement);
		invariant(entry, `No leaderboard entry found for placement #${placement}`);
		return entry;
	});

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
				const inGameName = await UserRepository.inGameNameByUserId(member.id);
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

		const ownerInGameName = tournament.ctx.settings.requireInGameNames
			? await UserRepository.inGameNameByUserId(owner.id)
			: null;

		const tournamentTeam = await TournamentTeamRepository.create({
			team: {
				name: teamName,
				prefersNotToHost: 0,
				teamId: entry.team?.id ?? null,
			},
			userId: owner.id,
			tournamentId,
			ownerInGameName: ownerInGameName ?? null,
		});

		for (const member of entry.members.slice(1)) {
			const memberInGameName = tournament.ctx.settings.requireInGameNames
				? await UserRepository.inGameNameByUserId(member.id)
				: null;

			joinTeam({
				newTeamId: tournamentTeam.id,
				userId: member.id,
				inGameName: memberInGameName ?? null,
				tournamentId,
			});
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
