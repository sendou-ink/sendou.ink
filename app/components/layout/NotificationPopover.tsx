import { Bell, RefreshCcw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMatches, useRevalidator } from "react-router";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "~/features/notifications/components/NotificationList";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import type { RootLoaderData } from "~/root";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import { useMarkNotificationsAsSeen } from "../../features/notifications/notifications-hooks";
import { LinkButton, SendouButton } from "../elements/Button";

import styles from "./NotificationPopover.module.css";

export type LoaderNotification = NonNullable<
	RootLoaderData["notifications"]
>[number];

export function useNotifications() {
	const [root] = useMatches();

	const notifications = (root.data as RootLoaderData | undefined)
		?.notifications;

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
}: {
	notifications: LoaderNotification[];
	unseenIds: number[];
}) {
	const { t } = useTranslation(["common"]);
	const { revalidate, state } = useRevalidator();

	useMarkNotificationsAsSeen(unseenIds);

	return (
		<>
			<div className={styles.topContainer}>
				<h2 className={styles.header}>
					<Bell /> {t("common:notifications.title")}
				</h2>
				<SendouButton
					icon={<RefreshCcw />}
					variant="minimal"
					className={styles.refreshButton}
					onPress={revalidate}
					isDisabled={state !== "idle"}
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
								notification={notification}
							/>
							{i !== notifications.length - 1 && <NotificationItemDivider />}
						</React.Fragment>
					))}
				</NotificationsList>
			)}
			{notifications.length === NOTIFICATIONS.PEEK_COUNT ? (
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
			<LinkButton
				variant="minimal"
				size="small"
				to={NOTIFICATIONS_URL}
				className="mt-1-5"
				testId="notifications-see-all-button"
			>
				{t("common:notifications.seeAll")}
			</LinkButton>
		</div>
	);
}
