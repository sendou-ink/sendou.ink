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
import { SENDOUQ_ACTIVITY_LABEL } from "~/features/friends/friends-constants";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { SENDOUQ_PAGE, tournamentSubsPage } from "~/utils/urls";

export function FriendMenu({
	discordId,
	discordAvatar,
	customAvatarUrl,
	name,
	subtitle,
	badge,
	url,
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

	const activity = resolveActivity({ subtitle, tournamentId });

	return (
		<>
			<SendouMenu
				trigger={
					<ListButton
						user={{ discordId, discordAvatar, customAvatarUrl }}
						subtitle={subtitle}
						badge={badge}
					>
						{name}
					</ListButton>
				}
			>
				<SendouMenuSection headerText={friendSinceText ?? undefined}>
					<SendouMenuItem href={url} icon={<User />} onAction={onNavigate}>
						{t("friends:friendsList.viewUserPage")}
					</SendouMenuItem>
					{activity?.type === "sendouq" ? (
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
					{activity?.type === "tournament" ? (
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
	subtitle: string | null;
	tournamentId: number | null;
}) {
	if (!friend.subtitle) return null;

	if (friend.subtitle === SENDOUQ_ACTIVITY_LABEL) {
		return { type: "sendouq" } as const;
	}

	if (friend.tournamentId) {
		return {
			type: "tournament",
			url: tournamentSubsPage(friend.tournamentId),
		} as const;
	}

	return null;
}
