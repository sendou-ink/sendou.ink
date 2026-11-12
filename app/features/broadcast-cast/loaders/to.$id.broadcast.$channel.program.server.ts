import type { LoaderFunctionArgs } from "react-router";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import { broadcastOverlaySearchParams } from "~/features/broadcast/broadcast-search-params";
import {
	canWatchProgram,
	isBroadcastEnabled,
} from "~/features/broadcast/broadcast-utils.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFound, notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";
import * as CastChannel from "../core/CastChannel";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);
	if (!isBroadcastEnabled(tournament)) notFound();
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});
	const channel = notFoundIfNullish(
		CastChannel.findBySlug(tournament.ctx.castAccounts, slug),
	);
	const { key: programKey } = broadcastOverlaySearchParams.parse(request);
	if (!(await canWatchProgram({ tournament, user, channel, programKey }))) {
		notFound();
	}

	const { state } = notFoundIfNullish(
		await BroadcastHub.buildState({ tournamentId, slug, layout: CAST_LAYOUT }),
	);

	return { tournamentId, slug, state };
};
