import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });

	await ChatRoomResolver.requireRoom(roomId, "VIEW");

	return { messages: await ChatRepository.findAllMessagesByRoomId(roomId) };
};
