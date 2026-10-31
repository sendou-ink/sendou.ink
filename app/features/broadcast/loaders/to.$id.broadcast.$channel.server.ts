import type { LoaderFunctionArgs } from "react-router";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import * as BroadcastRepository from "../BroadcastRepository.server";
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
	const chatRoomId = (
		await BroadcastRepository.findByChannel({ tournamentId, channel })
	)?.chatRoomId;

	return {
		state,
		channel,
		chatRooms: await RouteChatRooms.resolve(
			user,
			typeof chatRoomId === "number"
				? [{ roomId: chatRoomId, autoOpen: true }]
				: [],
		),
	};
};
