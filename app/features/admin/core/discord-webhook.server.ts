import {
	sendModDiscordWebhook,
	truncateEmbedValue,
	userAdminPageLink,
	userPageLink,
	type WebhookUser,
} from "~/modules/discord-webhook.server";

/** Fire-and-forget embed to the mod channel webhook. */
export function sendUserBannedWebhook(args: {
	bannedUser: WebhookUser;
	bannedBy: WebhookUser;
	reason: string | null;
	/** null = permanent */
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

/** Fire-and-forget embed to the mod channel webhook. */
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
