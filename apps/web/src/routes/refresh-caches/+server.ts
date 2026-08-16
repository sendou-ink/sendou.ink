import { error, json } from "@sveltejs/kit";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "#lib/features/admin/dev-controls.server.ts";
import { refreshBannedCache } from "#lib/features/ban/banned.server.ts";
import * as Seasons from "#lib/features/mmr/Seasons.ts";
import { cache } from "#lib/server/cache.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		error(400, "Dev controls are not available");
	}

	const form = new URLSearchParams(await request.text());
	if (form.get("resetDevOverrides") === "true") {
		Seasons.DANGEROUS_setSeasonEndedOverride(false);
	}

	cache.clear();
	await refreshBannedCache();

	return json({ success: true });
};
