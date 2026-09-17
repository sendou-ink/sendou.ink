import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Image } from "~/components/Image";
import { navIconUrl } from "~/utils/urls";
import {
	type GlobalStatusState,
	useGlobalStatus,
} from "../GlobalStatusProvider";
import styles from "./GlobalStatusIndicator.module.css";

const STATE_NAV_ICON: Record<GlobalStatusState, string> = {
	SQ_PREPARING: "sendouq",
	SQ_QUEUED: "sendouq",
	SQ_EXPIRED: "sendouq",
	SQ_READY_CHECK: "sendouq",
	SQ_MATCH: "sendouq",
	SQ_AWAITING_REPORT: "sendouq",
	TO_CHECKIN: "medal",
	TO_MATCH: "medal",
	TO_WAITING_FOR_MATCH: "medal",
	TO_WAITING_FOR_CAST: "medal",
};

const ALERT_BADGE_STATES: GlobalStatusState[] = ["SQ_EXPIRED", "TO_CHECKIN"];

export function GlobalStatusIndicator() {
	const { status } = useGlobalStatus();
	const { t } = useTranslation(["common"]);

	if (!status) return null;

	const text = `${t(`common:globalStatus.${status.state}`)}${
		status.groupSize
			? ` (${status.groupSize.members}/${status.groupSize.max})`
			: ""
	}`;

	return (
		<Link to={status.url} className={styles.status} aria-label={text}>
			{status.logoUrl ? (
				<img src={status.logoUrl} alt="" className={styles.logo} />
			) : (
				<Image
					path={navIconUrl(STATE_NAV_ICON[status.state])}
					size={20}
					alt=""
					containerClassName={styles.iconContainer}
				/>
			)}
			<span className={styles.text}>{text}</span>
			{ALERT_BADGE_STATES.includes(status.state) ? (
				<span className={clsx(styles.countBadge, styles.alertBadge)}>!</span>
			) : typeof status.count === "number" ? (
				<span
					className={clsx(
						styles.countBadge,
						status.countNeedsAction ? styles.countBadgeAction : null,
					)}
				>
					{status.count}
				</span>
			) : null}
		</Link>
	);
}
