import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import { broadcastStreamSearchParams } from "~/features/broadcast/broadcast-search-params";
import { broadcastStreamResponse } from "~/features/broadcast/broadcast-stream.server";
import { requireBroadcastProducer } from "~/features/broadcast/broadcast-utils.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";
import * as CastChannel from "../core/CastChannel";

/** SSE stream of a cast broadcast's state for its producers, see `BroadcastHub`. OBS streams through `broadcastProgramStreamUrl`. */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});
	requireBroadcastProducer(tournament, getUser());
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});
	notFoundIfNullish(CastChannel.findBySlug(tournament.ctx.castAccounts, slug));
	const { role } = broadcastStreamSearchParams.parse(request);

	return broadcastStreamResponse({
		request,
		connect: (connection) =>
			BroadcastHub.connect({
				...connection,
				tournamentId,
				slug,
				layout: CAST_LAYOUT,
				role,
				isClipSender: role === "dashboard",
				programId: null,
			}),
	});
};
