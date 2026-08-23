import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import {
	forbidden,
	notFoundIfNullish,
	parseBody,
	parseParams,
} from "~/utils/remix.server";
import { id } from "~/utils/schema";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";

const paramsSchema = v.object({ roomId: id });
const bodySchema = v.object({ lastSeenMessageId: id });

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { roomId } = parseParams({ params, schema: paramsSchema });
	const data = await parseBody({ request, schema: bodySchema });

	const room = notFoundIfNullish((await ChatRoomResolver.resolve([roomId]))[0]);
	if (!ChatRoomResolver.canView(room, user.id)) {
		forbidden();
	}

	await ChatRepository.upsertReadIndicator({
		userId: user.id,
		roomId,
		lastSeenMessageId: data.lastSeenMessageId,
	});

	return null;
};
