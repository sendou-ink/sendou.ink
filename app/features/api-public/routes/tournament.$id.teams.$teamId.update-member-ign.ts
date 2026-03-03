import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { action as adminAction } from "~/features/tournament/actions/to.$id.admin.server";
import { IN_GAME_NAME_REGEXP } from "~/features/user-page/user-page-constants";
import { parseBody, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = z.object({
	id,
	teamId: id,
});

const bodySchema = z.object({
	userId: id,
	inGameName: z.string().regex(IN_GAME_NAME_REGEXP),
});

export const action = async (args: ActionFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params: args.params,
		schema: paramsSchema,
	});
	const { userId, inGameName } = await parseBody({
		request: args.request,
		schema: bodySchema,
	});

	const hashIndex = inGameName.lastIndexOf("#");
	const inGameNameText = inGameName.slice(0, hashIndex);
	const inGameNameDiscriminator = inGameName.slice(hashIndex + 1);

	const internalRequest = new Request(args.request.url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			_action: "UPDATE_IN_GAME_NAME",
			memberId: userId,
			inGameNameText,
			inGameNameDiscriminator,
		}),
	});

	return wrapActionForApi(adminAction, {
		...args,
		params: { id: String(tournamentId) },
		request: internalRequest,
	});
};
