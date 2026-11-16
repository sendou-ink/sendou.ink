import { METADATA_FIELD_TYPE } from "~/features/discord/discord-constants";
import type { MetadataField } from "~/features/discord/discord-types";
import { logger } from "~/utils/logger";

/**
 * Registers the linked role metadata fields with Discord. Run again whenever the fields change.
 * Authenticates with the bot token of the application, not a user token.
 */

try {
	process.loadEnvFile();
} catch {
	// .env is optional, the variables can also come from the environment
}

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
	throw new Error("DISCORD_BOT_TOKEN is not set in environment variables");
}

if (!DISCORD_CLIENT_ID) {
	throw new Error("DISCORD_CLIENT_ID is not set in environment variables");
}

const fields: MetadataField[] = [
	{
		key: "plustier",
		name: "Plus Tier",
		description: "Current Plus Server tier",
		type: METADATA_FIELD_TYPE.INTEGER_EQUAL,
	},
];

const response = await fetch(
	`https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/role-connections/metadata`,
	{
		method: "PUT",
		body: JSON.stringify(fields),
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
		},
	},
);

if (!response.ok) {
	throw new Error(
		`Registering Discord metadata fields failed: [${response.status}] ${await response.text()}`,
	);
}

logger.info(await response.json());
logger.info("Registered Discord metadata fields");
