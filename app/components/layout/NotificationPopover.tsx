import { Bell, ChevronRight, RefreshCcw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useLayoutData } from "~/features/layout/LayoutDataProvider";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "~/features/notifications/components/NotificationList";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import type { RootLoaderData } from "~/root";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import {
	useMarkNotificationsAsSeen,
	useStickyUnseenIds,
} from "../../features/notifications/notifications-hooks";
import { SendouButton } from "../elements/Button";

import styles from "./NotificationPopover.module.css";

export type LoaderNotification = NonNullable<
	RootLoaderData["notifications"]
>[number];

export function useNotifications() {
	const { notifications } = useLayoutData();

	const unseenIds = React.useMemo(
		() =>
			notifications
				?.filter((notification) => !notification.seen)
				.map((notification) => notification.id) ?? [],
		[notifications],
	);

	return { notifications, unseenIds };
}

export function NotificationContent({
	notifications,
	unseenIds,
	onClose,
}: {
	notifications: LoaderNotification[];
	unseenIds: number[];
	onClose?: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const { refresh, isRefreshing } = useLayoutData();
	const stickyUnseenIds = useStickyUnseenIds(notifications);

	useMarkNotificationsAsSeen(unseenIds);

	return (
		<>
			<div className={styles.topContainer}>
				<h2 className={styles.header}>
					<Bell /> {t("common:notifications.title")}
				</h2>
				<SendouButton
					icon={<RefreshCcw />}
					shape="circle"
					variant="minimal"
					onPress={refresh}
					isDisabled={isRefreshing}
				/>
			</div>
			<hr className={styles.divider} />
			{notifications.length === 0 ? (
				<div className={styles.noNotifications}>
					{t("common:notifications.empty")}
				</div>
			) : (
				<NotificationsList>
					{notifications.map((notification, i) => (
						<React.Fragment key={notification.id}>
							<NotificationItem
								key={notification.id}
								notification={{
									...notification,
									seen: Number(!stickyUnseenIds.has(notification.id)),
								}}
								onClose={onClose}
							/>
							{i !== notifications.length - 1 && <NotificationItemDivider />}
						</React.Fragment>
					))}
				</NotificationsList>
			)}
			{notifications.length === NOTIFICATIONS.PEEK_COUNT ? (
				<NotificationsFooter onClose={onClose} />
			) : null}
		</>
	);
}

function NotificationsFooter({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<div>
			<hr className={styles.divider} />
			<Link
				to={NOTIFICATIONS_URL}
				className={styles.viewAllLink}
				data-testid="notifications-see-all-button"
				onClick={onClose}
			>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</div>
	);
}
