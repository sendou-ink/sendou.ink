import { METADATA_FIELD_TYPE } from "~/features/discord/discord-constants";
import type { MetadataField } from "~/features/discord/discord-types";
import { logger } from "~/utils/logger";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN)
	throw new Error("DISCORD_TOKEN is not set in environment variables");

if (!DISCORD_CLIENT_ID)
	throw new Error("DISCORD_CLIENT_ID is not set in environment variables");

/**
 * Register the metadata to be stored by Discord. This should be a one time action.
 * Note: uses a Bot token for authentication, not a user token.
 */
const url = `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/role-connections/metadata`;
const body: MetadataField[] = [
	{
		key: "plustier",
		name: "Plus Tier",
		description: "Current Plus Tier of the user (Plus Server membership)",
		type: METADATA_FIELD_TYPE.NUMBER_EQ,
	},
	// peak SP
	// peak XP (tentatek)
	// peak XP (takoroka)
	// tournament wins
];

const response = await fetch(url, {
	method: "PUT",
	body: JSON.stringify(body),
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bot ${DISCORD_TOKEN}`,
	},
});
if (response.ok) {
	const data = await response.json();
	logger.info(data);
} else {
	throw new Error(
		`Error pushing discord metadata schema: [${response.status}] ${response.statusText}`,
	);
}
