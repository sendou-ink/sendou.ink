const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
// const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;

export function getOAuthUrl() {
	const state = crypto.randomUUID();

	const url = new URL("https://discord.com/api/oauth2/authorize");
	url.searchParams.set("client_id", DISCORD_CLIENT_ID);
	url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("state", state);
	url.searchParams.set("scope", "role_connections.write identify");
	url.searchParams.set("prompt", "consent");

	return { url: url.toString(), state };
}
