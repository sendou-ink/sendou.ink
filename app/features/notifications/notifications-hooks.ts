import { useFetcher } from "@remix-run/react";
import * as React from "react";
import { NOTIFICATIONS_MARK_AS_SEEN_ROUTE } from "~/utils/urls";

export function useMarkNotificationsAsSeen({
	unseenIds,
	skip = false,
}: { unseenIds?: number[]; skip?: boolean }) {
	const fetcher = useFetcher();

	React.useEffect(() => {
		if (skip || !unseenIds?.length || fetcher.state !== "idle") return;

		fetcher.submit(
			{ notificationIds: unseenIds },
			{
				method: "post",
				encType: "application/json",
				action: NOTIFICATIONS_MARK_AS_SEEN_ROUTE,
			},
		);
	}, [fetcher, unseenIds, skip]);
}
