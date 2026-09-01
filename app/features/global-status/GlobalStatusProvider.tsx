import * as React from "react";

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
 * Holds the user's current SendouQ/tournament status shown in the app header.
 * For now the status is only set from the components showcase page; real
 * statuses resolved server-side arrive in a later iteration.
 */
export function GlobalStatusProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [status, setStatus] = React.useState<GlobalStatus | null>(null);

	return (
		<GlobalStatusContext.Provider value={{ status, setStatus }}>
			{children}
		</GlobalStatusContext.Provider>
	);
}

/** The user's current SendouQ/tournament status shown in the app header. */
export function useGlobalStatus() {
	return React.useContext(GlobalStatusContext);
}
