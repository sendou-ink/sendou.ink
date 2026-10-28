import { Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import { Image } from "~/components/Image";
import {
	ActivityBadge,
	ActivityButton,
} from "~/components/layout/ActivityButton";
import {
	ActivityPanel,
	ActivityPanelHeader,
} from "~/components/layout/ActivityPanel";
import type { BracketsPageState } from "~/features/tournament-bracket/routes/to.$id.brackets";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { navIconUrl } from "~/utils/urls";
import { useGlobalStatus } from "../GlobalStatusProvider";
import type { GlobalStatus, GlobalStatusState } from "../global-status-types";
import styles from "./StatusActivity.module.css";

const STATE_NAV_ICON: Record<GlobalStatusState, string> = {
	SQ_PREPARING: "sendouq",
	SQ_QUEUED: "sendouq",
	SQ_EXPIRED: "sendouq",
	SQ_READY_CHECK: "sendouq",
	SQ_MATCH: "sendouq",
	TO_CHECKIN: "medal",
	TO_MATCH: "medal",
	TO_WAITING_FOR_MATCH: "medal",
	TO_WAITING_FOR_CAST: "medal",
	LOBBY_WAITING: "lobbies",
	LOBBY_READY_CHECK: "lobbies",
	LOBBY_IN_ROOM: "lobbies",
	LOBBY_MATCH: "lobbies",
};

const ALERT_BADGE_STATES: GlobalStatusState[] = [
	"SQ_EXPIRED",
	"SQ_READY_CHECK",
	"TO_CHECKIN",
	"LOBBY_READY_CHECK",
];

/** States where the ball is in someone else's court, shown with an hourglass over the icon. */
const WAITING_STATES: GlobalStatusState[] = [
	"SQ_PREPARING",
	"TO_WAITING_FOR_MATCH",
	"TO_WAITING_FOR_CAST",
	"LOBBY_WAITING",
];

/** The user's ongoing SendouQ or tournament activity in the header. */
export function StatusActivity() {
	const { t } = useTranslation(["common"]);
	const { status } = useGlobalStatus();

	if (!status) return null;

	return (
		<ActivityButton
			label={t(`common:globalStatus.${status.state}`)}
			icon={<StatusIcon status={status} size={20} />}
			corner={<StatusBadge status={status} />}
		>
			<StatusPanel status={status} />
		</ActivityButton>
	);
}

function StatusPanel({ status }: { status: GlobalStatus }) {
	const { t } = useTranslation(["common"]);

	return (
		<ActivityPanel>
			<ActivityPanelHeader
				icon={<StatusIcon status={status} size={24} />}
				title={t(`common:globalStatus.${status.state}`)}
				subtitle={<StatusSubtitle status={status} />}
				end={
					<span className={styles.headerBadge}>
						<StatusBadge status={status} />
					</span>
				}
			/>
			<LinkButton
				to={status.url}
				state={
					status.scrollToMatchId
						? ({
								scrollToMatchId: status.scrollToMatchId,
							} satisfies BracketsPageState)
						: undefined
				}
				preventScrollReset={typeof status.scrollToMatchId === "number"}
				prefetch="intent"
				size="small"
				className="mt-2"
			>
				{status.state === "TO_CHECKIN"
					? t("common:globalStatus.goCheckIn")
					: t("common:globalStatus.goToPage")}
			</LinkButton>
		</ActivityPanel>
	);
}

function StatusSubtitle({ status }: { status: GlobalStatus }) {
	const { t } = useTranslation(["common"]);
	const formatDistanceToNow = useFormatDistanceToNow();

	const group = status.groupSize
		? t("common:globalStatus.subtitle.group", status.groupSize)
		: null;

	const parts: Array<string | null | undefined> = (() => {
		switch (status.state) {
			case "SQ_PREPARING":
				return [group, t("common:globalStatus.subtitle.inviteTeammates")];
			case "SQ_QUEUED":
				return [
					group,
					status.count
						? t("common:globalStatus.subtitle.likes", { count: status.count })
						: null,
				];
			case "SQ_EXPIRED":
				return [
					t("common:globalStatus.subtitle.hidden"),
					t("common:globalStatus.subtitle.refresh"),
				];
			case "SQ_READY_CHECK":
				return [t("common:globalStatus.subtitle.confirmReady")];
			case "SQ_MATCH":
				return [
					status.sqMatchId
						? t("common:chat.room.match", { id: status.sqMatchId })
						: null,
					status.gameNumber
						? t("common:globalStatus.subtitle.game", {
								number: status.gameNumber,
							})
						: null,
				];
			case "TO_CHECKIN":
				return [
					status.tournamentName,
					status.checkInClosesAt
						? t("common:globalStatus.subtitle.checkInCloses", {
								distance: formatDistanceToNow(
									new Date(status.checkInClosesAt),
									{ addSuffix: true },
								),
							})
						: null,
				];
			case "TO_WAITING_FOR_CAST":
				return [
					status.tournamentName,
					t("common:globalStatus.subtitle.heldForStream"),
				];
			case "TO_MATCH":
			case "TO_WAITING_FOR_MATCH":
				return [status.tournamentName, status.roundName];
			case "LOBBY_WAITING":
			case "LOBBY_READY_CHECK":
			case "LOBBY_IN_ROOM":
			case "LOBBY_MATCH":
				return [];
		}
	})();

	const text = parts.filter(Boolean).join(" · ");
	if (!text) return null;

	return text;
}

function StatusIcon({ status, size }: { status: GlobalStatus; size: number }) {
	const icon = status.logoUrl ? (
		<img
			src={status.logoUrl}
			width={size}
			height={size}
			alt=""
			className={styles.logo}
		/>
	) : (
		<Image
			path={navIconUrl(STATE_NAV_ICON[status.state])}
			size={size}
			alt=""
			containerClassName={styles.iconContainer}
		/>
	);

	if (!WAITING_STATES.includes(status.state)) return icon;

	return (
		<span className={styles.waiting}>
			{icon}
			<span className={styles.waitingMark}>
				<Hourglass />
			</span>
		</span>
	);
}

function StatusBadge({ status }: { status: GlobalStatus }) {
	if (ALERT_BADGE_STATES.includes(status.state)) {
		return <ActivityBadge kind="alert" />;
	}
	if (!status.count) return null;

	return (
		<ActivityBadge kind={status.countNeedsAction ? "countAction" : "count"}>
			{status.count}
		</ActivityBadge>
	);
}
