import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { useUser } from "~/features/auth/core/user";
import { PLAYERS_PER_SET } from "../lobbies-constants";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import styles from "./LobbyViewerPanel.module.css";

/** What the viewer's standing in the lobby is and what they can do about it: sign up, check in, confirm, leave. */
export function LobbyViewerPanel() {
	const { t } = useTranslation(["lobbies", "common"]);
	const user = useUser();
	const { data } = useLobbyView();

	if (!user || data.status === "ENDED") return null;

	const { viewer, viewerActions } = data;

	if (!viewer) {
		return (
			<div className={styles.root}>
				<div className={styles.text}>
					{data.hasFriendCode
						? t("lobbies:viewer.notSignedUp")
						: t("lobbies:viewer.friendCodeNeeded")}
				</div>
				{!data.hasFriendCode ? <FriendCodePopover size="small" /> : null}
				{viewerActions.SIGN_UP ? (
					<div className={styles.buttons}>
						<ActionButton
							schema={lobbyActionSchema}
							action="SIGN_UP"
							size="small"
							testId="lobby-sign-up-button"
						>
							{t("lobbies:actions.signUp")}
						</ActionButton>
					</div>
				) : null}
			</div>
		);
	}

	return (
		<div className={styles.root}>
			<div className={styles.text} data-testid="lobby-viewer-status">
				<ViewerStatusText />
			</div>
			<ReadyCheckPrompt />
			<div className={styles.buttons}>
				{viewerActions.CHECK_IN ? (
					<ActionButton
						schema={lobbyActionSchema}
						action="CHECK_IN"
						size="small"
						testId="lobby-check-in-button"
					>
						{t("lobbies:actions.checkIn")}
					</ActionButton>
				) : null}
				{viewerActions.DROP_AFTER_SET || viewer.isDroppingAfterSet ? (
					<ActionButton
						schema={lobbyActionSchema}
						action="TOGGLE_DROP_AFTER_SET"
						size="small"
						variant="outlined"
						testId="lobby-drop-after-set-button"
					>
						{viewer.isDroppingAfterSet
							? t("lobbies:actions.stayAfterSet")
							: t("lobbies:actions.dropAfterSet")}
					</ActionButton>
				) : null}
				<ActionButton
					schema={lobbyActionSchema}
					action="LEAVE"
					size="small"
					variant="outlined-destructive"
					icon={<LogOut />}
					testId="lobby-leave-button"
					confirm={{
						dialogHeading: t("lobbies:leave.heading"),
						description: viewer.isPlayingUnfinishedSet
							? t("lobbies:leave.forfeitWarning")
							: undefined,
						submitButtonText: t("lobbies:actions.leave"),
						submitButtonVariant: "destructive",
					}}
				>
					{t("lobbies:actions.leave")}
				</ActionButton>
			</div>
		</div>
	);
}

function ViewerStatusText() {
	const { t } = useTranslation(["lobbies"]);
	const { data, waitlist, hasStarted } = useLobbyView();
	const viewer = data.viewer!;

	switch (viewer.status) {
		case "REGISTERED":
			return data.status === "UPCOMING"
				? t("lobbies:viewer.registered")
				: t("lobbies:viewer.checkInNow");
		case "WAITLISTED": {
			const position = waitlist.findIndex((p) => p.id === viewer.id) + 1;

			return t("lobbies:viewer.waitlisted", { position });
		}
		case "CHECKED_IN":
			if (data.status === "UPCOMING" || data.status === "CHECK_IN") {
				return t("lobbies:viewer.checkedIn");
			}
			return hasStarted
				? t("lobbies:viewer.waitingForSpot")
				: t("lobbies:viewer.waitingForCheckIns", { count: PLAYERS_PER_SET });
		case "IN_ROOM": {
			if (viewer.isDroppingAfterSet) {
				return t("lobbies:viewer.droppingAfterSet");
			}
			if (viewer.isSittingOut && !viewer.isPlayingUnfinishedSet) {
				return t("lobbies:viewer.sittingOut");
			}
			if (!viewer.isPlayingUnfinishedSet && viewer.side === null) {
				return t("lobbies:viewer.spectating");
			}
			return t("lobbies:viewer.inRoom");
		}
	}
}

/** Asks the viewer waiting for a spot to confirm they're ready when one opens up. */
function ReadyCheckPrompt() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const viewer = data.viewer!;

	const openCheck =
		viewer.status === "IN_ROOM" ? undefined : data.readyChecks.at(0);
	if (!openCheck) return null;

	const hasConfirmed = openCheck.users.some(
		(checkUser) =>
			checkUser.userId === viewer.id && checkUser.confirmedAt !== null,
	);

	return (
		<div className={styles.readyCheck} data-testid="lobby-ready-check">
			<div>{t("lobbies:readyCheck.slot")}</div>
			{hasConfirmed ? (
				<div className="text-lighter text-sm">
					{t("lobbies:readyCheck.confirmed")}
				</div>
			) : (
				<ActionButton
					schema={lobbyActionSchema}
					action="CONFIRM_READY"
					size="small"
					variant="success"
					testId="lobby-confirm-ready-button"
				>
					{t("lobbies:actions.ready")}
				</ActionButton>
			)}
		</div>
	);
}
