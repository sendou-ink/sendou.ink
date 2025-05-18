import { cachified } from "@epic-web/cachified";
import { cache } from "~/utils/cache.server";
import { tokenResponseSchema } from "./schemas";
import { getTwitchEnvVars } from "./utils";

async function getFreshToken() {
	const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = getTwitchEnvVars();

	const res = await fetch(
		`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
		{ method: "POST" },
	);
	if (!res.ok) {
		throw new Error(
			`Getting Twitch token failed with status code: ${res.status}`,
		);
	}

	const parsed = tokenResponseSchema.safeParse(await res.json());
	if (!parsed.success) {
		throw new Error("Token response schema validation failed");
	}

	return parsed.data.access_token;
}

export function getToken() {
	return cachified({
		key: "twitch-token",
		cache,
		getFreshValue() {
			return getFreshToken();
		},
	});
}

export function purgeCachedToken() {
	cache.delete("twitch-token");
}
