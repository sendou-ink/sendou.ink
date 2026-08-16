import invariant from "@sendou/utils/invariant";
import { ServerConfig } from "~/config.server";

export const hasTwitchEnvVars = () =>
	Boolean(ServerConfig.twitch.clientId && ServerConfig.twitch.clientSecret);

export const getTwitchEnvVars = () => {
	const { clientId, clientSecret } = ServerConfig.twitch;
	invariant(clientId, "Missing TWITCH_CLIENT_ID env var, showing no streams");
	invariant(
		clientSecret,
		"Missing TWITCH_CLIENT_SECRET env var, showing no streams",
	);

	return { TWITCH_CLIENT_ID: clientId, TWITCH_CLIENT_SECRET: clientSecret };
};
