import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import * as Seasons from "~/features/mmr/core/Seasons";
import { defineAction } from "~/form/define-action.server";
import { badRequest } from "~/utils/remix.server";

export const action = defineAction(async () => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		badRequest();
	}

	Seasons.DANGEROUS_setSeasonEndedOverride(true);

	return Response.json(null);
});
