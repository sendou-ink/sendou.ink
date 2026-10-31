import type { LoaderFunctionArgs } from "react-router";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { requireBroadcastProducer } from "../broadcast-utils.server";
import * as CastChannel from "../core/CastChannel";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "view",
	});
	requireBroadcastProducer(tournament, user);

	return { channels: CastChannel.list(tournament.ctx.castAccounts) };
};
