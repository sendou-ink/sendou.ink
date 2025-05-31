import type { LoaderFunctionArgs } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { findCurrentGroupByUserId } from "~/features/sendouq/queries/findCurrentGroupByUserId.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetUsersActiveSendouqMatchResponse } from "../schema";

const paramsSchema = z.object({
	userId: id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { userId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const current = findCurrentGroupByUserId(userId);

	const result: GetUsersActiveSendouqMatchResponse = {
		matchId: current?.matchId ?? null,
	};

	return await cors(request, Response.json(result));
};
