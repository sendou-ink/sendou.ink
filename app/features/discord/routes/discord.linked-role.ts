import { redirect } from "react-router";
import * as DiscordAPI from "~/features/discord/core/DiscordAPI.server";
import { clientStateCookie } from "../discord-utils.server";

export const loader = async () => {
	const { url, state } = DiscordAPI.getOAuthUrl();

	// Store the signed state param in the user's cookies so we can verify
	// the value later. See:
	// https://discord.com/developers/docs/topics/oauth2#state-and-security
	return redirect(url, {
		headers: {
			"Set-Cookie": await clientStateCookie.serialize(state),
		},
	});
};
