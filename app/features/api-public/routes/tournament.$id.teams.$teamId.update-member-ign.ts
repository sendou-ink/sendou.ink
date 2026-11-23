import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { inGameNameIsValid } from "~/features/user-page/in-game-name";
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
	inGameName: v.pipe(v.string(), v.check(inGameNameIsValid)),
});

export const action = defineAction(
	{ params: paramsSchema, body: bodySchema, onInvalidBody: "badRequest" },
	async ({
		params: { id: tournamentId, teamId },
		body: { userId, inGameName },
	}) =>
		wrapActionForApi(async () => {
			const user = requireUser();
			const tournament = await tournamentFromDB(tournamentId);
			requireTournamentOrganizer(tournament, user);

			const team = tournament.teamById(teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				team.memberUserIds.includes(userId),
				"User not in team",
			);

			await TournamentTeamRepository.updateMemberInGameName({
				userId,
				inGameName,
				tournamentTeamId: team.id,
			});

			clearTournamentDataCache(tournamentId);

			return null;
		}),
);
