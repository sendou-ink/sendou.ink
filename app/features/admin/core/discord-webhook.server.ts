import {
	sendModDiscordWebhook,
	truncateEmbedValue,
	userAdminPageLink,
	userPageLink,
	type WebhookUser,
} from "~/modules/discord-webhook.server";

/**
 * Posts a rich embed about a user getting banned to the mod channel Discord webhook.
 * Fire-and-forget (see `sendModDiscordWebhook`).
 */
export function sendUserBannedWebhook(args: {
	bannedUser: WebhookUser;
	bannedBy: WebhookUser;
	reason: string | null;
	/** When the ban ends, null when the ban has no end date */
	expiresAt: Date | null;
}) {
	sendModDiscordWebhook({
		title: "User banned",
		fields: [
			{
				name: "Banned user",
				value: userAdminPageLink(args.bannedUser),
			},
			{
				name: "Banned by",
				value: userPageLink(args.bannedBy),
			},
			{
				name: "Expires",
				value: args.expiresAt
					? `<t:${Math.floor(args.expiresAt.getTime() / 1000)}:f>`
					: "No end date",
			},
			...(args.reason
				? [
						{
							name: "Reason",
							value: truncateEmbedValue(args.reason),
						},
					]
				: []),
		],
	});
}

/**
 * Posts a rich embed about a user getting unbanned to the mod channel Discord webhook.
 * Fire-and-forget (see `sendModDiscordWebhook`).
 */
export function sendUserUnbannedWebhook(args: {
	unbannedUser: WebhookUser;
	unbannedBy: WebhookUser;
}) {
	sendModDiscordWebhook({
		title: "User unbanned",
		fields: [
			{
				name: "Unbanned user",
				value: userAdminPageLink(args.unbannedUser),
			},
			{
				name: "Unbanned by",
				value: userPageLink(args.unbannedBy),
			},
		],
	});
}
