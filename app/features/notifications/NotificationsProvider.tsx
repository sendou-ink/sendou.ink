import * as React from "react";
import { useFetchers, useLocation, useNavigation } from "react-router";
import { useRefreshOnReconnect } from "~/features/chat/chat-hooks";
import { useChatContext } from "~/features/chat/useChatContext";
import { useBackgroundResource } from "~/hooks/useBackgroundResource";
import type { SerializeFrom } from "~/utils/remix";
import { NOTIFICATIONS_DATA_ROUTE } from "~/utils/urls";
import { resyncPushSubscription } from "./core/pushSubscription";
import type { loader } from "./routes/api.notifications";

/** Spreads out the refetches when a notification fans out to many users at once. */
const PING_REFRESH_JITTER_MS = 3_000;

const WS_DOWN_POLL_MS = 2 * 60 * 1000;

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
 * Serves the notification peek (bell popover + unseen dot) and keeps it fresh
 * push-first: an initial fetch after mount (deliberately not part of any
 * loader, so notifications never delay a page), then a refetch whenever skalop
 * pings over the chat websocket that the user's notifications changed
 * server-side (new notification, marked seen, resolved by an action
 * elsewhere). Polling and refetch-on-activity heuristics only kick in as a
 * fallback while the websocket is down.
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
	const chat = useChatContext();

	const loggedIn = Boolean(user);
	const readyState = chat?.readyState ?? "CLOSED";
	const wsDown = loggedIn && readyState !== "CONNECTED";

	React.useEffect(() => {
		if (!loggedIn) return;

		refresh();
		void resyncPushSubscription();
	}, [loggedIn, refresh]);

	useRefreshOnPing({ version: chat?.notificationsVersion ?? 0, refresh });
	useRefreshOnReconnect(readyState, refresh);
	useRefreshOnVisible({ enabled: loggedIn, refresh });
	useFallbackPoll({ enabled: wsDown, refresh });

	const notifications = data?.notifications;

	useFallbackRefreshOnPotentialResolution({
		enabled: wsDown,
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

function useRefreshOnPing({
	version,
	refresh,
}: {
	version: number;
	refresh: () => void;
}) {
	React.useEffect(() => {
		if (version === 0) return;

		// jittered so a notification sent to a whole tournament's worth of users
		// does not make every connected client refetch in the same instant; a
		// follow-up ping inside the window replaces the pending refetch
		const timeout = setTimeout(refresh, Math.random() * PING_REFRESH_JITTER_MS);
		return () => clearTimeout(timeout);
	}, [version, refresh]);
}

/** Refetches when the tab becomes visible again (e.g. waking from sleep). */
function useRefreshOnVisible({
	enabled,
	refresh,
}: {
	enabled: boolean;
	refresh: () => void;
}) {
	React.useEffect(() => {
		if (!enabled) return;

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				refresh();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [enabled, refresh]);
}

function useFallbackPoll({
	enabled,
	refresh,
}: {
	enabled: boolean;
	refresh: () => void;
}) {
	React.useEffect(() => {
		if (!enabled) return;

		const interval = setInterval(refresh, WS_DOWN_POLL_MS);
		return () => clearInterval(interval);
	}, [enabled, refresh]);
}

/**
 * Without the websocket there is no ping when something the user did resolves
 * an unseen notification, so fall back to refetching after anything that may
 * have: a navigation (loaders mark notifications seen when the user views the
 * page a notification points at) or a settled action submission (actions mark
 * them seen when the user addresses the thing itself). Only fires while an
 * unseen notification exists, so it usually adds no server load even then.
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
