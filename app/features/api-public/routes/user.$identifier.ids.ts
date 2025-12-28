import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod/v4";
import { identifierToUserIdQuery } from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { handleOptionsRequest } from "../api-public-utils.server";
import type { GetUserIdsResponse } from "../schema";

const paramsSchema = z.object({
	identifier: z.string(),
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);

	const { identifier } = parseParams({ params, schema: paramsSchema });

	const user = notFoundIfFalsy(
		await identifierToUserIdQuery(identifier)
			.select(["User.discordId", "User.customUrl"])
			.executeTakeFirst(),
	);

	const result: GetUserIdsResponse = {
		id: user.id,
		discordId: user.discordId,
		customUrl: user.customUrl,
	};

	return await cors(request, json(result));
};
