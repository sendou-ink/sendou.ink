import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "#lib/features/admin/dev-controls.server.ts";
import * as Seasons from "#lib/features/mmr/Seasons.ts";

export const POST: RequestHandler = () => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		error(400, "Dev controls are not available");
	}

	Seasons.DANGEROUS_setSeasonEndedOverride(true);

	return json({ success: true });
};
