import type { LoaderFunctionArgs } from "react-router";
import * as DevToolsRepository from "../DevToolsRepository.server";
import { usersSearchParams } from "../dev-tools-search-params";
import { requireDevTools } from "../dev-tools-utils.server";

export type DevUsersLoaderData = Awaited<ReturnType<typeof loader>>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	const { ids } = usersSearchParams.parse(request);

	return {
		users:
			ids.length > 0 ? await DevToolsRepository.findAllUsersByIds(ids) : [],
	};
};
