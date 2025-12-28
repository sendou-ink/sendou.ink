import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
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

	const current = SendouQ.findOwnGroup(userId);

	const result: GetUsersActiveSendouqMatchResponse = {
		matchId: current?.matchId ?? null,
	};

	return await cors(request, json(result));
};
