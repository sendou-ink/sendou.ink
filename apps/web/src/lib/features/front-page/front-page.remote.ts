import * as UserRepository from "#lib/features/user-page/UserRepository.server.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";
import { prerender, query } from "$app/server";

// xxx: is this really something needed? (other places too)
// prerendered data would be baked from the build machine's database, so the
// e2e build keeps this as a regular query against the per-worker test dbs
export const getPatrons = IS_E2E_TEST_RUN
	? query(findPatrons)
	: prerender(findPatrons);

function findPatrons() {
	return UserRepository.findAllPatrons();
}
