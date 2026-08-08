import * as React from "react";
import { useFetcher } from "react-router";
import { useLayoutData } from "~/features/layout/LayoutDataProvider";
import { NOTIFICATIONS_MARK_AS_SEEN_ROUTE } from "~/utils/urls";

export function useMarkNotificationsAsSeen(unseenIds: number[]) {
	const fetcher = useFetcher();
	const { refresh } = useLayoutData();
	const submittedIdsRef = React.useRef(new Set<number>());
	const refreshPendingRef = React.useRef(false);

	const { submit } = fetcher;
	React.useEffect(() => {
		// a submit while one is in flight would abort it; ids arriving mid-flight
		// get submitted when the fetcher returns to idle
		if (fetcher.state !== "idle") return;

		// the bell dot reads from layout data, which the root loader does not
		// revalidate for this action, so it has to be refetched by hand
		if (refreshPendingRef.current) {
			refreshPendingRef.current = false;
			refresh();
		}

		const idsToSubmit = unseenIds.filter(
			(id) => !submittedIdsRef.current.has(id),
		);
		if (idsToSubmit.length === 0) return;

		for (const id of idsToSubmit) {
			submittedIdsRef.current.add(id);
		}
		refreshPendingRef.current = true;

		submit(
			{ notificationIds: idsToSubmit },
			{
				method: "post",
				encType: "application/json",
				action: NOTIFICATIONS_MARK_AS_SEEN_ROUTE,
			},
		);
	}, [submit, unseenIds, fetcher.state, refresh]);
}

/**
 * Ids of the notifications to show an unseen dot for, keeping the dot for as
 * long as the list stays open. Opening the list marks its notifications as
 * seen right away so the bell stops claiming there is something new, and this
 * keeps the reader from losing track of which ones those were.
 */
export function useStickyUnseenIds(
	notifications: Array<{ id: number; seen: number }>,
) {
	const [unseenIds, setUnseenIds] = React.useState(
		() => new Set(unseenIdsOf(notifications)),
	);
	const [prevNotifications, setPrevNotifications] =
		React.useState(notifications);

	if (prevNotifications !== notifications) {
		setPrevNotifications(notifications);
		setUnseenIds((prevUnseenIds) => {
			const newUnseenIds = new Set(prevUnseenIds);

			for (const id of unseenIdsOf(notifications)) {
				newUnseenIds.add(id);
			}

			// optimize render by not updating state if nothing changed
			if (newUnseenIds.size === prevUnseenIds.size) return prevUnseenIds;

			return newUnseenIds;
		});
	}

	return unseenIds;
}

function unseenIdsOf(notifications: Array<{ id: number; seen: number }>) {
	return notifications
		.filter((notification) => !notification.seen)
		.map((notification) => notification.id);
}
