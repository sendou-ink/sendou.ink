import { defineAction } from "~/form/define-action.server";
import { notFound } from "~/utils/remix.server";
import {
	broadcastParamsSchema,
	broadcastSignalSchema,
} from "../broadcast-schemas";
import * as BroadcastHub from "../core/BroadcastHub.server";

/** WebRTC signaling of the replay clip connections between the dashboard and the overlays, see `BroadcastHub.relaySignal`. */
export const action = defineAction(
	{
		params: broadcastParamsSchema,
		body: broadcastSignalSchema,
		onInvalidBody: "badRequest",
	},
	async ({ params, body }) => {
		const isRelayed = BroadcastHub.relaySignal({
			tournamentId: params.id,
			slug: params.channel,
			...body,
		});
		// the peer disconnected in the meantime
		if (!isRelayed) notFound();

		return null;
	},
);
