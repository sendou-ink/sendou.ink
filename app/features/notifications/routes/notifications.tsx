import { useLoaderData } from "@remix-run/react";
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
import { useUser } from "~/features/auth/core/user";
import styles from "./notifications.module.css";

export default function NotificationsPage() {
	const user = useUser();
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();

	if (!user) {
		return null;
	}

	return (
		<Main className="stack md">
			<h2 className={styles.header}>
				<BellIcon /> {t("common:notifications.title")}
			</h2>
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
								user={user}
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
