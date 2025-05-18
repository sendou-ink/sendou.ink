import { Link, type MetaFunction, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { BellIcon } from "~/components/icons/Bell";
import { metaTags } from "../../../utils/remix";
import { SETTINGS_PAGE } from "../../../utils/urls";
import {
	NotificationItem,
	NotificationItemDivider,
	NotificationsList,
} from "../components/NotificationList";
import { useMarkNotificationsAsSeen } from "../notifications-hooks";

import { loader } from "../loaders/notifications.server";
export { loader };

import styles from "./notifications.module.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Notifications",
		location: args.location,
	});
};

export default function NotificationsPage() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();
	const [unseenIds, setUnseenIds] = React.useState(new Set<number>());

	// persist unseen dots for the duration of the page being viewed
	React.useEffect(() => {
		setUnseenIds((prevUnseenIds) => {
			const newUnseenIds = new Set(prevUnseenIds);

			for (const id of data.notifications
				.filter((notification) => !notification.seen)
				.map((notification) => notification.id)) {
				newUnseenIds.add(id);
			}

			// optimize render by not updating state if nothing changed
			if (newUnseenIds.size === prevUnseenIds.size) return prevUnseenIds;

			return newUnseenIds;
		});
	}, [data.notifications]);

	const unSeenIdsArr = React.useMemo(() => Array.from(unseenIds), [unseenIds]);

	useMarkNotificationsAsSeen(unSeenIdsArr);

	return (
		<Main className="stack md">
			<div className="stack horizontal justify-between items-center flex-wrap">
				<h2 className={styles.header}>
					<BellIcon /> {t("common:notifications.title")}
				</h2>
				<Link className="text-xs" to={SETTINGS_PAGE}>
					{t("common:notifications.managePush")}
				</Link>
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
								notification={{
									...notification,
									seen: Number(!unseenIds.has(notification.id)),
								}}
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
