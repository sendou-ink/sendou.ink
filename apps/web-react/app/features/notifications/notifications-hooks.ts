import * as React from "react";
import { useFetcher } from "react-router";
import { NOTIFICATIONS_MARK_AS_SEEN_ROUTE } from "~/utils/urls";
import { useNotificationsData } from "./NotificationsProvider";

export function useMarkNotificationsAsSeen(unseenIds: number[]) {
	const fetcher = useFetcher();
	const { refresh } = useNotificationsData();
	const submittedIdsRef = React.useRef(new Set<number>());
	const refreshPendingRef = React.useRef(false);

	const { submit } = fetcher;
	React.useEffect(() => {
		// a submit while one is in flight would abort it; ids arriving mid-flight
		// get submitted when the fetcher returns to idle
		if (fetcher.state !== "idle") return;

		// the action's skalop ping also triggers a refetch, but only for clients
		// with a live websocket; refetching here keeps the dot clearing promptly
		// for the tab that did the marking either way
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

const UNSEEN_DOT_GRACE_MS = 10_000;

/**
 * Whether the bell should show its unseen dot. An unseen notification born
 * while the session is already open only counts once it has stayed unseen past
 * a short grace period: one about something the user is already on their way
 * to (e.g. a SendouQ match that just started, with the redirect to the match
 * page a second away) resolves itself right after, and the dot flashing for
 * it would be false signal. Notifications predating the session show the dot
 * right away — anything that was going to resolve them (a loader of the page
 * being landed on) already ran before the first notifications fetch.
 */
export function useShowUnseenDot(
	notifications: Array<{ createdAt: number; seen: number }> | undefined,
) {
	// time lives in state (only advanced by the timer below) because reading
	// Date.now() during render would be frozen by the React Compiler's memoization
	const [mountedAt] = React.useState(() => Date.now());
	const [now, setNow] = React.useState(mountedAt);

	const dotShowTimes =
		notifications
			?.filter((notification) => !notification.seen)
			.map((notification) => {
				const createdAtMs = notification.createdAt * 1000;

				return createdAtMs <= mountedAt
					? mountedAt
					: createdAtMs + UNSEEN_DOT_GRACE_MS;
			}) ?? [];

	const showDot = dotShowTimes.some((showTime) => showTime <= now);
	const nextShowTime =
		!showDot && dotShowTimes.length > 0 ? Math.min(...dotShowTimes) : null;

	React.useEffect(() => {
		if (nextShowTime === null) return;

		const timeout = setTimeout(
			() => setNow(Date.now()),
			Math.max(0, nextShowTime - Date.now()) + 100,
		);
		return () => clearTimeout(timeout);
	}, [nextShowTime]);

	return showDot;
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
