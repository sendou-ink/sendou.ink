import { Swords, Trash2, User } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import {
	SendouMenu,
	SendouMenuItem,
	SendouMenuSection,
} from "~/components/elements/Menu";
import { ListButton } from "~/components/SideNav";
import {
	type FriendActivityType,
	isLiveFriendActivity,
} from "~/features/friends/friends-constants";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import {
	SENDOUQ_PAGE,
	sendouQMatchPage,
	tournamentMatchPage,
	tournamentPage,
	tournamentSubsPage,
} from "~/utils/urls";

export function FriendMenu({
	discordId,
	discordAvatar,
	customAvatarUrl,
	name,
	subtitle,
	badge,
	url,
	activityType,
	matchId,
	tournamentId,
	friendshipId,
	friendshipCreatedAt,
	onNavigate,
}: {
	discordId: string;
	discordAvatar: string | null;
	customAvatarUrl: string | null;
	name: string;
	subtitle: string | null;
	badge: string | null;
	url: string;
	activityType: FriendActivityType | null;
	matchId: number | null;
	tournamentId: number | null;
	friendshipId?: number;
	friendshipCreatedAt?: number | null;
	onNavigate?: () => void;
}) {
	const { t } = useTranslation(["common", "friends"]);
	const { formatter: dateFormatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
		year: "numeric",
	});
	const fetcher = useFetcher();
	const [confirmOpen, setConfirmOpen] = React.useState(false);

	const friendSinceText = friendshipCreatedAt
		? t("friends:friendsList.friendSince", {
				date: dateFormatter.format(friendshipCreatedAt) ?? "",
			})
		: null;

	const isLive = isLiveFriendActivity(activityType);
	const activity = resolveActivity({ activityType, matchId, tournamentId });

	return (
		<>
			<SendouMenu
				trigger={
					<ListButton
						user={{ discordId, discordAvatar, customAvatarUrl }}
						subtitle={subtitle}
						badge={isLive ? t("friends:friendsList.live") : badge}
						badgeVariant={isLive ? "warning" : "default"}
					>
						{name}
					</ListButton>
				}
			>
				<SendouMenuSection headerText={friendSinceText ?? undefined}>
					<SendouMenuItem href={url} icon={<User />} onAction={onNavigate}>
						{t("friends:friendsList.viewUserPage")}
					</SendouMenuItem>
					{activity?.type === "join-sendouq" ? (
						<SendouMenuItem
							icon={<Swords />}
							onAction={() => {
								fetcher.submit(
									{ _action: "JOIN_QUEUE", direct: "true" },
									{ method: "post", action: SENDOUQ_PAGE },
								);
								onNavigate?.();
							}}
						>
							{t("friends:friendsList.joinSendouQ")}
						</SendouMenuItem>
					) : null}
					{activity?.type === "view-match" ? (
						<SendouMenuItem
							href={activity.url}
							icon={<Swords />}
							onAction={onNavigate}
						>
							{t("friends:friendsList.viewMatch")}
						</SendouMenuItem>
					) : null}
					{activity?.type === "view-tournament" ? (
						<SendouMenuItem
							href={activity.url}
							icon={<Swords />}
							onAction={onNavigate}
						>
							{t("friends:friendsList.viewTournament")}
						</SendouMenuItem>
					) : null}
					{friendshipId !== undefined ? (
						<SendouMenuItem
							icon={<Trash2 />}
							isDestructive
							onAction={() => setConfirmOpen(true)}
						>
							{t("friends:friendsList.deleteFriend")}
						</SendouMenuItem>
					) : null}
				</SendouMenuSection>
			</SendouMenu>
			{friendshipId !== undefined ? (
				<SendouDialog
					isOpen={confirmOpen}
					onClose={() => setConfirmOpen(false)}
					onOpenChange={() => setConfirmOpen(false)}
					isDismissable
				>
					<div className="stack md">
						<h2 className="text-md text-center">
							{t("friends:friendsList.deleteConfirm", { name })}
						</h2>
						<div className="stack horizontal md justify-center mt-2">
							<SendouButton
								variant="destructive"
								onPress={() => {
									fetcher.submit(
										{
											_action: "DELETE_FRIEND",
											friendshipId: String(friendshipId),
										},
										{ method: "post" },
									);
									setConfirmOpen(false);
								}}
							>
								{t("common:actions.delete")}
							</SendouButton>
						</div>
					</div>
				</SendouDialog>
			) : null}
		</>
	);
}

function resolveActivity(friend: {
	activityType: FriendActivityType | null;
	matchId: number | null;
	tournamentId: number | null;
}) {
	switch (friend.activityType) {
		case "SENDOUQ_MATCH":
			return friend.matchId
				? ({
						type: "view-match",
						url: sendouQMatchPage(friend.matchId),
					} as const)
				: null;
		case "TOURNAMENT_MATCH":
			return friend.tournamentId && friend.matchId
				? ({
						type: "view-match",
						url: tournamentMatchPage({
							tournamentId: friend.tournamentId,
							matchId: friend.matchId,
						}),
					} as const)
				: null;
		case "TOURNAMENT_PLAYING":
			return friend.tournamentId
				? ({
						type: "view-tournament",
						url: tournamentPage(friend.tournamentId),
					} as const)
				: null;
		case "SENDOUQ":
			return { type: "join-sendouq" } as const;
		case "TOURNAMENT_SUB":
			return friend.tournamentId
				? ({
						type: "view-tournament",
						url: tournamentSubsPage(friend.tournamentId),
					} as const)
				: null;
		default:
			return null;
	}
}
