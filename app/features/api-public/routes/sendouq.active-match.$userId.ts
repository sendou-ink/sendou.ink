import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetUsersActiveSendouqMatchResponse } from "../schema";

const paramsSchema = v.object({
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
