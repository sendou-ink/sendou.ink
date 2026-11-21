import { Bell } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, type MetaFunction, useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { metaTags } from "../../../utils/remix";
import { SETTINGS_PAGE } from "../../../utils/urls";
import { NotificationsList } from "../components/NotificationList";
import { loader } from "../loaders/notifications.server";
import {
	useMarkNotificationsAsSeen,
	useStickyUnseenIds,
} from "../notifications-hooks";
import styles from "./notifications.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Notifications",
		location: args.location,
	});
};

export default function NotificationsPage() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();
	const unseenIds = useStickyUnseenIds(data.notifications, true);

	const unSeenIdsArr = React.useMemo(() => Array.from(unseenIds), [unseenIds]);

	useMarkNotificationsAsSeen(unSeenIdsArr);

	return (
		<Main className="stack md">
			<div className="stack horizontal justify-between items-center flex-wrap">
				<h2 className={styles.header}>
					<Bell /> {t("common:notifications.title")}
				</h2>
				<Link className="text-xs" to={SETTINGS_PAGE}>
					{t("common:notifications.managePush")}
				</Link>
			</div>
			{data.notifications.length === 0 ? (
				<div>{t("common:notifications.empty")}</div>
			) : (
				<NotificationsList
					notifications={data.notifications}
					unseenIds={unseenIds}
				/>
			)}
			<div className="text-xs text-lighter mt-6">
				{t("common:notifications.fullList.explanation")}
			</div>
		</Main>
	);
}
