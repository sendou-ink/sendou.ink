import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	errorToastIfFalsy,
	parseBody,
	parseParams,
} from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = z.object({
	id,
	teamId: id,
});

const bodySchema = z.object({
	userId: id,
});

export const action = async (args: ActionFunctionArgs) => {
	const { id: tournamentId, teamId } = parseParams({
		params: args.params,
		schema: paramsSchema,
	});
	const { userId } = await parseBody({
		request: args.request,
		schema: bodySchema,
	});

	return wrapActionForApi(async () => {
		const user = requireUser();
		const tournament = await tournamentFromDB({ tournamentId, user });
		errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");

		const team = tournament.teamById(teamId);
		errorToastIfFalsy(team, "Invalid team id");
		errorToastIfFalsy(
			team.checkIns.length === 0 ||
				team.members.length > tournament.minMembersPerTeam,
			"Can't remove last member from checked in team",
		);
		errorToastIfFalsy(
			team.members.find((m) => m.userId === userId)?.role !== "OWNER",
			"Cannot remove team owner",
		);
		errorToastIfFalsy(
			!tournament.hasStarted ||
				!tournament
					.participatedPlayersByTeamId(teamId)
					.some((p) => p.userId === userId),
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

		clearTournamentDataCache(tournamentId);

		return null;
	}, args);
};
