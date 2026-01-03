import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { getUserId } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseSearchParams } from "~/utils/remix.server";
import { queryToUserIdentifier } from "~/utils/users";

export type UserSearchLoaderData = SerializeFrom<typeof loader>;

const searchParamsSchema = z.object({
	q: z.string().max(100).catch(""),
	limit: z.coerce.number().int().min(1).max(25).catch(25),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		const user = await getUserId(request);
		if (!user) {
			return null;
		}
	}

	const { q: query, limit } = parseSearchParams({
		request,
		schema: searchParamsSchema,
	});

	if (!query) return null;

	const identifier = queryToUserIdentifier(query);

	return {
		users: identifier
			? await UserRepository.searchExact(identifier)
			: await UserRepository.search({ query, limit }),
		query,
	};
};
