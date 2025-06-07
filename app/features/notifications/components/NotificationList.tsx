import { Link } from "@remix-run/react";
import { formatDistance } from "date-fns";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import type { LoaderNotification } from "~/components/layout/NotificationPopover";
import {
	mapMetaForTranslation,
	notificationLink,
	notificationNavIcon,
} from "~/features/notifications/notifications-utils";
import { databaseTimestampToDate } from "~/utils/dates";
import { navIconUrl } from "~/utils/urls";
import styles from "./NotificationList.module.css";

export function NotificationsList({ children }: { children: React.ReactNode }) {
	return <div>{children}</div>;
}

export function NotificationItem({
	notification,
}: {
	notification: LoaderNotification;
}) {
	const { t, i18n } = useTranslation(["common"]);

	return (
		<Link to={notificationLink(notification)} className={styles.item}>
			<NotificationImage notification={notification}>
				{!notification.seen ? <div className={styles.unseenDot} /> : null}
			</NotificationImage>
			<div className={styles.itemHeader}>
				{t(
					`common:notifications.text.${notification.type}`,
					mapMetaForTranslation(notification, i18n.language),
				)}
			</div>
			<div className={styles.timestamp}>
				{formatDistance(
					databaseTimestampToDate(notification.createdAt),
					new Date(),
					{
						addSuffix: true,
					},
				)}
			</div>
		</Link>
	);
}

export function NotificationItemDivider() {
	return <hr className={styles.itemDivider} />;
}

function NotificationImage({
	notification,
	children,
}: { notification: LoaderNotification; children: React.ReactNode }) {
	if (notification.pictureUrl) {
		return (
			<div className={styles.imageContainer}>
				{children}
				<img
					src={notification.pictureUrl}
					alt="Notification"
					className={styles.itemImage}
					width={124}
					height={124}
				/>
			</div>
		);
	}

	return (
		<div className={styles.imageContainer}>
			{children}
			<Image
				path={navIconUrl(notificationNavIcon(notification.type))}
				width={24}
				height={24}
				alt=""
			/>
		</div>
	);
}
