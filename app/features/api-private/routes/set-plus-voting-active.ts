import type { ActionFunctionArgs } from "react-router";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { DANGEROUS_setVotingActiveOverride } from "~/features/plus-voting/core/voting-time";

export const action = async ({ request }: ActionFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	const formData = await request.formData();
	DANGEROUS_setVotingActiveOverride(formData.get("active") === "true");

	return Response.json(null);
};
