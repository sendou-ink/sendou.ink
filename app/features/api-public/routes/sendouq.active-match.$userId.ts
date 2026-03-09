import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetUsersActiveSendouqMatchResponse } from "../schema";

const paramsSchema = z.object({
	userId: id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { userId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const current = SendouQ.findOwnGroup(userId);

	const result: GetUsersActiveSendouqMatchResponse = {
		matchId: current?.matchId ?? null,
	};

	return Response.json(result);
};
