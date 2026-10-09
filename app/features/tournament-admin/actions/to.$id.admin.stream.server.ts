import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { adminStreamFormSchema } from "../tournament-admin-staff-schemas";

export const action = defineAction(
	{ body: adminStreamFormSchema },
	async ({ params, body }) => {
		const { tournament, tournamentId } = await tournamentFromParams(params, {
			for: "organizer",
		});

		await TournamentRepository.updateCastTwitchAccounts({
			tournamentId: tournament.ctx.id,
			castTwitchAccounts: body.castTwitchAccounts,
		});

		clearTournamentDataCache(tournamentId);

		return null;
	},
);
