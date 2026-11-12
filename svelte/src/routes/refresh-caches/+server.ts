import { error } from "@sveltejs/kit";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import type { RequestHandler } from "./$types";

/** E2E workers call this after writing test data straight into the database file. Covers the in-process caches this server holds. */
export const POST: RequestHandler = async () => {
	if (!IS_E2E_TEST_RUN) error(404, "Not Found");

	await refreshBannedCache();

	return new Response(null, { status: 204 });
};
