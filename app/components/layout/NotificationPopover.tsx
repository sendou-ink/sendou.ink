import { Link } from "@remix-run/react";
import { formatDistance } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import {
	notificationLink,
	notificationNavIcon,
} from "~/features/notifications/notifications-utils";
import type { LoaderNotification } from "~/features/notifications/routes/notifications.peek";
import { useNotifications } from "~/hooks/swr";
import type { LoggedInUser } from "~/root";
import { databaseTimestampToDate } from "~/utils/dates";
import { NOTIFICATIONS_URL, navIconUrl } from "~/utils/urls";
import { LinkButton } from "../Button";
import { Image } from "../Image";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { BellIcon } from "../icons/Bell";

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
			popoverClassName="layout__notifications__container"
		>
			<h2 className="layout__notifications__header">
				<BellIcon /> {t("common:notifications.title")}
			</h2>
			<hr className="layout__notifications__divider" />
			{!notifications || notifications.length === 0 ? (
				<div className="layout__notifications__no-notifications">
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
							{i !== notifications.length - 1 && (
								<hr className="layout__notifications__item-divider" />
							)}
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

export function NotificationsList({ children }: { children: React.ReactNode }) {
	return <div>{children}</div>;
}

// xxx: formatDistance in browser, is it ok?
export function NotificationItem({
	notification,
	user,
}: { notification: LoaderNotification; user: LoggedInUser }) {
	const { t } = useTranslation(["common"]);

	return (
		<Link
			to={notificationLink({ notification, user })}
			className="layout__notifications__item"
		>
			<NotificationImage notification={notification} />
			<div className="layout__notifications__item__header">
				{t(
					`common:notifications.text.${notification.value.type}`,
					// @ts-expect-error xxx: fix maybe
					notification.value.meta,
				)}
			</div>
			<div className="layout__notifications__item__timestamp">
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

function NotificationImage({
	notification,
}: { notification: LoaderNotification }) {
	if (notification.value.pictureUrl) {
		return (
			<img
				src={notification.value.pictureUrl}
				alt="Notification"
				className="layout__notifications__item__image"
				width={124}
				height={124}
			/>
		);
	}

	return (
		<div className="layout__notifications__item__image layout__notifications__item__image-container">
			<Image
				path={navIconUrl(notificationNavIcon(notification.value.type))}
				width={24}
				height={24}
				alt=""
			/>
		</div>
	);
}

// xxx: close popover when see all is clicked
function NotificationsFooter() {
	const { t } = useTranslation(["common"]);

	return (
		<div className="layout__notifications__footer">
			<hr className="layout__notifications__divider" />
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
