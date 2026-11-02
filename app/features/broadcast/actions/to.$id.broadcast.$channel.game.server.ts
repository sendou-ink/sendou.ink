import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import {
	broadcastGameSignalSchema,
	broadcastParamsSchema,
} from "../broadcast-schemas";
import { requireBroadcastProducer } from "../broadcast-utils.server";
import * as BroadcastHub from "../core/BroadcastHub.server";
import * as CastChannel from "../core/CastChannel";

/** The scanner watching the game feed telling the games it sees starting and ending, see `Producer.applyGameSignal`. */
export const action = defineAction(
	{
		params: broadcastParamsSchema,
		body: broadcastGameSignalSchema,
		onInvalidBody: "badRequest",
	},
	async ({ params, body }) => {
		const user = requireUser();
		const tournament = await tournamentFromDB(params.id);
		requireBroadcastProducer(tournament, user);
		notFoundIfNullish(
			CastChannel.findBySlug(tournament.ctx.castAccounts, params.channel),
		);

		await BroadcastHub.applyGameSignal({
			tournamentId: tournament.ctx.id,
			slug: params.channel,
			signal: body,
		});

		return null;
	},
);
