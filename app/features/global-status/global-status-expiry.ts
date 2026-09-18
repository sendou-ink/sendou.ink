import * as React from "react";
import type { GlobalStatus } from "./global-status-types";

/**
 * Whether a queued group has gone inactive since the server resolved the
 * status. Expiry is exactly what happens to a user who sits still, leaving no
 * navigation or event to refresh the status by, so the browser times it out.
 */
export function useHasSqGroupExpired(status: GlobalStatus | null): boolean {
	const expiresAt =
		status?.state === "SQ_QUEUED" ? status.expiresAt : undefined;

	const [hasExpired, setHasExpired] = React.useState(false);

	React.useEffect(() => {
		if (expiresAt === undefined) return;

		const msLeft = expiresAt - Date.now();
		if (msLeft <= 0) {
			setHasExpired(true);
			return;
		}

		setHasExpired(false);
		const timeout = setTimeout(() => setHasExpired(true), msLeft);

		return () => clearTimeout(timeout);
	}, [expiresAt]);

	return expiresAt !== undefined && hasExpired;
}
