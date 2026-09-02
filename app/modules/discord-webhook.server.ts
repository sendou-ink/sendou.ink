import { logger } from "~/utils/logger";
import { SENDOU_INK_BASE_URL, userAdminPage, userPage } from "~/utils/urls";

const EMBED_FIELD_VALUE_MAX_LENGTH = 1000;

interface ModWebhookEmbed {
	title: string;
	fields: Array<{ name: string; value: string }>;
}

export interface WebhookUser {
	username: string;
	discordId: string;
	customUrl: string | null;
}

/** Fire-and-forget embed to the mod channel: never throws, skipped with a log line when `MOD_DISCORD_WEBHOOK_URL` is unset. */
export function sendModDiscordWebhook(embed: ModWebhookEmbed) {
	sendDiscordWebhook("MOD_DISCORD_WEBHOOK_URL", embed);
}

/** Embed to the SendouQ canceled matches channel, fire-and-forget like {@link sendModDiscordWebhook}. */
export function sendSQCancelDiscordWebhook(embed: ModWebhookEmbed) {
	sendDiscordWebhook("SQ_CANCEL_DISCORD_WEBHOOK_URL", embed);
}

function sendDiscordWebhook(
	envVarName: "MOD_DISCORD_WEBHOOK_URL" | "SQ_CANCEL_DISCORD_WEBHOOK_URL",
	embed: ModWebhookEmbed,
) {
	const webhookUrl = process.env[envVarName];
	if (!webhookUrl) {
		logger.info(`${envVarName} not set, skipping Discord webhook`);
		return;
	}

	const body = {
		embeds: [{ ...embed, timestamp: new Date().toISOString() }],
		allowed_mentions: { parse: [] },
	};

	fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
		.then((response) => {
			if (!response.ok) {
				logger.error(
					`Discord webhook responded with status ${response.status}`,
				);
			}
		})
		.catch((error) => {
			logger.error("Failed to send Discord webhook", error);
		});
}

/** Escapes then truncates user text to fit an embed field value without breaking its markdown. */
export function truncateEmbedValue(text: string) {
	const escaped = escapeMarkdown(text);
	if (escaped.length <= EMBED_FIELD_VALUE_MAX_LENGTH) return escaped;

	return `${escaped.slice(0, EMBED_FIELD_VALUE_MAX_LENGTH)}…`;
}

/** Markdown link to the user's admin tab (moderation actions & notes). */
export function userAdminPageLink(user: WebhookUser) {
	return `[${escapeMarkdown(user.username)}](${SENDOU_INK_BASE_URL}${userAdminPage(user)})`;
}

/** Markdown link to the user's profile page. */
export function userPageLink(user: WebhookUser) {
	return `[${escapeMarkdown(user.username)}](${SENDOU_INK_BASE_URL}${userPage(user)})`;
}

/** Backslash-escapes Discord markdown so user text can't forge links or break formatting. */
export function escapeMarkdown(text: string) {
	return text.replace(/[\\`*_~|()[\]]/g, "\\$&");
}
