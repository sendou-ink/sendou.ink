import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod/v4";
import { userByIdentifierQuery } from "~/utils/kysely.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import type { GetUserIdsResponse } from "../schema";

const paramsSchema = z.object({
	identifier: z.string(),
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { identifier } = parseParams({ params, schema: paramsSchema });

	const user = notFoundIfNullish(
		await userByIdentifierQuery(identifier)
			.select(["User.discordId", "User.customUrl"])
			.executeTakeFirst(),
	);

	const result: GetUserIdsResponse = {
		id: user.id,
		discordId: user.discordId,
		customUrl: user.customUrl,
	};

	return Response.json(result);
};
