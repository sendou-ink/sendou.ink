import type { UserReportCategory } from "~/db/tables";
import {
	sendModDiscordWebhook,
	truncateEmbedValue,
	userAdminPageLink,
	userPageLink,
	type WebhookUser,
} from "~/modules/discord-webhook.server";
import { SENDOU_INK_BASE_URL, sendouQMatchPage } from "~/utils/urls";
import { USER_REPORT_CATEGORY_LABELS } from "../user-report-constants";

/**
 * Posts a rich embed about a new/updated user report to the mod channel Discord webhook.
 * Fire-and-forget (see `sendModDiscordWebhook`).
 */
export function sendUserReportWebhook(args: {
	reportedUser: WebhookUser;
	reporter: WebhookUser;
	category: UserReportCategory;
	description: string;
	matchId: number | null;
	isUpdate: boolean;
	reportCounts: { lastMonth: number; lastYear: number };
}) {
	sendModDiscordWebhook({
		title: args.isUpdate ? "User report updated" : "New user report",
		fields: [
			{
				name: "Reported user",
				value: userAdminPageLink(args.reportedUser),
			},
			{
				name: "Reporter",
				value: userPageLink(args.reporter),
			},
			{
				name: "Category",
				value: USER_REPORT_CATEGORY_LABELS[args.category],
			},
			{
				name: "Description",
				value: truncateEmbedValue(args.description),
			},
			...(args.matchId !== null
				? [
						{
							name: "SendouQ match",
							value: `[#${args.matchId}](${SENDOU_INK_BASE_URL}${sendouQMatchPage(args.matchId)})`,
						},
					]
				: []),
			{
				name: "Reports against this user",
				value: `Last month: ${args.reportCounts.lastMonth} • Last year: ${args.reportCounts.lastYear}`,
			},
		],
	});
}
