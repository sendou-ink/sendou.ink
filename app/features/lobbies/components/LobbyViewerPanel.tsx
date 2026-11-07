import clsx from "clsx";
import { differenceInSeconds } from "date-fns";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { useUser } from "~/features/auth/core/user";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { databaseTimestampToDate } from "~/utils/dates";
import type { LobbyLoaderData } from "../loaders/lobbies.$id.server";
import { PLAYERS_PER_SET } from "../lobbies-constants";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import styles from "./LobbyViewerPanel.module.css";

/** What the viewer's standing in the lobby is and what they can do about it: sign up (or apply), check in, confirm, leave. Hidden while they play a set, its Action tab has their options then. */
export function LobbyViewerPanel() {
	const { t } = useTranslation(["lobbies", "common"]);
	const user = useUser();
	const { data } = useLobbyView();

	if (!user || data.status === "ENDED" || data.viewer?.isPlayingUnfinishedSet) {
		return null;
	}

	const { viewer, viewerActions } = data;

	if (!viewer) {
		const { isViewerKicked, viewerApplication, isApplicationRequired } =
			data.lobby;

		return (
			<div className={styles.root}>
				<div className={styles.text} data-testid="lobby-viewer-status">
					{isViewerKicked
						? t("lobbies:viewer.kicked")
						: viewerApplication === "DENIED"
							? t("lobbies:viewer.applicationDeclined")
							: viewerApplication === "PENDING"
								? t("lobbies:viewer.applied")
								: !data.hasFriendCode
									? t("lobbies:viewer.friendCodeNeeded")
									: isApplicationRequired
										? t("lobbies:viewer.notApplied")
										: t("lobbies:viewer.notSignedUp")}
				</div>
				{!data.hasFriendCode && !isViewerKicked && !viewerApplication ? (
					<FriendCodePopover size="small" />
				) : null}
				{viewerActions.SIGN_UP ? (
					<div className={styles.buttons}>
						<ActionButton
							schema={lobbyActionSchema}
							action="SIGN_UP"
							size="small"
							testId={
								isApplicationRequired
									? "lobby-apply-button"
									: "lobby-sign-up-button"
							}
						>
							{isApplicationRequired
								? t("common:actions.apply")
								: t("lobbies:actions.signUp")}
						</ActionButton>
					</div>
				) : null}
				{viewerApplication === "PENDING" ? (
					<div className={styles.buttons}>
						<ActionButton
							schema={lobbyActionSchema}
							action="WITHDRAW_APPLICATION"
							size="small"
							variant="outlined-destructive"
							testId="lobby-withdraw-application-button"
						>
							{t("lobbies:actions.withdrawApplication")}
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
			return data.isCheckInOpen
				? t("lobbies:viewer.checkInNow")
				: t("lobbies:viewer.registered");
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
			if (viewer.isSittingOut) {
				return t("lobbies:viewer.sittingOut");
			}
			if (viewer.side === null) {
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
