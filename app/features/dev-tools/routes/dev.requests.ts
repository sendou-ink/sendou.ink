import type { LoaderFunctionArgs } from "react-router";
import { defineAction } from "~/form/define-action.server";
import * as RequestLog from "../core/RequestLog.server";
import { requireDevTools } from "../dev-tools-utils.server";

export type DevRequestsLoaderData = ReturnType<typeof loader>;

export const loader = ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	return { requests: RequestLog.recent().map(RequestLog.summary) };
};

export const action = defineAction(async ({ request }) => {
	requireDevTools(request);

	RequestLog.clear();

	return null;
});
