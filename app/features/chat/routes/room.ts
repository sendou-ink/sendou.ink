import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { parseRequestPayload } from "~/utils/remix.server";
import { isSplatnetRoomUrl } from "../chat-constants";
import * as RoomLinkRepository from "../RoomLinkRepository.server";

const roomLinkSchema = z.discriminatedUnion("_action", [
	z.object({
		_action: z.literal("UPSERT"),
		url: z.string().refine(isSplatnetRoomUrl, "Not a SplatNet room URL"),
	}),
	z.object({
		_action: z.literal("CONFIRM"),
	}),
]);

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: roomLinkSchema,
	});

	switch (data._action) {
		case "UPSERT": {
			await RoomLinkRepository.upsertOwn(data.url);
			break;
		}
		case "CONFIRM": {
			await RoomLinkRepository.refreshOwnTimestamp();
			break;
		}
	}

	return null;
};
