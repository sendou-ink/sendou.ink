import { resetFactories } from "~/db/seed/core/defineFactory";
import { deleteAllRows } from "~/db/wipe";
import { markDatabaseClean } from "~/db/write-tracker";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";

/**
 * Deletes all rows except migration bookkeeping. `app/test-setup.ts` runs it after every writing
 * vitest test and the e2e reset fixture before every test; call by hand only to wipe *within* a test.
 */
export const dbReset = async () => {
	await deleteAllRows();

	resetFactories();
	clearAllTournamentDataCache();
	// last, because the deletes above are themselves writes
	markDatabaseClean();
};
