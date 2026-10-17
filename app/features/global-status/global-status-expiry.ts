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

	const [expiredAt, setExpiredAt] = React.useState<number | null>(null);

	React.useEffect(() => {
		if (expiresAt === undefined) return;

		const msLeft = Math.max(0, expiresAt - Date.now());
		const timeout = setTimeout(() => setExpiredAt(expiresAt), msLeft);

		return () => clearTimeout(timeout);
	}, [expiresAt]);

	return expiresAt !== undefined && expiredAt === expiresAt;
}
