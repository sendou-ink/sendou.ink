import { formatDistance } from "date-fns";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Image } from "~/components/Image";
import type { LoaderNotification } from "~/components/layout/NotificationPopover";
import { useUser } from "~/features/auth/core/user";
import {
	notificationLink,
	notificationMeta,
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
	onClose,
}: {
	notification: LoaderNotification;
	onClose?: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const user = useUser();

	return (
		<Link
			to={notificationLink(notification, user)}
			className={styles.item}
			data-testid="notification-item"
			onClick={onClose}
		>
			<NotificationImage notification={notification}>
				{!notification.seen ? (
					<div
						className={styles.unseenDot}
						data-testid="notification-unseen-dot"
					/>
				) : null}
			</NotificationImage>
			<div className={styles.itemHeader}>
				{t(
					`common:notifications.text.${notification.type}`,
					notificationMeta(notification),
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
}: {
	notification: LoaderNotification;
	children: React.ReactNode;
}) {
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
