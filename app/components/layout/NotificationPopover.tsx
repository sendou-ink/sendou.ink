import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "~/features/notifications/components/NotificationList";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import { useMarkNotificationsAsSeen } from "~/features/notifications/notifications-hooks";
import { useNotifications } from "~/hooks/swr";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import { LinkButton } from "../Button";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { BellIcon } from "../icons/Bell";
import styles from "./NotificationPopover.module.css";

// xxx: add refresh button
// xxx: handle loading better?
// xxx: on open send fetch to mark read
// xxx: should close on outside click
export function NotificationPopover() {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const { notifications } = useNotifications();
	const [isOpen, setIsOpen] = React.useState(false);

	const unseenIds = React.useMemo(
		() =>
			notifications
				?.filter((notification) => !notification.seen)
				.map((notification) => notification.id) ?? [],
		[notifications],
	);

	useMarkNotificationsAsSeen({ unseenIds, skip: !isOpen });

	if (!user) {
		return null;
	}

	return (
		<div className={styles.container}>
			{unseenIds.length > 0 ? <div className={styles.unseenDot} /> : null}
			<SendouPopover
				isOpen={isOpen}
				onOpenChange={setIsOpen}
				trigger={
					<SendouButton
						icon={<BellIcon />}
						className="layout__header__button"
						onPress={() => setIsOpen(!isOpen)}
					/>
				}
				popoverClassName={clsx(styles.popoverContainer, {
					[styles.noNotificationsContainer]:
						!notifications || notifications.length === 0,
				})}
			>
				<h2 className={styles.header}>
					<BellIcon /> {t("common:notifications.title")}
				</h2>
				<hr className={styles.divider} />
				{!notifications || notifications.length === 0 ? (
					<div className={styles.noNotifications}>
						{t("common:notifications.empty")}
					</div>
				) : (
					<NotificationsList>
						{notifications.map((notification, i) => (
							<React.Fragment key={notification.id}>
								<NotificationItem
									key={notification.id}
									notification={notification}
									user={user}
									onClick={() => setIsOpen(false)}
								/>
								{i !== notifications.length - 1 && <NotificationItemDivider />}
							</React.Fragment>
						))}
					</NotificationsList>
				)}
				{notifications && notifications.length === NOTIFICATIONS.PEEK_COUNT ? (
					<NotificationsFooter onClick={() => setIsOpen(false)} />
				) : null}
			</SendouPopover>
		</div>
	);
}

// xxx: close popover when see all is clicked
function NotificationsFooter({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<div>
			<hr className={styles.divider} />
			<LinkButton
				variant="minimal"
				size="tiny"
				to={NOTIFICATIONS_URL}
				className="mt-1"
				// xxx: not working
				onClick={onClick}
			>
				{t("common:notifications.seeAll")}
			</LinkButton>
		</div>
	);
}
