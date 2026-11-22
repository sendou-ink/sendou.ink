import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import { broadcastStreamSearchParams } from "~/features/broadcast/broadcast-search-params";
import { broadcastStreamResponse } from "~/features/broadcast/broadcast-stream.server";
import { requireBroadcastProducer } from "~/features/broadcast/broadcast-utils.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";
import * as CastChannel from "../core/CastChannel";

/** SSE stream of a cast broadcast's state for its producers and their scanners, see `BroadcastHub`. OBS streams through `broadcastProgramStreamUrl`. */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});
	const user = getUser();
	requireBroadcastProducer(tournament, user);
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});
	notFoundIfNullish(CastChannel.findBySlug(tournament.ctx.castAccounts, slug));
	const { role } = broadcastStreamSearchParams.parse(request);
	// a scanner follows the user's OBS URL, told to look again when it's pointed elsewhere
	const programId =
		role === "scanner"
			? ((await BroadcastRepository.findProgram(user.id))?.id ?? null)
			: null;

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
				programId,
			}),
	});
};
