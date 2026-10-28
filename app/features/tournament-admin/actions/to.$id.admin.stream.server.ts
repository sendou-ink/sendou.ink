import type { Params } from "react-router";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { defineAction } from "~/form/define-action.server";
import { adminStreamFormSchemaServer } from "../tournament-admin-staff-schemas.server";

export const action = defineAction(
	{ body: streamBodySchema },
	async ({ params, body }) => {
		const { tournament, tournamentId } = await tournamentFromParams(params, {
			for: "organizer",
		});

		await TournamentRepository.updateCastAccounts({
			tournamentId: tournament.ctx.id,
			castAccounts: body.castAccounts,
		});

		clearTournamentDataCache(tournamentId);

		return null;
	},
);

async function streamBodySchema({ params }: { params: Params<string> }) {
	const { tournament } = await tournamentFromParams(params, {
		for: "organizer",
	});

	return adminStreamFormSchemaServer({
		currentCastAccounts: tournament.ctx.castAccounts ?? [],
	});
}
