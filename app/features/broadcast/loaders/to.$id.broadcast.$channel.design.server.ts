import type { LoaderFunctionArgs } from "react-router";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { broadcastParamsSchema } from "../broadcast-schemas";
import { requireBroadcastProducer } from "../broadcast-utils.server";
import * as BroadcastHub from "../core/BroadcastHub.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);
	requireBroadcastProducer(tournament, user);
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});

	const { state, channel } = notFoundIfNullish(
		await BroadcastHub.buildState({ tournamentId, slug }),
	);

	return { channel, tournament: state.tournament, settings: state.settings };
};
