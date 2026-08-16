import type { ActionFunction } from "react-router";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import * as Seasons from "~/features/mmr/core/Seasons";

export const action: ActionFunction = async () => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	Seasons.DANGEROUS_setSeasonEndedOverride(true);

	return Response.json(null);
};
