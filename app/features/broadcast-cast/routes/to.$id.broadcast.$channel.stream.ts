import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import { broadcastStreamSearchParams } from "~/features/broadcast/broadcast-search-params";
import { broadcastStreamResponse } from "~/features/broadcast/broadcast-stream.server";
import {
	canWatchProgram,
	isBroadcastEnabled,
	isBroadcastProducer,
} from "~/features/broadcast/broadcast-utils.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFound, notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";
import * as CastChannel from "../core/CastChannel";

/** SSE stream of a cast broadcast's state for its producers and the program key's holders, see `BroadcastHub`. */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});
	if (!isBroadcastEnabled(tournament)) notFound();
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});
	const channel = notFoundIfNullish(
		CastChannel.findBySlug(tournament.ctx.castAccounts, slug),
	);
	const { role, key: programKey } = broadcastStreamSearchParams.parse(request);
	const user = getUser();
	if (!(await canWatchProgram({ tournament, user, channel, programKey }))) {
		notFound();
	}
	const isProducer = isBroadcastProducer(tournament, user);
	const isClipSender = role === "dashboard" && isProducer;
	// a scanner is counted as putting scenes on air, which only a producer's can
	if (role === "scanner" && !isProducer) notFound();

	return broadcastStreamResponse({
		request,
		tournamentId,
		slug,
		layout: CAST_LAYOUT,
		role,
		isClipSender,
		programKey: isProducer ? null : programKey,
	});
};
