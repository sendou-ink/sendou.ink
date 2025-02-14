import { useFetcher } from "@remix-run/react";
import * as React from "react";
import { NOTIFICATIONS_MARK_AS_SEEN_ROUTE } from "~/utils/urls";

export function useMarkNotificationsAsSeen(unseenIds: number[]) {
	const fetcher = useFetcher();

	React.useEffect(() => {
		if (!unseenIds.length || fetcher.state !== "idle") return;

		fetcher.submit(
			{ notificationIds: unseenIds },
			{
				method: "post",
				encType: "application/json",
				action: NOTIFICATIONS_MARK_AS_SEEN_ROUTE,
			},
		);
	}, [fetcher, unseenIds]);
}
