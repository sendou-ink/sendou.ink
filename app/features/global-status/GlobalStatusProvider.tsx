import * as React from "react";
import {
	useEventStreamCatchUp,
	useServerEventListener,
} from "~/features/events/events-hooks";
import { useLayoutData } from "~/features/layout/LayoutDataProvider";
import { useBackgroundResource } from "~/hooks/useBackgroundResource";
import type { SerializeFrom } from "~/utils/remix";
import { STATUS_DATA_ROUTE } from "~/utils/urls";
import { useHasUnseenSqLikes } from "./global-status-likes-seen";
import type { loader } from "./routes/api.status";

export type GlobalStatusState =
	| "SQ_PREPARING"
	| "SQ_QUEUED"
	| "SQ_READY_CHECK"
	| "SQ_MATCH"
	| "SQ_AWAITING_REPORT"
	| "TO_CHECKIN"
	| "TO_MATCH"
	| "TO_WAITING_FOR_MATCH"
	| "TO_WAITING_FOR_CAST";

export interface GlobalStatus {
	state: GlobalStatusState;
	/** Page the indicator links to e.g. the SendouQ match page. */
	url: string;
	/** Logo shown instead of the default state icon, e.g. the tournament's logo. */
	logoUrl?: string;
	/** Current SendouQ group fill shown after the state text, e.g. 2/4 members. */
	groupSize?: { members: number; max: number };
	/** Count shown as a badge e.g. likes received while in queue. */
	count?: number;
	/** Highlights the count badge when it calls for the user's attention. */
	countNeedsAction?: boolean;
	/** SendouQ group the queued status belongs to, scoping the likes seen tracking. */
	groupId?: number;
}

interface GlobalStatusContextValue {
	status: GlobalStatus | null;
	setStatus: (status: GlobalStatus | null) => void;
}

const GlobalStatusContext = React.createContext<GlobalStatusContextValue>({
	status: null,
	setStatus: () => {},
});

/**
 * Serves the user's current SendouQ/tournament status shown in the app header
 * and keeps it fresh push-first: the layout data seeds the first paint, then a
 * refetch of the status's own resource route whenever the server publishes
 * over the shared SSE connection that the user's status changed. The refetch
 * happens without jitter — the events fan out to at most the 8 players of a
 * match — so the header moves together with the page's own revalidation.
 */
export function GlobalStatusProvider({
	user,
	children,
}: {
	user?: { id: number } | null;
	children: React.ReactNode;
}) {
	const [override, setOverride] = React.useState<
		GlobalStatus | null | undefined
	>(undefined);
	const { globalStatus: layoutStatus } = useLayoutData();
	const { data, refresh } =
		useBackgroundResource<SerializeFrom<typeof loader>>(STATUS_DATA_ROUTE);

	const loggedIn = Boolean(user);

	useEventStreamCatchUp({
		enabled: loggedIn,
		onCatchUp: refresh,
	});

	// xxx: play a sound on transitions into SQ_READY_CHECK / SQ_MATCH / TO_MATCH
	// so they are heard anywhere on the site; move the page-local triggers
	// (useServerRevalidationEvents' sound, useMatchReadySound) here to not double up

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

	const status =
		override !== undefined
			? override
			: resolvedStatus
				? { ...resolvedStatus, countNeedsAction: hasUnseenLikes }
				: null;

	return (
		<GlobalStatusContext.Provider value={{ status, setStatus: setOverride }}>
			{children}
		</GlobalStatusContext.Provider>
	);
}

/**
 * The user's current SendouQ/tournament status shown in the app header.
 * `setStatus` overrides the server-resolved status; used by the components
 * showcase.
 */
export function useGlobalStatus() {
	return React.useContext(GlobalStatusContext);
}
