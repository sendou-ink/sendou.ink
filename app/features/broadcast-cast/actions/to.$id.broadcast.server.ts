import { redirect } from "react-router";
import * as R from "remeda";
import { tournamentBroadcastsPage } from "~/features/broadcast/broadcast-urls";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import {
	castAccountsBodySchema,
	updateCastAccounts,
} from "../broadcast-cast-utils.server";

export const action = defineAction(
	{ body: castAccountsBodySchema },
	async ({ params, body }) => {
		const { tournament, tournamentId } = await tournamentFromParams(params, {
			for: "organizer",
		});

		await updateCastAccounts({
			tournament,
			castAccounts: R.uniqueBy(
				[...(tournament.ctx.castAccounts ?? []), ...body.castAccounts],
				LiveStream.key,
			),
		});

		return redirect(tournamentBroadcastsPage(tournamentId));
	},
);
