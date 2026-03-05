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
import { databaseTimestampToDate } from "~/utils/dates";
import { SENDOUQ_LOOKING_PAGE, tournamentPage } from "~/utils/urls";

export function FriendMenu({
	discordId,
	discordAvatar,
	name,
	subtitle,
	badge,
	url,
	tournamentId,
	friendshipId,
	friendshipCreatedAt,
}: {
	discordId: string;
	discordAvatar: string | null;
	name: string;
	subtitle: string | null;
	badge: string | null;
	url: string;
	tournamentId: number | null;
	friendshipId?: number;
	friendshipCreatedAt?: number | null;
}) {
	const { t } = useTranslation(["common", "friends"]);
	const fetcher = useFetcher();
	const [confirmOpen, setConfirmOpen] = React.useState(false);

	const friendSinceText = friendshipCreatedAt
		? t("friends:friendsList.friendSince", {
				date: databaseTimestampToDate(friendshipCreatedAt).toLocaleDateString(),
			})
		: null;

	const activityHref = resolveActivityHref({ subtitle, tournamentId });

	return (
		<>
			<SendouMenu
				trigger={
					<ListButton
						user={{ discordId, discordAvatar }}
						subtitle={subtitle}
						badge={badge}
					>
						{name}
					</ListButton>
				}
			>
				<SendouMenuSection headerText={friendSinceText ?? undefined}>
					<SendouMenuItem href={url} icon={<User />}>
						{t("friends:friendsList.viewUserPage")}
					</SendouMenuItem>
					{activityHref ? (
						<SendouMenuItem href={activityHref.url} icon={<Swords />}>
							{activityHref.isSendouQ
								? t("friends:friendsList.joinSendouQ")
								: t("friends:friendsList.viewTournament")}
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

function resolveActivityHref(friend: {
	subtitle: string | null;
	tournamentId: number | null;
}) {
	if (!friend.subtitle) return null;

	if (friend.subtitle === "SendouQ") {
		return { url: SENDOUQ_LOOKING_PAGE, isSendouQ: true };
	}

	if (friend.tournamentId) {
		return { url: tournamentPage(friend.tournamentId), isSendouQ: false };
	}

	return null;
}
