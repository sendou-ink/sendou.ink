import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { action as adminAction } from "~/features/tournament-admin/actions/to.$id.admin.seeds.server";
import { parseBody, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = v.object({
	id,
});

const bodySchema = v.object({
	tournamentTeamIds: v.array(id),
});

export const action = async (args: ActionFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params: args.params,
		schema: paramsSchema,
	});
	const { tournamentTeamIds } = await parseBody({
		request: args.request,
		schema: bodySchema,
	});

	const internalRequest = new Request(args.request.url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			_action: "UPDATE_SEEDS",
			seeds: tournamentTeamIds,
		}),
	});

	return wrapActionForApi(adminAction, {
		...args,
		params: { id: String(tournamentId) },
		request: internalRequest,
	});
};
