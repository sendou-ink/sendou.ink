import * as React from "react";
import {
	useEventStreamCatchUp,
	useServerEventListener,
} from "~/features/events/events-hooks";
import { useLayoutData } from "~/features/layout/LayoutDataProvider";
import { useBackgroundResource } from "~/hooks/useBackgroundResource";
import type { SerializeFrom } from "~/utils/remix";
import { STATUS_DATA_ROUTE } from "~/utils/urls";
import { useHasSqGroupExpired } from "./global-status-expiry";
import { useHasUnseenSqLikes } from "./global-status-likes-seen";
import { useGlobalStatusSounds } from "./global-status-sounds";
import type { GlobalStatus } from "./global-status-types";
import type { loader } from "./routes/api.status";

interface GlobalStatusContextValue {
	status: GlobalStatus | null;
}

const GlobalStatusContext = React.createContext<GlobalStatusContextValue>({
	status: null,
});

/**
 * Serves the user's current SendouQ/tournament status shown in the app header
 * and keeps it fresh push-first: the layout data seeds the first paint, then a
 * refetch of the status's own resource route whenever the server publishes
 * over the shared SSE connection that the user's status changed. The refetch
 * happens without jitter: a bracket-wide event (bracket start, swiss round
 * advance, check-in opening) reaches every participant at once, but the status
 * resolves mostly from in-memory activity so the burst is cheap, and those are
 * the moments the header is the call to action.
 */
export function GlobalStatusProvider({
	user,
	children,
}: {
	user?: { id: number } | null;
	children: React.ReactNode;
}) {
	const { globalStatus: layoutStatus } = useLayoutData();
	const { data, refresh } =
		useBackgroundResource<SerializeFrom<typeof loader>>(STATUS_DATA_ROUTE);

	const loggedIn = Boolean(user);

	useEventStreamCatchUp({
		enabled: loggedIn,
		onCatchUp: refresh,
	});

	// the event carries no data on purpose: it only says that the user's
	// status changed server-side
	useServerEventListener((event) => {
		if (event.kind === "statusChanged") {
			refresh();
		}
	});

	// the layout data covers the first paint; once the dedicated route has
	// answered it is the fresher source and always wins
	const serverStatus =
		data !== undefined ? data.globalStatus : (layoutStatus ?? null);
	const resolvedStatus = loggedIn ? serverStatus : null;
	const hasUnseenLikes = useHasUnseenSqLikes(resolvedStatus);
	const hasExpired = useHasSqGroupExpired(resolvedStatus);
	useGlobalStatusSounds(resolvedStatus);

	const status = resolvedStatus
		? withClientState(resolvedStatus, { hasUnseenLikes, hasExpired })
		: null;

	return (
		<GlobalStatusContext.Provider value={{ status }}>
			{children}
		</GlobalStatusContext.Provider>
	);
}

/** A status given by hand instead of resolved from the server, for showing the indicator outside the app (the components showcase). */
export function GlobalStatusPreviewProvider({
	status,
	children,
}: {
	status: GlobalStatus | null;
	children: React.ReactNode;
}) {
	return (
		<GlobalStatusContext.Provider value={{ status }}>
			{children}
		</GlobalStatusContext.Provider>
	);
}

/** The user's current SendouQ/tournament status shown in the app header. */
export function useGlobalStatus() {
	return React.useContext(GlobalStatusContext);
}

/** Folds in what only the browser knows: the likes seen on this device and the group's expiry passing. */
function withClientState(
	status: GlobalStatus,
	{
		hasUnseenLikes,
		hasExpired,
	}: { hasUnseenLikes: boolean; hasExpired: boolean },
): GlobalStatus {
	// an expired group has nothing to fill or to like anymore, only to refresh
	if (hasExpired) return { state: "SQ_EXPIRED", url: status.url };

	return { ...status, countNeedsAction: hasUnseenLikes };
}
