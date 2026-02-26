import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { action as seedsAction } from "~/features/tournament/actions/to.$id.seeds.server";
import { parseBody, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = z.object({
	id,
});

const bodySchema = z.object({
	tournamentTeamIds: z.array(id),
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

	return wrapActionForApi(seedsAction, {
		...args,
		params: { id: String(tournamentId) },
		request: internalRequest,
	});
};
