import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { parseBody, parseParams } from "~/utils/remix.server";
import { id, idObject } from "~/utils/schema";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";

const bodySchema = v.object({ lastSeenMessageId: id });

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });
	const data = await parseBody({ request, schema: bodySchema });

	await ChatRoomResolver.requireRoom(roomId, "VIEW");

	await ChatRepository.upsertReadIndicator({
		userId: user.id,
		roomId,
		lastSeenMessageId: data.lastSeenMessageId,
	});

	return null;
};
