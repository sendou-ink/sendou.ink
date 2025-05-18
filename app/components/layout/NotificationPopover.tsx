import { useLocation, useMatches, useRevalidator } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "~/features/notifications/components/NotificationList";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import type { RootLoaderData } from "~/root";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import { useMarkNotificationsAsSeen } from "../../features/notifications/notifications-hooks";
import { LinkButton } from "../Button";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { BellIcon } from "../icons/Bell";
import { RefreshIcon } from "../icons/Refresh";

import styles from "./NotificationPopover.module.css";

export type LoaderNotification = NonNullable<
	RootLoaderData["notifications"]
>[number];

export function NotificationPopover() {
	const location = useLocation();
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

	if (!notifications) {
		return null;
	}

	return (
		<div className={styles.container} key={location.pathname}>
			{unseenIds.length > 0 ? <div className={styles.unseenDot} /> : null}
			<SendouPopover
				trigger={
					<Button
						className="layout__header__button"
						data-testid="notifications-button"
					>
						<BellIcon />
					</Button>
				}
				popoverClassName={clsx(styles.popoverContainer, {
					[styles.noNotificationsContainer]:
						!notifications || notifications.length === 0,
				})}
			>
				<NotificationContent
					notifications={notifications ?? []}
					unseenIds={unseenIds}
				/>
			</SendouPopover>
		</div>
	);
}

function NotificationContent({
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
					<BellIcon /> {t("common:notifications.title")}
				</h2>
				<SendouButton
					icon={<RefreshIcon />}
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
				size="tiny"
				to={NOTIFICATIONS_URL}
				className="mt-1-5"
			>
				{t("common:notifications.seeAll")}
			</LinkButton>
		</div>
	);
}
