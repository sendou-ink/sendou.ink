import {
	escapeMarkdown,
	sendSQCancelDiscordWebhook,
	truncateEmbedValue,
	userPageLink,
	type WebhookUser,
} from "~/modules/discord-webhook.server";
import invariant from "~/utils/invariant";
import { SENDOU_INK_BASE_URL, sendouQMatchPage } from "~/utils/urls";

type MatchMember = WebhookUser & { id: number };

interface CancelReport {
	authorUserId: number;
	reason: string;
	nominatedPlayers: Array<{ userId: number }>;
}

/**
 * Posts a rich embed about a finalized SendouQ match cancellation to the SendouQ
 * cancels channel Discord webhook. Fire-and-forget (see `sendSQCancelDiscordWebhook`).
 */
export function sendMatchCanceledWebhook(args: {
	matchId: number;
	members: MatchMember[];
	/** Both teams' cancel reports, requester's first. */
	reports: CancelReport[];
	nominationCounts: Array<{
		userId: number;
		seasonCount: number;
		yearCount: number;
	}>;
}) {
	const memberById = new Map(args.members.map((member) => [member.id, member]));
	const memberFor = (userId: number) => {
		const member = memberById.get(userId);
		invariant(member, "Cancel report user is not a member of the match");
		return member;
	};

	const nominatedIdSets = args.reports.map(
		(report) => new Set(report.nominatedPlayers.map((player) => player.userId)),
	);
	const teamsAgree =
		nominatedIdSets.length === 2 &&
		nominatedIdSets[0].size === nominatedIdSets[1].size &&
		[...nominatedIdSets[0]].every((userId) => nominatedIdSets[1].has(userId));

	sendSQCancelDiscordWebhook({
		title: "SendouQ match canceled",
		fields: [
			{
				name: "Match",
				value: `[#${args.matchId}](${SENDOU_INK_BASE_URL}${sendouQMatchPage(args.matchId)})`,
			},
			...args.reports.flatMap((report, index) => {
				const side = index === 0 ? "Requesting team" : "Accepting team";
				return [
					{
						name: `${side}'s reason (by ${escapeMarkdown(memberFor(report.authorUserId).username)})`,
						value: truncateEmbedValue(report.reason),
					},
					{
						name: `${side}'s nominated players`,
						value: report.nominatedPlayers
							.map((player) => userPageLink(memberFor(player.userId)))
							.join(", "),
					},
				];
			}),
			{
				name: "Teams nominated the same players",
				value: teamsAgree ? "Yes" : "No (split)",
			},
			{
				name: "Times nominated in canceled matches",
				value: args.nominationCounts
					.map(
						(count) =>
							`${userPageLink(memberFor(count.userId))} — season: ${count.seasonCount} • year: ${count.yearCount}`,
					)
					.join("\n"),
			},
		],
	});
}
