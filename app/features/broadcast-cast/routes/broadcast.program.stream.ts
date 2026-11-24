import type { LoaderFunctionArgs } from "react-router";
import { broadcastProgramSearchParams } from "~/features/broadcast/broadcast-search-params";
import { broadcastStreamResponse } from "~/features/broadcast/broadcast-stream.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";
import { findCastProgram } from "../broadcast-cast-utils.server";

/**
 * SSE stream of a user's OBS URL: the state of the cast broadcast it shows, see `BroadcastHub`. Not pointed at one, it
 * only waits to be told to connect again once the URL is.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
	const program = notFoundIfNullish(
		await findCastProgram(broadcastProgramSearchParams.parse(request).key),
	);
	const { broadcast, id: programId } = program;

	return broadcastStreamResponse({
		request,
		connect: (connection) =>
			broadcast
				? BroadcastHub.connect({
						...connection,
						...broadcast,
						layout: CAST_LAYOUT,
						role: "source",
						isClipSender: false,
						programId,
					})
				: BroadcastHub.connectStandby({ ...connection, programId }),
	});
};
