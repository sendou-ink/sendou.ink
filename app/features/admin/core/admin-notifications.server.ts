import { logger } from "~/utils/logger";

const DISCORD_ADMIN_WEBHOOK_URL = process.env.DISCORD_ADMIN_WEBHOOK_URL;

if (!DISCORD_ADMIN_WEBHOOK_URL) {
	logger.info(
		"DISCORD_ADMIN_WEBHOOK_URL not set, admin notifications disabled",
	);
}

export async function send(message: string): Promise<void> {
	if (!DISCORD_ADMIN_WEBHOOK_URL) {
		return;
	}

	try {
		const response = await fetch(DISCORD_ADMIN_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: message }),
		});

		if (!response.ok) {
			logger.error(`Failed to send admin notification: ${response.status}`);
		}
	} catch (error) {
		logger.error("Failed to send admin notification", error);
	}
}
