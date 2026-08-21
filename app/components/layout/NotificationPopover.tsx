import clsx from "clsx";
import { Bell, ChevronRight } from "lucide-react";
import * as React from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouPopover } from "~/components/elements/Popover";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "~/features/notifications/components/NotificationList";
import {
	type NotificationsData,
	useNotificationsData,
} from "~/features/notifications/NotificationsProvider";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import {
	useMarkNotificationsAsSeen,
	useShowUnseenDot,
	useStickyUnseenIds,
} from "../../features/notifications/notifications-hooks";

import styles from "./NotificationPopover.module.css";

export type LoaderNotification = NonNullable<NotificationsData>[number];

export function useNotifications() {
	const { notifications } = useNotificationsData();

	const unseenIds = React.useMemo(
		() =>
			notifications
				?.filter((notification) => !notification.seen)
				.map((notification) => notification.id) ?? [],
		[notifications],
	);

	const showUnseenDot = useShowUnseenDot(notifications);

	return { notifications, unseenIds, showUnseenDot };
}

export function NotificationPopover({
	notifications,
	unseenIds,
	triggerClassName,
}: {
	notifications: LoaderNotification[];
	unseenIds: number[];
	triggerClassName?: string;
}) {
	return (
		<SendouPopover
			trigger={
				<Button className={triggerClassName} data-testid="notifications-button">
					<Bell />
				</Button>
			}
			popoverClassName={clsx(styles.popoverContainer, {
				[styles.noNotificationsContainer]: notifications.length === 0,
			})}
		>
			<NotificationContent
				notifications={notifications}
				unseenIds={unseenIds}
			/>
		</SendouPopover>
	);
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
	const stickyUnseenIds = useStickyUnseenIds(notifications);

	useMarkNotificationsAsSeen(unseenIds);

	return (
		<>
			<h2 className={styles.header}>
				<Bell /> {t("common:notifications.title")}
			</h2>
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
