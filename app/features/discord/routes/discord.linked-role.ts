import * as DiscordAPI from "../core/DiscordAPI.server";

/** Linked role verification URL set in the Discord developer portal, starts the OAuth flow. */
export const loader = () => {
	return DiscordAPI.linkedRoleAuthorizationRedirect();
};
