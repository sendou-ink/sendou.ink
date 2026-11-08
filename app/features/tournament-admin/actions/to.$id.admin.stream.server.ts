import type { Params } from "react-router";
import { ensureChatRoom } from "~/features/broadcast/broadcast-utils.server";
import * as CastChannel from "~/features/broadcast/core/CastChannel";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
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
		ChatSystemMessage.send({ channel: tournamentChannel(tournamentId) });

		for (const channel of CastChannel.list(body.castAccounts)) {
			await ensureChatRoom({ tournament, channel });
		}

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
