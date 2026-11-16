import type { LoaderFunctionArgs } from "react-router";
import * as DiscordAPI from "../core/DiscordAPI.server";

/** Linked role verification URL set in the Discord developer portal, starts the OAuth flow. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
	await DiscordAPI.linkedRoleStrategy.authenticate(request);

	return null;
};
