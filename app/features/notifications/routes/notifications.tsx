import { Link, useLoaderData } from "@remix-run/react";
import { Main } from "~/components/Main";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "../components/NotificationList";
import { loader } from "../loaders/notifications.server";
export { loader };
import * as React from "react";
import { useTranslation } from "react-i18next";
import { BellIcon } from "~/components/icons/Bell";
import { SETTINGS_PAGE } from "../../../utils/urls";
import { useMarkNotificationsAsSeen } from "../notifications-hooks";
import styles from "./notifications.module.css";

export default function NotificationsPage() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();

	const unseenIds = React.useMemo(
		() =>
			data.notifications
				.filter((notification) => !notification.seen)
				.map((notification) => notification.id),
		[data.notifications],
	);

	// xxx: this flickers the unseen dot, persist while page is being viewed
	useMarkNotificationsAsSeen(unseenIds);

	return (
		<Main className="stack md">
			<div>
				<h2 className={styles.header}>
					<BellIcon /> {t("common:notifications.title")}
				</h2>
				<div className="text-xs text-lighter">
					Manage push notifications on the{" "}
					<Link to={SETTINGS_PAGE}>settings page</Link>
				</div>
			</div>
			{data.notifications.length === 0 ? (
				<div className="layout__notifications__no-notifications">
					{t("common:notifications.empty")}
				</div>
			) : (
				<NotificationsList>
					{data.notifications.map((notification, i) => (
						<React.Fragment key={notification.id}>
							<NotificationItem
								key={notification.id}
								notification={notification}
							/>
							{i !== data.notifications.length - 1 && (
								<NotificationItemDivider />
							)}
						</React.Fragment>
					))}
				</NotificationsList>
			)}
			<div className="text-xs text-lighter mt-6">
				{t("common:notifications.fullList.explanation")}
			</div>
		</Main>
	);
}
