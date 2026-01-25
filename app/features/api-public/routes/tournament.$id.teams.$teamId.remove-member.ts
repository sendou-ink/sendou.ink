import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { action as adminAction } from "~/features/tournament/actions/to.$id.admin.server";
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
	const { id: tournamentId, teamId } = paramsSchema.parse(args.params);
	const { userId } = bodySchema.parse(await args.request.json());

	const internalRequest = new Request(args.request.url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			_action: "REMOVE_MEMBER",
			teamId,
			memberId: userId,
		}),
	});

	return wrapActionForApi(adminAction, {
		...args,
		params: { id: String(tournamentId) },
		request: internalRequest,
	});
};
