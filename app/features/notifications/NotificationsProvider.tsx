import * as React from "react";
import { useFetchers, useLocation, useNavigation } from "react-router";
import {
	useEventStreamCatchUp,
	useEventsReadyState,
	useServerEventListener,
} from "~/features/events/events-hooks";
import { useBackgroundResource } from "~/hooks/useBackgroundResource";
import type { SerializeFrom } from "~/utils/remix";
import { NOTIFICATIONS_DATA_ROUTE } from "~/utils/urls";
import { resyncPushSubscription } from "./core/pushSubscription";
import type { loader } from "./routes/api.notifications";

export type NotificationsData = SerializeFrom<typeof loader>["notifications"];

interface NotificationsContextValue {
	notifications?: NotificationsData;
	/** Refetches the notification peek, without touching the page's own loaders. */
	refresh: () => void;
}

const NotificationsContext = React.createContext<NotificationsContextValue>({
	refresh: () => {},
});

/**
 * Serves the notification peek (bell popover + unseen dot), push-first: an initial fetch after
 * mount (not in any loader, so notifications never delay a page), then a refetch whenever the
 * server publishes over SSE that they changed. Polling and refetch-on-activity are only the
 * fallback while the event stream is down.
 */
export function NotificationsProvider({
	user,
	children,
}: {
	user?: { id: number } | null;
	children: React.ReactNode;
}) {
	const { data, refresh } = useBackgroundResource<SerializeFrom<typeof loader>>(
		NOTIFICATIONS_DATA_ROUTE,
	);
	const readyState = useEventsReadyState();

	const loggedIn = Boolean(user);
	const eventsDown = loggedIn && readyState !== "CONNECTED";

	React.useEffect(() => {
		if (!loggedIn) return;

		refresh();
		void resyncPushSubscription();
	}, [loggedIn, refresh]);

	const catchUp = useEventStreamCatchUp({
		enabled: loggedIn,
		onCatchUp: refresh,
	});

	// the event carries no data on purpose: it only says that the user's
	// notifications changed server-side
	useServerEventListener((event) => {
		if (event.kind === "notificationsChanged") {
			catchUp();
		}
	});

	const notifications = data?.notifications;

	useFallbackRefreshOnPotentialResolution({
		enabled: eventsDown,
		notifications,
		refresh,
	});

	const value: NotificationsContextValue = {
		notifications,
		refresh,
	};

	return (
		<NotificationsContext.Provider value={value}>
			{children}
		</NotificationsContext.Provider>
	);
}

/** The user's notification peek; `notifications` is `undefined` until the first fetch lands. */
export function useNotificationsData() {
	return React.useContext(NotificationsContext);
}

/**
 * Without the event stream nothing pings when the user resolves an unseen notification, so refetch
 * after anything that may have: a navigation (loaders mark seen) or a settled action (actions mark
 * seen). Only fires while an unseen notification exists.
 */
function useFallbackRefreshOnPotentialResolution({
	enabled,
	notifications,
	refresh,
}: {
	enabled: boolean;
	notifications: NotificationsData;
	refresh: () => void;
}) {
	const location = useLocation();
	const navigation = useNavigation();
	const fetchers = useFetchers();

	const hasUnseen =
		(enabled && notifications?.some((notification) => !notification.seen)) ??
		false;

	const submitting =
		navigation.state === "submitting" ||
		fetchers.some((fetcher) => fetcher.state === "submitting");
	const allIdle =
		navigation.state === "idle" &&
		fetchers.every((fetcher) => fetcher.state === "idle");

	const refreshOnIdleRef = React.useRef(false);
	if (submitting && hasUnseen) {
		refreshOnIdleRef.current = true;
	}

	const prevLocationKeyRef = React.useRef(location.key);

	React.useEffect(() => {
		if (prevLocationKeyRef.current !== location.key) {
			prevLocationKeyRef.current = location.key;
			if (hasUnseen) {
				refresh();
			}
			return;
		}

		if (allIdle && refreshOnIdleRef.current) {
			refreshOnIdleRef.current = false;
			refresh();
		}
	}, [location.key, allIdle, hasUnseen, refresh]);
}
