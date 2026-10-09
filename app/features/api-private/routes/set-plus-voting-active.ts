import type { ActionFunctionArgs } from "react-router";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { DANGEROUS_setVotingActiveOverride } from "~/features/plus-voting/core/voting-time";
import { badRequest } from "~/utils/remix.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		badRequest();
	}

	const formData = await request.formData();
	DANGEROUS_setVotingActiveOverride(formData.get("active") === "true");

	return Response.json(null);
};
