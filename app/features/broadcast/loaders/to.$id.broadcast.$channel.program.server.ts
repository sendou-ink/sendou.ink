import type { LoaderFunctionArgs } from "react-router";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { broadcastParamsSchema } from "../broadcast-schemas";
import * as BroadcastHub from "../core/BroadcastHub.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournamentId } = await tournamentFromParams(params, { for: "view" });
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});

	const { state } = notFoundIfNullish(
		await BroadcastHub.buildState({ tournamentId, slug }),
	);

	return { tournamentId, slug, state };
};
