import clsx from "clsx";
import { differenceInSeconds } from "date-fns";
import { DoorOpen, Flag, LogOut, MoreHorizontal, Undo2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { useUser } from "~/features/auth/core/user";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { databaseTimestampToDate } from "~/utils/dates";
import * as LobbySet from "../core/LobbySet";
import type { LobbyLoaderData } from "../loaders/lobbies.$id.server";
import { PLAYERS_PER_SET } from "../lobbies-constants";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import styles from "./LobbyViewerPanel.module.css";

/** What the viewer's standing in the lobby is and what they can do about it: sign up, check in, confirm, leave. */
export function LobbyViewerPanel() {
	const { t } = useTranslation(["lobbies", "common"]);
	const user = useUser();
	const { data, currentSet } = useLobbyView();

	if (!user || data.status === "ENDED") return null;

	const { viewer, viewerActions } = data;

	if (!viewer) {
		return (
			<div className={styles.root}>
				<div className={styles.text} data-testid="lobby-viewer-status">
					{data.lobby.isViewerKicked
						? t("lobbies:viewer.kicked")
						: data.hasFriendCode
							? t("lobbies:viewer.notSignedUp")
							: t("lobbies:viewer.friendCodeNeeded")}
				</div>
				{!data.hasFriendCode && !data.lobby.isViewerKicked ? (
					<FriendCodePopover size="small" />
				) : null}
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

	const openReadyCheck =
		viewer.status === "IN_ROOM" ? undefined : data.readyChecks.at(0);
	const hasConfirmedReady =
		openReadyCheck?.users.some(
			(checkUser) =>
				checkUser.userId === viewer.id && checkUser.confirmedAt !== null,
		) ?? false;
	const isLeaveForfeiting =
		viewer.isPlayingUnfinishedSet &&
		currentSet !== null &&
		LobbySet.reportedCount(currentSet) > 0;

	return (
		<div className={styles.root}>
			<div className={styles.text} data-testid="lobby-viewer-status">
				{openReadyCheck ? (
					<ReadyCheckText
						check={openReadyCheck}
						hasConfirmed={hasConfirmedReady}
					/>
				) : (
					<ViewerStatusText />
				)}
			</div>
			<div className={styles.buttons}>
				{openReadyCheck && !hasConfirmedReady ? (
					<ActionButton
						schema={lobbyActionSchema}
						action="CONFIRM_READY"
						size="small"
						testId="lobby-confirm-ready-button"
					>
						{t("lobbies:actions.ready")}
					</ActionButton>
				) : null}
				{viewerActions.CHECK_IN && !openReadyCheck ? (
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
						icon={viewer.isDroppingAfterSet ? <Undo2 /> : <DoorOpen />}
						testId="lobby-drop-after-set-button"
					>
						{viewer.isDroppingAfterSet
							? t("lobbies:actions.stayAfterSet")
							: t("lobbies:actions.dropAfterSet")}
					</ActionButton>
				) : null}
				{viewer.isPlayingUnfinishedSet ? (
					<LeaveNowMenu isForfeiting={isLeaveForfeiting} />
				) : (
					<ActionButton
						schema={lobbyActionSchema}
						action="LEAVE"
						size="small"
						variant="outlined-destructive"
						icon={<LogOut />}
						testId="lobby-leave-button"
						confirm={{
							dialogHeading: t("lobbies:leave.heading"),
							submitButtonText: t("lobbies:actions.leave"),
							submitButtonVariant: "destructive",
						}}
					>
						{t("lobbies:actions.leave")}
					</ActionButton>
				)}
			</div>
		</div>
	);
}

/** Menu with the viewer's option to leave mid-set, kept out of sight so it isn't pressed by accident. */
function LeaveNowMenu({ isForfeiting }: { isForfeiting: boolean }) {
	const { t } = useTranslation(["lobbies"]);
	const [isConfirming, setIsConfirming] = React.useState(false);
	const { submit } = useActionSubmit(lobbyActionSchema);

	const leaveNowText = isForfeiting
		? t("lobbies:actions.leaveNowForfeit")
		: t("lobbies:actions.leaveNowCallOff");

	return (
		<>
			<SendouMenu
				trigger={
					<SendouButton
						size="small"
						variant="minimal"
						icon={<MoreHorizontal />}
						aria-label="More actions"
						testId="lobby-viewer-menu-button"
					/>
				}
			>
				<SendouMenuItem
					icon={<Flag />}
					isDestructive
					onAction={() => setIsConfirming(true)}
					data-testid="lobby-leave-now-menu-item"
				>
					{leaveNowText}
				</SendouMenuItem>
			</SendouMenu>
			<FormWithConfirm
				isOpen={isConfirming}
				onOpenChange={setIsConfirming}
				dialogHeading={
					isForfeiting
						? t("lobbies:leave.forfeitHeading")
						: t("lobbies:leave.heading")
				}
				description={
					isForfeiting
						? t("lobbies:leave.forfeitWarning")
						: t("lobbies:leave.callOffWarning")
				}
				submitButtonText={leaveNowText}
				onConfirm={() => submit("LEAVE")}
			/>
		</>
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

/** Tells the viewer waiting for a spot that one opened up and how long their priority lasts. */
function ReadyCheckText({
	check,
	hasConfirmed,
}: {
	check: LobbyLoaderData["readyChecks"][number];
	hasConfirmed: boolean;
}) {
	const { t } = useTranslation(["lobbies"]);

	return (
		<div className="stack xxxs" data-testid="lobby-ready-check">
			<div>
				{hasConfirmed
					? t("lobbies:readyCheck.confirmed")
					: t("lobbies:readyCheck.slot")}
			</div>
			<PriorityCountdown endsAt={check.expiresAt} />
		</div>
	);
}

function PriorityCountdown({ endsAt }: { endsAt: number }) {
	const { t } = useTranslation(["lobbies"]);
	const now = useAutoRerender("second");

	const secondsLeft = Math.max(
		0,
		differenceInSeconds(databaseTimestampToDate(endsAt), now),
	);

	return (
		<div
			className={clsx(styles.countdown, "text-lighter text-xs font-body")}
			data-testid="lobby-ready-check-countdown"
			// the clock has moved on since the server rendered
			suppressHydrationWarning
		>
			{secondsLeft > 0
				? t("lobbies:readyCheck.priorityEndsIn", {
						time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`,
					})
				: t("lobbies:readyCheck.firstComeFirstServed")}
		</div>
	);
}
