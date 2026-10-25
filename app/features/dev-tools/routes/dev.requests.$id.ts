import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as RequestLog from "../core/RequestLog.server";
import { requireDevTools } from "../dev-tools-utils.server";

export type DevRequestLoaderData = ReturnType<typeof loader>;

export const loader = ({ request, params }: LoaderFunctionArgs) => {
	requireDevTools(request);

	const { id } = parseParams({ params, schema: idObject });
	const loggedRequest = notFoundIfNullish(
		RequestLog.recent().find((candidate) => candidate.id === id),
	);

	return {
		request: loggedRequest,
		repeatedQueries: RequestLog.repeatedQueries(loggedRequest),
	};
};
