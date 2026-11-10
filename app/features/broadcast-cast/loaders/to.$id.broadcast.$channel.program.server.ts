import type { LoaderFunctionArgs } from "react-router";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import { isBroadcastEnabled } from "~/features/broadcast/broadcast-utils.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFound, notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});
	if (!isBroadcastEnabled(tournament)) notFound();
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});

	const { state } = notFoundIfNullish(
		await BroadcastHub.buildState({ tournamentId, slug, layout: CAST_LAYOUT }),
	);

	return { tournamentId, slug, state };
};
