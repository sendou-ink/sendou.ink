import type { LoaderFunctionArgs } from "react-router";
import { requireBroadcastProducer } from "~/features/broadcast/broadcast-utils.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as CastChannel from "../core/CastChannel";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "view",
	});
	requireBroadcastProducer(tournament, user);

	return { channels: CastChannel.list(tournament.ctx.castAccounts) };
};
