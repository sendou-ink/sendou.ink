import * as v from "valibot";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { DANGEROUS_setVotingActiveOverride } from "~/features/plus-voting/core/voting-time";
import { defineAction } from "~/form/define-action.server";
import { badRequest } from "~/utils/remix.server";

const setPlusVotingActiveSchema = v.object({
	active: v.optional(v.string()),
});

export const action = defineAction(
	{ body: setPlusVotingActiveSchema, onInvalidBody: "badRequest" },
	async ({ body }) => {
		if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
			badRequest();
		}

		DANGEROUS_setVotingActiveOverride(body.active === "true");

		return Response.json(null);
	},
);
