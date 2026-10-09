import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = v.object({
	id,
	teamId: id,
});

const bodySchema = v.object({
	userId: id,
});

export const action = defineAction(
	{ params: paramsSchema, body: bodySchema, onInvalidBody: "badRequest" },
	async ({ params: { id: tournamentId, teamId }, body: { userId } }) =>
		wrapActionForApi(async () => {
			const user = requireUser();
			const tournament = await tournamentFromDB(tournamentId);
			requireTournamentOrganizer(tournament, user);

			const team = tournament.teamById(teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				team.checkIns.length === 0 ||
					team.memberUserIds.length > tournament.minMembersPerTeam,
				"Can't remove last member from checked in team",
			);
			errorToastIfFalsy(
				team.ownerUserId !== userId,
				"Cannot remove team owner",
			);
			errorToastIfFalsy(
				!tournament.hasStarted ||
					!tournament
						.participatedPlayerUserIdsByTeamId(teamId)
						.includes(userId),
				"Cannot remove player that has participated in the tournament",
			);

			if (team.activeRosterUserIds?.includes(userId)) {
				await TournamentTeamRepository.setActiveRoster({
					teamId: team.id,
					activeRosterUserIds: null,
				});
			}

			await TournamentTeamRepository.leave({
				userId,
				teamId: team.id,
			});

			ShowcaseTournaments.removeFromCached({
				tournamentId,
				type: "participant",
				userId,
			});
			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			clearTournamentDataCache(tournamentId);

			return null;
		}),
);
