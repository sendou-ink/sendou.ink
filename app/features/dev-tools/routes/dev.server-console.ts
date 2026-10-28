import type { LoaderFunctionArgs } from "react-router";
import { defineAction } from "~/form/define-action.server";
import * as ServerConsole from "../core/ServerConsole.server";
import { requireDevTools } from "../dev-tools-utils.server";

export type DevServerConsoleLoaderData = ReturnType<typeof loader>;

export const loader = ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	return { entries: ServerConsole.recent(), now: Date.now() };
};

export const action = defineAction(async ({ request }) => {
	requireDevTools(request);

	ServerConsole.clear();

	return null;
});
