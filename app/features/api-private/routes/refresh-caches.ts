import type { ActionFunctionArgs } from "react-router";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import * as Seasons from "~/features/mmr/core/Seasons";
import { DANGEROUS_setVotingActiveOverride } from "~/features/plus-voting/core/voting-time";
import { refreshCaches } from "../core/refresh-caches.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	// only the start of an e2e test asks for this. mid-test cache flushes must
	// leave what the running test set up alone
	if (await wantsDevOverridesReset(request)) {
		Seasons.DANGEROUS_setSeasonEndedOverride(false);
		DANGEROUS_setVotingActiveOverride(false);
	}

	await refreshCaches();

	return Response.json(null);
};

async function wantsDevOverridesReset(request: Request) {
	if (!request.headers.get("content-type")) return false;

	return (await request.formData()).get("resetDevOverrides") === "true";
}
