import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { action as adminAction } from "~/features/tournament/actions/to.$id.admin.server";
import { parseBody, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = z.object({
	id,
	teamId: id,
});

const bodySchema = z.object({
	userId: id,
});

export const action = async (args: ActionFunctionArgs) => {
	const { id: tournamentId, teamId } = parseParams({
		params: args.params,
		schema: paramsSchema,
	});
	const { userId } = await parseBody({
		request: args.request,
		schema: bodySchema,
	});

	const internalRequest = new Request(args.request.url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			_action: "ADD_MEMBER",
			teamId,
			userId,
		}),
	});

	return wrapActionForApi(adminAction, {
		...args,
		params: { id: String(tournamentId) },
		request: internalRequest,
	});
};
