import {
	castAccountsBodySchema,
	updateCastAccounts,
} from "~/features/broadcast-cast/broadcast-cast-utils.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";

export const action = defineAction(
	{ body: castAccountsBodySchema },
	async ({ params, body }) => {
		const { tournament } = await tournamentFromParams(params, {
			for: "organizer",
		});

		await updateCastAccounts({ tournament, castAccounts: body.castAccounts });

		return null;
	},
);
