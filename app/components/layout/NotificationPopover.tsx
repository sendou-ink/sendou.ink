import clsx from "clsx";
import { Bell, ChevronRight } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouPopover } from "~/components/elements/Popover";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "~/features/notifications/components/NotificationList";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import {
	type NotificationsData,
	useNotificationsData,
} from "~/features/notifications/NotificationsProvider";
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
	notifications: LoaderNotification[] | undefined;
	unseenIds: number[];
	triggerClassName?: string;
}) {
	const [isOpen, setIsOpen] = React.useState(false);
	useMarkNotificationsSeenWhileOpen(unseenIds, isOpen);

	return (
		<SendouPopover
			onOpenChange={setIsOpen}
			trigger={
				<button
					type="button"
					className={triggerClassName}
					data-testid="notifications-button"
				>
					<Bell />
				</button>
			}
			popoverClassName={clsx(styles.popoverContainer, {
				[styles.noNotificationsContainer]: !notifications?.length,
			})}
		>
			<NotificationContent notifications={notifications} isOpen={isOpen} />
		</SendouPopover>
	);
}

const NO_IDS: number[] = [];
const NO_NOTIFICATIONS: LoaderNotification[] = [];

/** Lives outside `NotificationContent` so that the marking outlives the list unmounting on close. */
export function useMarkNotificationsSeenWhileOpen(
	unseenIds: number[],
	isOpen: boolean,
) {
	useMarkNotificationsAsSeen(isOpen ? unseenIds : NO_IDS);
}

/** The list of the bell popover and the mobile "You" panel, mounted only once opened. */
export function NotificationContent({
	notifications,
	isOpen,
}: {
	/** `undefined` until the peek fetch lands; the header & its space are held meanwhile. */
	notifications: LoaderNotification[] | undefined;
	isOpen: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const stickyUnseenIds = useStickyUnseenIds(
		notifications ?? NO_NOTIFICATIONS,
		isOpen,
	);

	return (
		<>
			<h2 className={styles.header}>
				<Bell /> {t("common:notifications.title")}
			</h2>
			<hr className={styles.divider} />
			{!notifications ? (
				<div className={styles.pending} />
			) : notifications.length === 0 ? (
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
							/>
							{i !== notifications.length - 1 ? (
								<NotificationItemDivider />
							) : null}
						</React.Fragment>
					))}
				</NotificationsList>
			)}
			{notifications?.length === NOTIFICATIONS.PEEK_COUNT ? (
				<NotificationsFooter />
			) : null}
		</>
	);
}

function NotificationsFooter() {
	const { t } = useTranslation(["common"]);

	return (
		<div>
			<hr className={styles.divider} />
			<Link
				to={NOTIFICATIONS_URL}
				prefetch="intent"
				className={styles.viewAllLink}
				data-testid="notifications-see-all-button"
			>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</div>
	);
}
