import type { UserReportCategory } from "~/db/tables";
import { logger } from "~/utils/logger";
import { SENDOU_INK_BASE_URL, userPage } from "~/utils/urls";
import { USER_REPORT_CATEGORY_LABELS } from "../user-report-constants";

const EMBED_DESCRIPTION_MAX_LENGTH = 1000;

/**
 * Posts a rich embed about a new/updated user report to the mod channel Discord webhook.
 * Fire-and-forget: meant to be called without awaiting, never throws, skipped with a log
 * line when `USER_REPORT_DISCORD_WEBHOOK_URL` is unset (e.g. in development).
 */
export function sendUserReportWebhook(args: {
	reportedUser: { id: number; username: string };
	reporter: { username: string; discordId: string; customUrl: string | null };
	category: UserReportCategory;
	description: string;
	isUpdate: boolean;
}) {
	const webhookUrl = process.env.USER_REPORT_DISCORD_WEBHOOK_URL;
	if (!webhookUrl) {
		logger.info(
			"USER_REPORT_DISCORD_WEBHOOK_URL not set, skipping user report webhook",
		);
		return;
	}

	const reportedUserAdminUrl = `${SENDOU_INK_BASE_URL}/u/${args.reportedUser.id}/admin`;
	const reporterUrl = `${SENDOU_INK_BASE_URL}${userPage(args.reporter)}`;

	const body = {
		embeds: [
			{
				title: args.isUpdate ? "User report updated" : "New user report",
				fields: [
					{
						name: "Reported user",
						value: `[${args.reportedUser.username}](${reportedUserAdminUrl})`,
					},
					{
						name: "Reporter",
						value: `[${args.reporter.username}](${reporterUrl})`,
					},
					{
						name: "Category",
						value: USER_REPORT_CATEGORY_LABELS[args.category],
					},
					{
						name: "Description",
						value: truncate(args.description),
					},
				],
				timestamp: new Date().toISOString(),
			},
		],
	};

	fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
		.then((response) => {
			if (!response.ok) {
				logger.error(
					`User report webhook responded with status ${response.status}`,
				);
			}
		})
		.catch((error) => {
			logger.error("Failed to send user report webhook", error);
		});
}

function truncate(description: string) {
	if (description.length <= EMBED_DESCRIPTION_MAX_LENGTH) return description;

	return `${description.slice(0, EMBED_DESCRIPTION_MAX_LENGTH)}…`;
}
