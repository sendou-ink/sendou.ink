import * as v from "valibot";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import * as Seasons from "~/features/mmr/core/Seasons";
import { DANGEROUS_setVotingActiveOverride } from "~/features/plus-voting/core/voting-time";
import { defineAction } from "~/form/define-action.server";
import { badRequest } from "~/utils/remix.server";
import { refreshCaches } from "../core/refresh-caches.server";

const refreshCachesSchema = v.object({
	resetDevOverrides: v.optional(v.string()),
});

export const action = defineAction(
	{ body: refreshCachesSchema, onInvalidBody: "badRequest" },
	async ({ body }) => {
		if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
			badRequest();
		}

		// only the start of an e2e test asks for this. mid-test cache flushes must
		// leave what the running test set up alone
		if (body.resetDevOverrides === "true") {
			Seasons.DANGEROUS_setSeasonEndedOverride(false);
			DANGEROUS_setVotingActiveOverride(false);
		}

		await refreshCaches();

		return Response.json(null);
	},
);
