import type { LoaderFunctionArgs } from "react-router";
import { broadcastProgramSearchParams } from "~/features/broadcast/broadcast-search-params";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";
import { findCastProgram } from "../broadcast-cast-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const programKey = notFoundIfNullish(
		broadcastProgramSearchParams.parse(request).key,
	);
	const program = notFoundIfNullish(await findCastProgram(programKey));

	const built = program.broadcast
		? await BroadcastHub.buildState({
				...program.broadcast,
				layout: CAST_LAYOUT,
			})
		: null;
	if (!program.broadcast || !built) {
		return { programKey, obsAudio: null, broadcast: null };
	}

	return {
		programKey,
		obsAudio: program.obsAudio,
		broadcast: { ...program.broadcast, state: built.state },
	};
};
