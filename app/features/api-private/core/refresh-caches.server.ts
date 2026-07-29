import { refreshApiTokensCache } from "~/features/api-public/api-public-utils.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { refreshTentativeTiersCache } from "~/features/tournament-organization/core/tentativeTiers.server";
import { cache } from "~/utils/cache.server";

/**
 * Clears and refreshes every in-process cache, so the server serves what is in
 * the database right now. E2E workers call this (via the route) after writing
 * test data straight into the database file.
 */
export async function refreshCaches() {
	clearAllTournamentDataCache();
	cache.clear();
	await refreshBannedCache();
	await refreshSendouQInstance();
	await refreshTentativeTiersCache();
	await refreshApiTokensCache();
}
