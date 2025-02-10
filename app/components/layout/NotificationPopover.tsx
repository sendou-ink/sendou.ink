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
export function NotificationPopover() {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const { notifications } = useNotifications();
	if (!user) {
		return null;
	}

	return (
		<SendouPopover
			trigger={
				<SendouButton icon={<BellIcon />} className="layout__header__button" />
			}
			popoverClassName={clsx(styles.container, {
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
							/>
							{i !== notifications.length - 1 && <NotificationItemDivider />}
						</React.Fragment>
					))}
				</NotificationsList>
			)}
			{notifications && notifications.length === NOTIFICATIONS.PEEK_COUNT ? (
				<NotificationsFooter />
			) : null}
		</SendouPopover>
	);
}

// xxx: close popover when see all is clicked
function NotificationsFooter() {
	const { t } = useTranslation(["common"]);

	return (
		<div>
			<hr className={styles.divider} />
			<LinkButton
				variant="minimal"
				size="tiny"
				to={NOTIFICATIONS_URL}
				className="my-1"
			>
				{t("common:notifications.seeAll")}
			</LinkButton>
		</div>
	);
}
