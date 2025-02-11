import { Link } from "@remix-run/react";
import clsx from "clsx";
import { formatDistance } from "date-fns";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import {
	notificationLink,
	notificationNavIcon,
} from "~/features/notifications/notifications-utils";
import type { LoaderNotification } from "~/features/notifications/routes/notifications.peek";
import type { LoggedInUser } from "~/root";
import { databaseTimestampToDate } from "~/utils/dates";
import { navIconUrl } from "~/utils/urls";
import styles from "./NotificationList.module.css";

export function NotificationsList({ children }: { children: React.ReactNode }) {
	return <div>{children}</div>;
}

// xxx: formatDistance in browser, is it ok?
// xxx: unseen dot in wrong place if the notification header is two lines
export function NotificationItem({
	notification,
	user,
	onClick,
}: {
	notification: LoaderNotification;
	user: LoggedInUser;
	onClick?: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<Link
			to={notificationLink({ notification, user })}
			className={styles.item}
			onClick={onClick}
		>
			<NotificationImage notification={notification} />
			{!notification.seen ? <div className={styles.unseenDot} /> : null}
			<div className={styles.itemHeader}>
				{t(
					`common:notifications.text.${notification.type}`,
					// @ts-expect-error xxx: fix maybe
					notification.meta,
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
}: { notification: LoaderNotification }) {
	if (notification.pictureUrl) {
		return (
			<img
				src={notification.pictureUrl}
				alt="Notification"
				className={styles.itemImage}
				width={124}
				height={124}
			/>
		);
	}

	return (
		<div className={clsx(styles.itemImage, styles.imageContainer)}>
			<Image
				path={navIconUrl(notificationNavIcon(notification.type))}
				width={24}
				height={24}
				alt=""
			/>
		</div>
	);
}
