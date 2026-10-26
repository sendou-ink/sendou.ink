import { Crown, MoreHorizontal, Pause, Play, UserX } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useHasPermission } from "~/modules/permissions/hooks";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";

/** The host's actions for a participant: sitting them out of the next set, making them the host and removing them. */
export function LobbyPlayerMenu({ userId }: { userId: number }) {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const isHost = useHasPermission(data.lobby, "MANAGE");
	const [isConfirmingKick, setIsConfirmingKick] = React.useState(false);
	const [isConfirmingMakeHost, setIsConfirmingMakeHost] = React.useState(false);
	const { submit } = useActionSubmit(lobbyActionSchema);

	const participant = data.lobby.participants.find(
		(candidate) => candidate.id === userId,
	);
	if (!isHost || !participant || data.lobby.endedAt !== null) return null;

	const canSitOut = participant.status === "IN_ROOM";
	const isOtherThanHost = participant.id !== data.lobby.hostUserId;

	if (!canSitOut && !isOtherThanHost) return null;

	return (
		<>
			<SendouMenu
				trigger={
					<SendouButton
						size="miniscule"
						variant="minimal"
						icon={<MoreHorizontal />}
						aria-label="Actions"
						testId={`lobby-player-menu-${participant.id}`}
					/>
				}
			>
				{canSitOut ? (
					<SendouMenuItem
						icon={participant.isSittingOut ? <Play /> : <Pause />}
						onAction={() =>
							submit("TOGGLE_SIT_OUT", { userId: participant.id })
						}
					>
						{participant.isSittingOut
							? t("lobbies:admin.undoSitOut")
							: t("lobbies:admin.sitOut")}
					</SendouMenuItem>
				) : null}
				{isOtherThanHost ? (
					<SendouMenuItem
						icon={<Crown />}
						onAction={() => setIsConfirmingMakeHost(true)}
					>
						{t("lobbies:admin.makeHost")}
					</SendouMenuItem>
				) : null}
				{isOtherThanHost ? (
					<SendouMenuItem
						icon={<UserX />}
						isDestructive
						onAction={() => setIsConfirmingKick(true)}
					>
						{t("lobbies:admin.kick")}
					</SendouMenuItem>
				) : null}
			</SendouMenu>
			<FormWithConfirm
				isOpen={isConfirmingMakeHost}
				onOpenChange={setIsConfirmingMakeHost}
				dialogHeading={t("lobbies:admin.makeHost.heading", {
					user: participant.username,
				})}
				description={t("lobbies:admin.makeHost.explanation")}
				submitButtonText={t("lobbies:admin.makeHost")}
				onConfirm={() => submit("MAKE_HOST", { userId: participant.id })}
			/>
			<FormWithConfirm
				isOpen={isConfirmingKick}
				onOpenChange={setIsConfirmingKick}
				dialogHeading={t("lobbies:admin.kick.heading", {
					user: participant.username,
				})}
				description={t("lobbies:admin.kick.explanation")}
				submitButtonText={t("lobbies:admin.kick")}
				onConfirm={() => submit("KICK", { userId: participant.id })}
			/>
		</>
	);
}
